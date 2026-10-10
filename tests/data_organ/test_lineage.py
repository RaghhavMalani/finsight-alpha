import pytest

from src.data_organ.lineage import inspect_lineage
from tests.data_organ.test_admission import ingest


def test_full_lineage_verifies_bytes_and_tenant_boundary(evidence):
    svc = evidence[0]
    result = ingest(evidence)
    signal = svc.registry.entries("org-1", "SIGNAL_MAPPING")[0]["identity"]
    view = inspect_lineage(
        svc.registry, "org-1", signal, raw_directory=svc.raw_directory
    )
    assert view["status"] == "VERIFIED"
    assert view["admission_id"] == result["admission_id"]
    assert view["schema_hash"] and view["licence_resolution_hash"]
    assert inspect_lineage(svc.registry, "org-2", signal)["status"] == "UNAVAILABLE"
    (svc.raw_directory / (view["capture_sha256"] + ".bin")).write_bytes(b"substituted")
    with pytest.raises(ValueError):
        inspect_lineage(svc.registry, "org-1", signal, raw_directory=svc.raw_directory)


def test_journal_and_store_admission_substitution_fail_closed(evidence):
    svc = evidence[0]
    ingest(evidence)
    with svc.registry.connection() as db:
        db.execute("UPDATE journal SET payload='{}' WHERE kind='ADMISSION'")
    with pytest.raises(ValueError, match="tampering"):
        svc.registry.entries("org-1")


def test_store_mapping_hash_is_checked_at_execution(evidence):
    svc = evidence[0]
    ingest(evidence)
    signals = svc.store.history("org-1", as_of="2025-03-01T12:00:00Z")
    with svc.store.connection() as db:
        db.execute("UPDATE signal_admissions SET payload='{}'")
    with pytest.raises(ValueError, match="substitution"):
        svc.store.admission_references("org-1", signals)
