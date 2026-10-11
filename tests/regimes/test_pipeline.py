"""End-to-end: Data Organ admission -> series plugins -> registry -> snapshot -> matrix."""

import json

import pytest

from scripts import collect_regime_inputs as collector
from src.regimes import matrix
from src.regimes.service import Pipeline
from tests.regimes.fixtures import write_factor_captures

CUTOFF = "2026-10-11T00:00:00Z"


@pytest.fixture(scope="module")
def pipeline(tmp_path_factory):
    root = tmp_path_factory.mktemp("regime-pipeline")
    write_factor_captures(root / "captures")
    collector.collect(root / "runtime", directory=root / "captures")
    pipe = Pipeline(root / "runtime")
    runs = {asset: pipe.run_market(asset, CUTOFF) for asset in ("US-MKT", "IN-MKT")}
    return pipe, runs


def test_end_to_end_runs_seal_without_any_holdout(pipeline):
    pipe, runs = pipeline
    for asset, by_key in runs.items():
        assert {r["status"] for r in by_key.values()} <= {"COMPUTED", "PARTIAL"}
        assert all(r["holdout_openings"] == 0 for r in by_key.values())
    assert pipe.registry.opening_count(pipe.tenant_id) == 0
    assert "HOLDOUT_OPENED" not in {e["event"] for e in pipe.registry.events(pipe.tenant_id)}


def test_rerun_reuses_sealed_results(pipeline):
    pipe, runs = pipeline
    again = pipe.run_market("US-MKT", CUTOFF)
    assert {k: v["run_id"] for k, v in again.items()} == {k: v["run_id"] for k, v in runs["US-MKT"].items()}


def test_us_snapshot_is_market_factor_labelled_with_verified_lineage(pipeline):
    pipe, _ = pipeline
    snap = pipe.snapshot("US-MKT", CUTOFF)
    json.dumps(snap, allow_nan=False)
    assert snap["market"] == "US MARKET-FACTOR REGIME" and "not SPY" in snap["not_a"]
    assert all(c["status"] == "VERIFIED" for c in snap["lineage"].values())
    assert snap["module_statuses"]["volatility"]["status"] in {"AVAILABLE", "PARTIAL"}
    assert snap["module_statuses"]["coupling"]["status"] == "AVAILABLE"
    assert snap["module_statuses"]["events"]["status"] == "UNAVAILABLE"
    assert snap["module_statuses"]["seasonality"]["status"] == "UNAVAILABLE"
    assert snap["module_statuses"]["factors"]["status"] == "PARTIAL"
    assert snap["evidence_quality"]["weakest"] == "CAPTURE_ONLY"
    assert all(v is False for v in snap["claims"].values())
    assert snap["fracture"]["score"] is None and snap["fracture"]["coverage"] == pytest.approx(1 / 6)


def test_india_snapshot_is_partial_observation_step_and_stale(pipeline):
    pipe, _ = pipeline
    snap = pipe.snapshot("IN-MKT", CUTOFF)
    kinds = {i["kind"] for i in snap["issues"]}
    assert {"CALENDAR_UNAVAILABLE", "STALE_INPUT", "EVENT_STREAM_UNAVAILABLE"} <= kinds
    assert snap["observation_unit"] == "observation"
    assert snap["module_statuses"]["hmm"]["status"] == "PARTIAL"
    assert "per observed record" in snap["module_statuses"]["hmm"]["reason"]
    assert "INDIA INTRADAY SEASONALITY" in snap["module_statuses"]["seasonality"]["reason"]
    assert snap["runs"]["hmm2"]["diagnostics"]["duration_unit"] == "observations"
    momentum = snap["runs"]["momentum"]["diagnostics"]
    assert "observation-index approximation" in momentum["index_label"]
    assert snap["market"] == "INDIA MARKET-FACTOR REGIME" and "not NIFTY 50" in snap["not_a"]


def test_module6_signal_panel_is_not_a_return_and_carries_no_verdict(pipeline):
    pipe, runs = pipeline
    diagnostics = runs["US-MKT"]["momentum"]["diagnostics"]
    for summary in diagnostics["signal_by_state"].values():
        assert set(summary) <= {"n", "mean", "median", "positive_fraction", "mad", "sd"}
    assert "cross-sectional momentum-factor diagnostic" in diagnostics["mom_factor_semantics"]
    assert "Not the return of the 12-1" in diagnostics["mom_factor_semantics"]
    assert "INCONCLUSIVE" not in json.dumps(diagnostics)


def test_matrix_keeps_rows_at_their_own_state_at_and_never_fills(pipeline):
    pipe, _ = pipeline
    snaps = [pipe.snapshot(a, CUTOFF) for a in ("US-MKT", "IN-MKT")]
    snaps[1]["state_at"] = "2001-11-30T00:00:00+00:00"
    built = matrix.build(snaps)
    assert [r["state_at"] for r in built["rows"]] == [snaps[0]["state_at"], "2001-11-30T00:00:00+00:00"]
    assert built["rows"][1]["cells"]["event_pressure"]["status"] == "UNAVAILABLE"
    assert built["rows"][1]["cells"]["event_pressure"]["value"] is None
    history = built["summaries"]["historical_agreement"][0]
    assert history["overlapping_dates"] > 0 and "no fill" in history["method"]
    assert "causal" in built["semantics"]


def test_broken_admission_binding_makes_modules_unavailable(pipeline, tmp_path):
    import shutil

    pipe, _ = pipeline
    copy = tmp_path / "runtime"
    shutil.copytree(pipe.runtime, copy)
    broken = Pipeline(copy)
    with broken.store.connection() as db:
        identity = db.execute("SELECT identity FROM signal_admissions WHERE tenant=? LIMIT 1", [broken.tenant_id]).fetchone()[0]
        db.execute("UPDATE signal_admissions SET hash=? WHERE tenant=? AND identity=?", ["0" * 64, broken.tenant_id, identity])
    snap = broken.snapshot("US-MKT", CUTOFF)
    statuses = {k: v["status"] for k, v in snap["module_statuses"].items()}
    invalid = [k for k, c in snap["lineage"].items() if c["status"] == "INVALID"]
    assert invalid and "INPUT_LINEAGE_INVALID" in {i["kind"] for i in snap["issues"]}
    assert "UNAVAILABLE" in statuses.values()
