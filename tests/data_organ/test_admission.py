import math
from dataclasses import replace

import pytest

from src.data_organ.contracts import validate_observation


def ingest(evidence, rows=None, **kwargs):
    svc, cap, raw, original = evidence
    return svc.ingest(
        "org-1",
        cap,
        raw,
        rows if rows is not None else original,
        window=["2025-01-01", "2025-02-28"],
        **kwargs,
    )


def test_admission_mapping_is_sealed_before_signal_append(evidence, monkeypatch):
    svc, _, _, _ = evidence
    original = svc.store.append

    def verify_before(*args, **kwargs):
        assert svc.registry.entries("org-1", "ADMISSION")
        assert svc.registry.entries("org-1", "SIGNAL_MAPPING")
        return original(*args, **kwargs)

    monkeypatch.setattr(svc.store, "append", verify_before)
    result = ingest(evidence)
    assert result["admitted"] == 1
    assert not svc.registry.entries("org-2")
    history = svc.store.history("org-1", as_of="2025-03-01T12:00:00Z")
    refs = svc.store.admission_references("org-1", history)
    assert refs[0]["admission_id"] == result["admission_id"]


@pytest.mark.parametrize(
    "attack", ["future", "naive", "nan", "missing", "duplicate", "conflict"]
)
def test_bad_observations_are_quarantined_without_cleaning_history(evidence, attack):
    _, _, _, original = evidence
    row = dict(original[0])
    if attack == "future":
        row["available_at"] = "2030-01-01T00:00:00Z"
    if attack == "naive":
        row["available_at"] = "2025-02-01T12:00:00"
    if attack == "nan":
        row["value"] = math.nan
    if attack == "missing":
        row.pop("field")
    if attack == "conflict":
        row["value"] = 5.0
    result = ingest(evidence, [original[0], row])
    assert result["quarantined"] == 1
    assert result["admitted"] == 1
    svc = evidence[0]
    assert svc.registry.entries("org-1", "ADMISSION")[0]["payload"]["quarantine"]


def test_source_substitution_and_missing_grant_retain_evidence(evidence):
    svc, cap, raw, rows = evidence
    ingest(evidence)
    with pytest.raises(ValueError, match="byte substitution"):
        svc.ingest(
            "org-1", cap, raw + b"changed", rows, window=["2025-01-01", "2025-02-28"]
        )
    restricted = replace(cap, licence={"status": "UNVERIFIED", "permitted_uses": []})
    with pytest.raises(PermissionError):
        svc.ingest(
            "org-1",
            restricted,
            raw,
            rows,
            window=["2025-01-01", "2025-02-28"],
            require_public=True,
        )
    assert len(svc.registry.entries("org-1", "ADMISSION")) == 1
    assert len(svc.registry.entries("org-1", "ATTEMPT_FAILED")) == 2


def test_capture_only_cannot_invent_publication_clock(evidence):
    _, cap, _, rows = evidence
    with pytest.raises(ValueError, match="backdate"):
        validate_observation(rows[0], replace(cap, clock_quality="CAPTURE_ONLY"))


def test_interrupted_append_recovers_idempotently_and_retains_failure(
    evidence, monkeypatch
):
    svc = evidence[0]
    original = svc.store.append

    def crash(*args, **kwargs):
        raise OSError("interrupted Parquet write")

    monkeypatch.setattr(svc.store, "append", crash)
    with pytest.raises(OSError):
        ingest(evidence)
    assert not svc.registry.entries("org-1", "ATTEMPT_COMPLETED")
    monkeypatch.setattr(svc.store, "append", original)
    assert svc.recover("org-1") == 1
    assert svc.recover("org-1") == 0
    assert len(svc.registry.entries("org-1", "ATTEMPT_FAILED")) == 1


def test_repeated_partial_scan_keeps_stable_issue_and_distinct_events(evidence):
    svc, cap, raw, rows = evidence
    bad = {**rows[0], "value": float("nan")}
    kwargs = {"window": ["2025-01-01", "2025-02-28"]}
    first = svc.ingest("org-1", cap, raw, [*rows, bad], **kwargs)
    second = svc.ingest("org-1", cap, raw, [*rows, bad], **kwargs)
    assert first["admission_id"] == second["admission_id"]
    assert first["status"] == second["status"] == "PARTIAL"
    events = svc.registry.entries("org-1", "ISSUE_EVENT")
    assert len(events) == 2
    assert events[0]["payload"]["issue_id"] == events[1]["payload"]["issue_id"]
    assert events[0]["identity"] != events[1]["identity"]
    assert len(svc.registry.entries("org-1", "ATTEMPT_COMPLETED")) == 2
    assert not svc.registry.entries("org-1", "ATTEMPT_FAILED")
