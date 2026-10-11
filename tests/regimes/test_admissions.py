"""Phase 5 admissions reuse the Data Organ under its own tenant and window."""

import json

import pytest

from scripts import collect_regime_inputs as collector
from src.regimes.lineage import JournalIndex, verify_source_bindings
from src.regimes.profile import profile
from tests.regimes.fixtures import write_factor_captures

TENANT = "public-regime-evidence"


@pytest.fixture(scope="module")
def admitted(tmp_path_factory):
    root = tmp_path_factory.mktemp("regime-admissions")
    write_factor_captures(root / "captures")
    service, results = collector.collect(root / "runtime", directory=root / "captures")
    return root, service, results


def test_both_markets_admit_from_the_common_window_with_full_coverage_reported(admitted):
    root, service, results = admitted
    assert {r["asset"] for r in results if r.get("status") == "ADMITTED"} == {"US-MKT", "IN-MKT"}
    assert all(r["window"][0] == "2000-01-01" for r in results)
    coverage = service.registry.entries(TENANT, "LIBRARY_COVERAGE")
    first = {c["payload"]["asset"]: c["payload"]["library"]["mkt"]["first"] for c in coverage if "mkt" in c["payload"]["library"]}
    assert first == {"US-MKT": "1999-06-01", "IN-MKT": "1999-06-01"}
    signals = service.store.history(TENANT, as_of="2026-10-11T00:00:00Z", names=["mkt"])
    assert min(s.observed_at.date().isoformat() for s in signals) >= "2000-01-01"


def test_capture_only_availability_is_the_capture_clock(admitted):
    _, service, _ = admitted
    signals = service.store.history(TENANT, as_of="2026-10-11T00:00:00Z")
    assert {s.available_at.isoformat() for s in signals} == {"2026-10-10T06:00:00+00:00"}
    assert not service.store.history(TENANT, as_of="2026-10-10T05:59:59Z")


def test_india_calendar_stays_unavailable_without_xbom_or_weekday_substitution(admitted):
    _, service, _ = admitted
    diagnostics = [
        d["payload"] for d in service.registry.entries(TENANT, "DIAGNOSTIC")
        if d["payload"]["source"] == "iima:daily-factors"
    ]
    assert diagnostics and all(d["status"] == "PARTIAL" for d in diagnostics)
    assert all(d["calendar_status"] == "UNAVAILABLE" for d in diagnostics)
    versions = [v["payload"] for v in service.registry.entries(TENANT, "SOURCE_VERSION") if v["payload"]["source"] == "iima:daily-factors"]
    assert all(v["calendar"].get("mic") == "XNSE" and v["calendar"]["status"] == "UNAVAILABLE" for v in versions)


def test_phase3_tenant_and_profile_are_not_touched(admitted):
    _, service, _ = admitted
    assert not service.registry.entries("public-data-evidence")
    assert profile()["tenant"] == TENANT


def test_source_bindings_verify_and_substitution_fails(admitted):
    _, service, _ = admitted
    from finsight.plugins.series import admission_bindings

    rows = service.store.history(TENANT, as_of="2026-10-11T00:00:00Z", names=["mkt"], asset="US-MKT")
    bindings = admission_bindings(service.store, TENANT, rows)
    index = JournalIndex(service.registry, TENANT)
    summary = verify_source_bindings(index, bindings)
    (item,) = summary.values()
    assert item["clock_quality"] == "CAPTURE_ONLY" and item["licence_decision"]["status"] == "ACTIVE"
    assert item["signals"] == len(rows)
    forged = dict(bindings)
    key = next(iter(forged))
    forged[key] = {**forged[key], "capture_sha256": "0" * 64}
    with pytest.raises(ValueError):
        verify_source_bindings(index, forged)


def test_changed_source_bytes_fail_closed_and_retain_prior_evidence(tmp_path):
    write_factor_captures(tmp_path / "captures")
    raw = (tmp_path / "captures" / "iima-daily.csv").read_bytes()
    (tmp_path / "captures" / "iima-daily.csv").write_bytes(raw + b"\n")
    service, results = collector.collect(tmp_path / "runtime", directory=tmp_path / "captures")
    india = [r for r in results if r["asset"] == "IN-MKT"]
    assert india[0]["status"] == "UNAVAILABLE"
    failures = service.registry.entries(TENANT, "ATTEMPT_FAILED")
    assert any(f["payload"]["source"] == "iima:daily-factors" for f in failures)


def test_repeated_identical_capture_is_idempotent(tmp_path):
    write_factor_captures(tmp_path / "captures")
    service, _ = collector.collect(tmp_path / "runtime", directory=tmp_path / "captures")
    count = len(service.store.history(TENANT, as_of="2026-10-11T00:00:00Z"))
    before = collector.content_fingerprint(service, TENANT)
    service, _ = collector.collect(tmp_path / "runtime", directory=tmp_path / "captures")
    assert len(service.store.history(TENANT, as_of="2026-10-11T00:00:00Z")) == count
    assert collector.content_fingerprint(service, TENANT) == before
