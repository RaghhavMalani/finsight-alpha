"""Immutable source snapshots and resilient JSON retrieval.

Every successful provider response is stored under a content hash.  API keys
are removed before request metadata is fingerprinted or persisted.  When a
provider is temporarily unavailable, callers can explicitly fall back to the
most recent snapshot for the exact same public request.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import requests

from src import config

logger = logging.getLogger(__name__)


SENSITIVE_PARAM_NAMES = {
    "api-key",
    "api_key",
    "apikey",
    "key",
    "subscription-key",
}


class ProviderUnavailable(RuntimeError):
    """Raised when neither a live response nor a matching snapshot is usable."""


class SnapshotAccessDenied(PermissionError):
    """Raised when a tenant lacks a grant for a snapshot's dataset."""


class SnapshotPersistenceError(RuntimeError):
    """Raised when production cannot durably register a snapshot."""


@dataclass(frozen=True)
class SourceLineage:
    provider: str
    source_url: str
    snapshot_id: str
    content_hash: str
    request_fingerprint: str
    retrieved_at: str
    vintage_date: str | None = None
    dataset_key: str | None = None
    cached: bool = False
    warning: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Snapshot:
    lineage: SourceLineage
    public_params: dict[str, Any]
    payload: Any


def _canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")


def public_params(params: Mapping[str, Any] | None) -> dict[str, Any]:
    """Return request parameters safe to fingerprint, persist, and display."""

    return {
        str(key): value
        for key, value in (params or {}).items()
        if str(key).lower() not in SENSITIVE_PARAM_NAMES
    }


