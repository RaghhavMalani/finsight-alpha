"""Verified Signal -> admission -> source version -> captured source bytes."""

from finsight.plugins import Signal
from src.truth.contracts import canonical_hash

from .contracts import Capture, public_metadata


def inspect_lineage(registry, tenant_id, signal_id, *, raw_directory=None):
    return inspect_lineages(
        registry, tenant_id, [signal_id], raw_directory=raw_directory
    )[0]


def inspect_lineages(registry, tenant_id, signal_ids, *, raw_directory=None):
    # Verify one consistent tenant journal snapshot before joining its sealed rows.
    entries = {(e["kind"], e["identity"]): e for e in registry.entries(tenant_id)}
    return [
        _inspect(entries, tenant_id, identity, raw_directory=raw_directory)
        for identity in signal_ids
    ]


def _inspect(entries, tenant_id, signal_id, *, raw_directory):
    mapping = entries.get(("SIGNAL_MAPPING", signal_id))
    if mapping is None:
        return {
            "status": "UNAVAILABLE",
            "reason": "No sealed admission mapping for this tenant/signal",
        }
    binding = mapping["payload"]
    admission = entries.get(("ADMISSION", binding["admission_id"]))
    version = entries.get(("SOURCE_VERSION", binding["source_version_id"]))
    if (
        not admission
        or not version
        or admission["hash"] != binding["admission_seal"]
        or canonical_hash(admission["payload"]) != binding["admission_id"]
    ):
        raise ValueError("Broken source-admission mapping")
    capture = Capture(**version["payload"])
    if (
        capture.identity != binding["source_version_id"]
        or admission["payload"]["source_version_id"] != capture.identity
        or capture.content_sha256 != binding["capture_sha256"]
        or canonical_hash(capture.schema) != binding["schema_hash"]
        or canonical_hash(capture.licence) != binding["licence_resolution_hash"]
    ):
        raise ValueError("Source version/schema/licence substitution")
    matched = False
    for row in admission["payload"]["observations"]:
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
        if (
            signal.identity == signal_id
            and canonical_hash(signal.payload()) == binding["signal_sha256"]
        ):
            matched = True
            break
    if not matched:
        raise ValueError("Signal is not a member of the sealed source admission")
    if raw_directory is not None:
        capture.verify((raw_directory / (capture.content_sha256 + ".bin")).read_bytes())
    return {
        "status": "VERIFIED",
        **binding,
        "source": public_metadata(capture),
        "source_bytes": "LOCAL_ONLY",
    }
