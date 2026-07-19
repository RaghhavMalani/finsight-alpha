"""Immutable source snapshots and resilient JSON retrieval.

Every successful provider response is stored under a content hash.  API keys
are removed before request metadata is fingerprinted or persisted.  When a
provider is temporarily unavailable, callers can explicitly fall back to the
most recent snapshot for the exact same public request.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import requests

from src import config


SENSITIVE_PARAM_NAMES = {
    "api-key",
    "api_key",
    "apikey",
    "key",
    "subscription-key",
}


class ProviderUnavailable(RuntimeError):
    """Raised when neither a live response nor a matching snapshot is usable."""


@dataclass(frozen=True)
class SourceLineage:
    provider: str
    source_url: str
    snapshot_id: str
    content_hash: str
    request_fingerprint: str
    retrieved_at: str
    vintage_date: str | None = None
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

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or (config.DATA_DIR / "intelligence" / "snapshots")

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
        vintage_date: str | None = None,
    ) -> Snapshot:
        safe_params = public_params(params)
        request_id = self.request_fingerprint(provider, source_url, params)
        content_hash = hashlib.sha256(_canonical(payload)).hexdigest()
        snapshot_id = hashlib.sha256(
            f"{request_id}:{content_hash}".encode("utf-8")
        ).hexdigest()
        retrieved_at = datetime.now(timezone.utc).isoformat()
        lineage = SourceLineage(
            provider=provider,
            source_url=source_url,
            snapshot_id=snapshot_id,
            content_hash=content_hash,
            request_fingerprint=request_id,
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
        return snapshot

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
        return self._read(candidates[0]) if candidates else None

    def get(self, provider: str, snapshot_id: str) -> Snapshot | None:
        if not re.fullmatch(r"[a-f0-9]{64}", snapshot_id):
            return None
        provider_root = self.root / self._provider_slug(provider)
        if not provider_root.exists():
            return None
        matches = list(provider_root.glob(f"*/{snapshot_id}.json"))
        return self._read(matches[0]) if matches else None

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
