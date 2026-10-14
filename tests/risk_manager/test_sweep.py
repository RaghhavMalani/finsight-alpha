from pathlib import Path
from src.risk_manager.sweep import run
from src.risk_manager.evidence import freeze_inventory
from src.risk_manager.contracts import CLAIMS

ROOT = Path(__file__).resolve().parents[2]


def test_memory_only_genesis_has_no_artifact_writes(preflight):
    snapshot = freeze_inventory(ROOT)
    assert preflight["status"] == "PARTIAL"
    assert preflight["writes"] == 0
    assert freeze_inventory(ROOT) == snapshot
    proofs = preflight["operation_proofs"]
    assert proofs["before_inventory_sha256"] == proofs["after_inventory_sha256"]
    assert all(proofs[x] == 0 for x in ["provider_captures", "model_runs", "plugin_runs", "series_runs",
                                     "factor_fits", "research_attempts", "holdout_openings", "simulator_runs"])


def test_identical_memory_evidence_is_a_noop(monkeypatch):
    import src.risk_manager.sweep as s
    before = (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes()
    monkeypatch.setattr(s, "previous", lambda root, manifest: (None, None, None, None, []))
    # Keep this fixture stable while independent source review edits the evaluator.
    source_hash = s.evaluator_hash(ROOT)
    monkeypatch.setattr(s, "evaluator_hash", lambda root: source_hash)
    first = s.run(ROOT, publish_artifacts=False)
    assert first["status"] == "PARTIAL"
    monkeypatch.setattr(s, "previous", lambda root, manifest: (
        first["state_ref"], "risk:sweep:" + "a" * 64, first["state"], first["receipt"],
        first["receipt"]["payload"]["observations"]))
    result = s.run(ROOT, publish_artifacts=False)
    assert result["status"] == "UNCHANGED"
    assert result["writes"] == 0 and not result["manifest_rewrite"]
    assert result["new_occurrences"] == 0
    assert all(v == 0 for v in result["transitions"].values())
    assert (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes() == before


def test_failed_sweep_retains_state_without_empty_success(monkeypatch):
    import src.risk_manager.sweep as s
    def fail(_):
        raise FileNotFoundError("SYNTHETIC_TEST_ONLY reader failure")
    monkeypatch.setattr(s, "freeze_inventory", fail)
    failures = []
    result = s.run(ROOT, publish_artifacts=False, failure_sink=failures.append)
    assert result["status"] == "FAILED"
    failure = failures[0]["payload"]
    assert failure["failure"]["issue"]["status"] == "OPEN"
    assert failure["transition_counts"]["resolved"] == 0
    assert failure["state_ref"] == result["state_ref"]
    assert failure["state_ref"] is not None
    assert failure["status"] == "FAILED"
    assert failure["failure"]["issue"]["claim_flags"] == CLAIMS