class SnapshotStore:
    """Content-addressed JSON snapshot store."""

    def __init__(
        self,
        root: Path | None = None,
        *,
        register_metadata: bool = True,
    ) -> None:
        self.root = root or (config.DATA_DIR / "intelligence" / "snapshots")
        self.register_metadata = register_metadata

    @staticmethod
    def _provider_slug(provider: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", provider.lower()).strip("-")
        if not slug:
            raise ValueError("Provider name must contain letters or digits.")
        return slug

    @staticmethod
    def request_fingerprint(
        provider: str, source_url: str, params: Mapping[str, Any] | None
    ) -> str:
        request = {
            "provider": provider,
            "source_url": source_url,
            "params": public_params(params),
        }
        return hashlib.sha256(_canonical(request)).hexdigest()

    def record(
        self,
        provider: str,
        source_url: str,
        params: Mapping[str, Any] | None,
        payload: Any,
        *,
        dataset_key: str | None = None,
        vintage_date: str | None = None,
    ) -> Snapshot:
        safe_params = public_params(params)
        request_id = self.request_fingerprint(provider, source_url, params)
        content_hash = hashlib.sha256(_canonical(payload)).hexdigest()
        snapshot_id = hashlib.sha256(
            f"{request_id}:{content_hash}".encode("utf-8")
        ).hexdigest()
        resolved_dataset_key = dataset_key or (
            f"{self._provider_slug(provider)}:"
            f"{hashlib.sha256(source_url.encode('utf-8')).hexdigest()[:16]}"
        )
        retrieved_at = datetime.now(timezone.utc).isoformat()
        lineage = SourceLineage(
            provider=provider,
            source_url=source_url,
            snapshot_id=snapshot_id,
            content_hash=content_hash,
            request_fingerprint=request_id,
            dataset_key=resolved_dataset_key,
            retrieved_at=retrieved_at,
            vintage_date=vintage_date,
        )
        snapshot = Snapshot(lineage=lineage, public_params=safe_params, payload=payload)

        directory = self.root / self._provider_slug(provider) / request_id
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{snapshot_id}.json"
        if not path.exists():
            document = {
                "lineage": lineage.to_dict(),
                "public_params": safe_params,
                "payload": payload,
            }
            temporary = path.with_suffix(".tmp")
            temporary.write_text(
                json.dumps(document, ensure_ascii=False, sort_keys=True, default=str),
                encoding="utf-8",
            )
            temporary.replace(path)
        storage_uri = path.resolve().as_uri()
        if config.GCS_BUCKET_NAME:
            from src.data.cloud_storage_client import CloudStorageClient

            blob_name = (
                f"intelligence/snapshots/{self._provider_slug(provider)}/"
                f"{request_id}/{snapshot_id}.json"
            )
            upload = CloudStorageClient(config.GCS_BUCKET_NAME).upload_file(
                path, blob_name
            )
            if upload["success"]:
                storage_uri = f"gs://{upload['bucket']}/{upload['blob']}"
            elif config.APP_ENV == "production":
                raise SnapshotPersistenceError(
                    f"Production snapshot object persistence failed: {upload['message']}"
                )

        if self.register_metadata:
            self._record_metadata(snapshot, path, storage_uri)
        return snapshot

    def _record_metadata(
        self, snapshot: Snapshot, path: Path, storage_uri: str
    ) -> None:
        """Upsert the durable dataset catalog entry for this immutable object."""

        from sqlalchemy import select

        from src.auth.db import get_session
        from src.auth.tenant_models import Dataset, DatasetVersion

        lineage = snapshot.lineage
        if not lineage.dataset_key:
            raise SnapshotPersistenceError("Snapshot has no dataset key.")
        retrieved_at = datetime.fromisoformat(
            lineage.retrieved_at.replace("Z", "+00:00")
        )
        if retrieved_at.tzinfo is None:
            retrieved_at = retrieved_at.replace(tzinfo=timezone.utc)
        vintage = None
        if lineage.vintage_date:
            vintage = datetime.fromisoformat(
                lineage.vintage_date.replace("Z", "+00:00")
            )
            if vintage.tzinfo is None:
                vintage = vintage.replace(tzinfo=timezone.utc)
        row_count = None
        if isinstance(snapshot.payload, list):
            row_count = len(snapshot.payload)
        elif isinstance(snapshot.payload, dict):
            lengths = [
                len(value)
                for value in snapshot.payload.values()
                if isinstance(value, list)
            ]
            row_count = max(lengths, default=None)
        try:
            with get_session() as session:
                dataset = session.scalar(
                    select(Dataset).where(Dataset.dataset_key == lineage.dataset_key)
                )
                if dataset is None:
                    dataset = Dataset(
                        dataset_key=lineage.dataset_key,
                        name=lineage.dataset_key,
                        provider=lineage.provider,
                        source_url=lineage.source_url,
                        description="Immutable provider snapshot registered by FinSight.",
                        is_simulated=False,
                    )
                    session.add(dataset)
                    session.flush()
                version = session.scalar(
                    select(DatasetVersion).where(
                        DatasetVersion.dataset_id == dataset.id,
                        DatasetVersion.version_hash == lineage.snapshot_id,
                    )
                )
                if version is None:
                    session.add(
                        DatasetVersion(
                            dataset_id=dataset.id,
                            version_hash=lineage.snapshot_id,
                            upstream_version=lineage.content_hash,
                            as_of=vintage,
                            available_from=retrieved_at,
                            retrieved_at=retrieved_at,
                            schema_json={
                                "payload_type": type(snapshot.payload).__name__,
                                "request_fingerprint": lineage.request_fingerprint,
                            },
                            quality_checks=[{"check": "sha256", "status": "PASS"}],
                            storage_uri=storage_uri,
                            row_count=row_count,
                        )
                    )
                    session.commit()
        except Exception as exc:
            logger.exception(
                "Could not register snapshot metadata for %s", lineage.snapshot_id
            )
            if config.APP_ENV == "production":
                raise SnapshotPersistenceError(
                    "Production snapshot metadata persistence failed."
                ) from exc

    def latest(
        self,
        provider: str,
        source_url: str,
        params: Mapping[str, Any] | None,
    ) -> Snapshot | None:
        request_id = self.request_fingerprint(provider, source_url, params)
        directory = self.root / self._provider_slug(provider) / request_id
        candidates = sorted(
            directory.glob("*.json") if directory.exists() else [],
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        return (
            self._read(candidates[0])
            if candidates
            else self._latest_durable(request_id)
        )

    def _latest_durable(self, request_id: str) -> Snapshot | None:
        from sqlalchemy import select

        from src.auth.db import get_session
        from src.auth.tenant_models import DatasetVersion

        try:
            with get_session() as session:
                rows = session.execute(
                    select(
                        DatasetVersion.version_hash,
                        DatasetVersion.schema_json,
                    ).order_by(DatasetVersion.retrieved_at.desc())
                ).all()
        except Exception as exc:
            logger.exception("Could not resolve latest durable snapshot")
            if config.APP_ENV == "production":
                raise SnapshotPersistenceError(
                    "Production snapshot metadata lookup failed."
                ) from exc
            return None
        for version_hash, schema_json in rows:
            if (schema_json or {}).get("request_fingerprint") == request_id:
                return self._load_durable(version_hash)

    def get(
        self,
        provider: str,
        snapshot_id: str,
        *,
        organization_id: int | None = None,
    ) -> Snapshot | None:
        if not re.fullmatch(r"[a-f0-9]{64}", snapshot_id):
            return None
        provider_root = self.root / self._provider_slug(provider)
        matches = (
            list(provider_root.glob(f"*/{snapshot_id}.json"))
            if provider_root.exists()
            else []
        )
        snapshot = (
            self._read(matches[0]) if matches else self._load_durable(snapshot_id)
        )
        if snapshot is not None and self._provider_slug(
            snapshot.lineage.provider
        ) != self._provider_slug(provider):
            return None
        if snapshot is not None and organization_id is not None:
            self._authorize(snapshot, organization_id)
        return snapshot

    @staticmethod
    def _authorize(snapshot: Snapshot, organization_id: int) -> None:
        from src.data.license_policy import ACTIVE, dataset_license_status

        dataset_key = snapshot.lineage.dataset_key
        if not dataset_key:
            raise SnapshotAccessDenied(
                "Legacy snapshot has no licensable dataset identity."
            )
        grant = dataset_license_status(organization_id, dataset_key)
        permitted = grant.get("permitted_uses") or []
        if grant.get("status") != ACTIVE or "display" not in permitted:
            raise SnapshotAccessDenied(
                f"Organization {organization_id} cannot access {dataset_key}: "
                f"license status is {grant.get('status', 'UNVERIFIED')}."
            )

    def _load_durable(self, snapshot_id: str) -> Snapshot | None:
        """Recover a snapshot from its database metadata and object URI."""

        from sqlalchemy import select

        from src.auth.db import get_session
        from src.auth.tenant_models import DatasetVersion

        try:
            with get_session() as session:
                storage_uri = session.scalar(
                    select(DatasetVersion.storage_uri).where(
                        DatasetVersion.version_hash == snapshot_id
                    )
                )
        except Exception as exc:
            logger.exception("Could not resolve durable snapshot %s", snapshot_id)
            if config.APP_ENV == "production":
                raise SnapshotPersistenceError(
                    "Production snapshot metadata lookup failed."
                ) from exc
            return None
        if not storage_uri or not storage_uri.startswith("gs://"):
            return None
        location = storage_uri.removeprefix("gs://")
        bucket_name, _, blob_name = location.partition("/")
        if not bucket_name or not blob_name:
            return None
        from src.data.cloud_storage_client import CloudStorageClient

        document_text = CloudStorageClient(bucket_name).download_text(blob_name)
        if document_text is None:
            return None
        try:
            document = json.loads(document_text)
        except (TypeError, json.JSONDecodeError):
            return None
        lineage = SourceLineage(**document["lineage"])
        return Snapshot(
            lineage=lineage,
            public_params=document.get("public_params", {}),
            payload=document.get("payload"),
        )

    @staticmethod
    def _read(path: Path) -> Snapshot:
        document = json.loads(path.read_text(encoding="utf-8"))
        lineage = SourceLineage(**document["lineage"])
        return Snapshot(
            lineage=lineage,
            public_params=document.get("public_params", {}),
            payload=document.get("payload"),
        )


class ExternalJsonClient:
    """Bounded provider client with immutable snapshot fallback."""

    def __init__(
        self,
        store: SnapshotStore | None = None,
        session: requests.Session | None = None,
    ) -> None:
        self.store = store or SnapshotStore()
        self.session = session or requests.Session()

    def get(
        self,
        provider: str,
        source_url: str,
        *,
        params: Mapping[str, Any] | None = None,
        dataset_key: str,
        headers: Mapping[str, str] | None = None,
        timeout: float = 10.0,
        vintage_date: str | None = None,
        allow_snapshot: bool = True,
    ) -> tuple[Any, SourceLineage]:
        request_params = dict(params or {})
        request_headers = {
            "Accept": "application/json",
            "User-Agent": "FinSight-Alpha/0.1",
            **dict(headers or {}),
        }
        try:
            response = self.session.get(
                source_url,
                params=request_params,
                headers=request_headers,
                timeout=(3.05, timeout),
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, (dict, list)):
                raise ValueError("Provider returned a non-JSON object payload.")
            snapshot = self.store.record(
                provider,
                source_url,
                request_params,
                payload,
                vintage_date=vintage_date,
                dataset_key=dataset_key,
            )
            return snapshot.payload, snapshot.lineage
        except (requests.RequestException, ValueError, json.JSONDecodeError) as exc:
            if allow_snapshot:
                snapshot = self.store.latest(provider, source_url, request_params)
                if snapshot is not None:
                    warning = f"Live provider unavailable; using immutable snapshot ({type(exc).__name__})."
                    return snapshot.payload, replace(
                        snapshot.lineage,
                        cached=True,
                        warning=warning,
                    )
            raise ProviderUnavailable(
                f"{provider} is unavailable and no matching snapshot exists ({type(exc).__name__})."
            ) from exc
