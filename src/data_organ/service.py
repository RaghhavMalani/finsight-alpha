"""Operator-driven admission. GETs never fetch; failures retain previous evidence."""

import uuid
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from finsight.plugins import Signal
from src.truth.contracts import canonical_hash

from .contracts import preserved_json, public_metadata, validate_observation
from .diagnostics import health


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Service:
    def __init__(self, registry, raw_directory, store=None, organization_id=None):
        self.organization_id = organization_id
        self.registry, self.raw_directory, self.store = (
            registry,
            Path(raw_directory),
            store,
        )

    def issue(self, tenant_id, source, kind, reason, evidence_id):
        issue_id = canonical_hash([source, kind, reason])
        self.registry.append(
            tenant_id,
            "ISSUE_EVENT",
            uuid.uuid4().hex,
            {
                "issue_id": issue_id,
                "source": source,
                "kind": kind,
                "reason": reason,
                "status": "OPEN",
                "at": now(),
                "evidence": [evidence_id],
            },
        )

    def metadata_attempt(self, result):
        if self.organization_id is not None:
            from src.data.pipeline_health import record_data_organ_attempt

            record_data_organ_attempt(self.organization_id, result)

    def unavailable(self, tenant_id, source, reason):
        identity = uuid.uuid4().hex
        self.issue(tenant_id, source, "SOURCE_ATTEMPT_FAILED", reason, identity)
        self.metadata_attempt(
            {
                "source": source,
                "status": "UNAVAILABLE",
                "reason": reason,
                "retained_prior_evidence": True,
            }
        )
        return self.registry.append(
            tenant_id,
            "ATTEMPT_FAILED",
            identity,
            {
                "source": source,
                "at": now(),
                "status": "UNAVAILABLE",
                "reason": reason,
                "retained_prior_evidence": True,
            },
        )

    def ingest(self, tenant_id, capture, raw, rows, *, window, require_public=False):
        attempt = uuid.uuid4().hex
        self.registry.append(
            tenant_id,
            "ATTEMPT_STARTED",
            attempt,
            {
                "source": capture.source,
                "at": now(),
                "source_version_id": capture.identity,
            },
        )
        try:
            capture.verify(raw)
            if require_public and "publish_derived" not in capture.licence.get(
                "permitted_uses", []
            ):
                raise PermissionError(
                    "Publication grant unavailable; prior evidence retained"
                )
            self.raw_directory.mkdir(parents=True, exist_ok=True)
            target = self.raw_directory / (capture.content_sha256 + ".bin")
            if (
                target.exists()
                and sha256(target.read_bytes()).hexdigest() != capture.content_sha256
            ):
                raise ValueError("Retained capture bytes changed")
            if not target.exists():
                target.write_bytes(raw)
            self.registry.append(
                tenant_id, "SOURCE_VERSION", capture.identity, capture.to_dict()
            )
            admitted, quarantined, seen = [], [], {}
            for position, row in enumerate(rows):
                if (
                    row.get("observed_at")
                    and not window[0] <= row["observed_at"][:10] <= window[1]
                ):
                    continue
                try:
                    normalized = validate_observation(row, capture)
                    key = canonical_hash(
                        {k: v for k, v in normalized.items() if k != "value"}
                    )
                    if key in seen:
                        raise ValueError("Duplicate/conflicting observation identity")
                    seen[key] = normalized
                    admitted.append(normalized)
                except (ValueError, TypeError, KeyError) as error:
                    quarantined.append(
                        {
                            "position": position,
                            "row": preserved_json(row),
                            "reason": str(error),
                        }
                    )
            contract = {
                "tenant_id": tenant_id,
                "source_version_id": capture.identity,
                "capture_sha256": capture.content_sha256,
                "schema_hash": canonical_hash(capture.schema),
                "licence_resolution_hash": canonical_hash(capture.licence),
                "window": list(window),
                "observations": admitted,
                "quarantine": quarantined,
            }
            admission_id = canonical_hash(contract)
            admission = self.registry.append(
                tenant_id, "ADMISSION", admission_id, contract
            )
            bindings, signals = [], []
            for row in admitted:
                signal = Signal(
                    tenant_id,
                    row["field"],
                    row["asset"],
                    row["value"],
                    row["observed_at"],
                    row["available_at"],
                    capture.source,
                    capture.licence.get("status", "UNVERIFIED"),
                    capture.identity,
                    unit=capture.unit,
                )
                binding = {
                    "signal_id": signal.identity,
                    "signal_sha256": canonical_hash(signal.payload()),
                    "admission_id": admission_id,
                    "admission_seal": admission["hash"],
                    "source_version_id": capture.identity,
                    "capture_sha256": capture.content_sha256,
                    "schema_hash": canonical_hash(capture.schema),
                    "licence_resolution_hash": canonical_hash(capture.licence),
                }
                signals.append(signal)
                bindings.append(binding)
            self.registry.append_many(
                tenant_id, "SIGNAL_MAPPING", [(b["signal_id"], b) for b in bindings]
            )
            # Admission + mappings are sealed before a potentially interrupted Parquet write.
            if self.store is not None and signals:
                self.store.append(tenant_id, signals, admissions=bindings)
            diagnostic = health(
                rows, capture, start=window[0], end=window[1], quarantined=quarantined
            )
            self.registry.append(
                tenant_id, "DIAGNOSTIC", diagnostic["diagnostic_id"], diagnostic
            )
            if diagnostic["status"] == "PARTIAL":
                self.issue(
                    tenant_id,
                    capture.source,
                    "PARTIAL_SOURCE_HEALTH",
                    diagnostic["calendar_reason"] or "Quarantined invalid observations",
                    diagnostic["diagnostic_id"],
                )
            result = {
                "source": capture.source,
                "status": "PARTIAL" if quarantined else "ADMITTED",
                "admission_id": admission_id,
                "admitted": len(admitted),
                "quarantined": len(quarantined),
                "at": now(),
            }
            self.registry.append(tenant_id, "ATTEMPT_COMPLETED", attempt, result)
            self.metadata_attempt(result)
            return result
        except Exception as error:
            self.issue(
                tenant_id, capture.source, "SOURCE_ATTEMPT_FAILED", str(error), attempt
            )
            self.metadata_attempt(
                {
                    "source": capture.source,
                    "status": "UNAVAILABLE",
                    "reason": str(error),
                }
            )
            self.registry.append(
                tenant_id,
                "ATTEMPT_FAILED",
                attempt,
                {
                    "source": capture.source,
                    "at": now(),
                    "status": "UNAVAILABLE",
                    "reason": str(error),
                    "retained_prior_evidence": True,
                },
            )
            raise

    def recover(self, tenant_id):
        if self.store is None:
            raise ValueError("A SignalStore is required for recovery")
        mappings = {
            r["identity"]: r["payload"]
            for r in self.registry.entries(tenant_id, "SIGNAL_MAPPING")
        }
        count = 0
        from .contracts import Capture

        for entry in self.registry.entries(tenant_id, "ADMISSION"):
            contract = entry["payload"]
            capture = Capture(
                **self.registry.get(
                    tenant_id, "SOURCE_VERSION", contract["source_version_id"]
                )["payload"]
            )
            signals = [
                Signal(
                    tenant_id,
                    r["field"],
                    r["asset"],
                    r["value"],
                    r["observed_at"],
                    r["available_at"],
                    capture.source,
                    capture.licence.get("status", "UNVERIFIED"),
                    capture.identity,
                    unit=capture.unit,
                )
                for r in contract["observations"]
            ]
            if signals:
                count += self.store.append(
                    tenant_id,
                    signals,
                    admissions=[mappings[s.identity] for s in signals],
                )
                self.registry.append(
                    tenant_id,
                    "RECOVERY_COMPLETED",
                    entry["identity"],
                    {
                        "admission_id": entry["identity"],
                        "source": capture.source,
                        "status": "RECOVERED",
                        "admitted": len(signals),
                    },
                )
        self.registry.append(
            tenant_id,
            "RECOVERY",
            uuid.uuid4().hex,
            {"at": now(), "signals_appended": count},
        )
        return count

    def overview(self, tenant_id):
        versions = self.registry.entries(tenant_id, "SOURCE_VERSION")
        from .contracts import Capture

        return {
            "schema_version": "data-organ-local/1",
            "sources": [public_metadata(Capture(**e["payload"])) for e in versions],
            "health": [
                e["payload"] for e in self.registry.entries(tenant_id, "DIAGNOSTIC")
            ],
            "attempts": [
                {"kind": e["kind"], **e["payload"]}
                for e in self.registry.entries(tenant_id)
                if e["kind"].startswith("ATTEMPT_")
            ],
            "raw_values": "LOCAL_ONLY",
        }
