"""Family J and D6: idempotent export, positive whitelist, fail-closed sabotage."""

import copy
import json
import shutil

import pytest

from scripts import collect_regime_inputs as collector
from scripts import export_regimes_replay as exporter
from scripts.regimes_archive import verify_addition
from src.regimes.publication import validate_public
from tests.regimes.conftest import ROOT
from tests.regimes.fixtures import write_factor_captures


@pytest.fixture(scope="module")
def published(tmp_path_factory):
    from finsight.plugins import Runner, RunRegistry

    root = tmp_path_factory.mktemp("regime-publication")
    (root / "public/artifacts/replay").mkdir(parents=True)
    shutil.copyfile(ROOT / "frontend-v2/public/replay-manifest.json", root / "public/replay-manifest.json")
    write_factor_captures(root / "captures")
    collector.collect(root / "runtime", directory=root / "captures")
    guard = pytest.MonkeyPatch()

    def forbidden(*args, **kwargs):
        raise AssertionError("Phase 5 export must never run the row runner or open a holdout")

    guard.setattr(Runner, "run", forbidden)
    guard.setattr(RunRegistry, "holdout", forbidden)
    first = exporter.export(root / "runtime", root / "public", root / "exports")
    second = exporter.export(root / "runtime", root / "public", root / "exports")
    write_factor_captures(root / "captures2", captured_at="2026-11-10T06:00:00Z", end="2002-01-31")
    collector.collect(root / "runtime", directory=root / "captures2")
    third = exporter.export(root / "runtime", root / "public", root / "exports")
    guard.undo()
    return root, first, second, third


def test_first_export_publishes_and_unchanged_evidence_runs_nothing(published):
    root, first, second, third = published
    assert first["status"] == "PUBLISHED" and first["new_runs"] == 10 and first["holdout_openings"] == 0
    assert second == {"status": "UNCHANGED", "new_runs": 0, "holdout_openings": 0}
    assert third["status"] == "PUBLISHED" and third["new_runs"] == 10


def test_every_artifact_passes_the_phase5_boundary(published):
    root = published[0]
    manifest = json.loads((root / "public/replay-manifest.json").read_bytes())
    regimes = [k for k in manifest["artifacts"] if k.startswith("regimes:")]
    assert {k.split(":")[1] for k in regimes} == {"snapshot", "timeline", "factors", "lineage", "history", "matrix"}
    for identity in regimes:
        verify_addition(root / "public", identity, manifest["artifacts"][identity])
    receipt = json.loads((root / "exports/receipt.json").read_bytes())
    assert receipt["holdout_openings"] == 0 and receipt["phase2_reference_executed"] is False
    assert set(receipt["markets"]) == {"US-MKT", "IN-MKT"}


def test_sealed_history_is_append_only_across_cutoffs(published):
    root = published[0]
    manifest = json.loads((root / "public/replay-manifest.json").read_bytes())
    identity = manifest["routes"]["/regimes/history?asset=US-MKT"]
    entry = manifest["artifacts"][identity]
    history = json.loads((root / "public" / entry["url"].lstrip("/")).read_bytes())["payload"]
    assert len(history["entries"]) == 2
    assert history["entries"][0]["as_of"] < history["entries"][1]["as_of"]
    assert "as-known-at-each-run" in history["semantics"]


def _snapshot(root):
    manifest = json.loads((root / "public/replay-manifest.json").read_bytes())
    identity = manifest["routes"]["/regimes/snapshot?asset=US-MKT"]
    entry = manifest["artifacts"][identity]
    return json.loads((root / "public" / entry["url"].lstrip("/")).read_bytes())["payload"]


def test_public_snapshot_carries_frozen_verdicts_and_market_factor_labels(published):
    payload = _snapshot(published[0])
    assert payload["market"] == "US MARKET-FACTOR REGIME"
    assert payload["frozen_research"]["verdicts"] == {
        "CROSS_MARKET": "INCONCLUSIVE",
        "ECONOMIC": "UNAVAILABLE",
        "REGIME_DEPENDENCE": "INCONCLUSIVE",
        "STATISTICAL": "INCONCLUSIVE",
    }
    momentum = json.dumps(payload["momentum"])
    assert "INCONCLUSIVE" not in momentum and "CALIBRATED" not in momentum
    assert not {"STATISTICAL", "ECONOMIC", "REGIME_DEPENDENCE", "CROSS_MARKET"} & set(payload["momentum"])
    assert payload["momentum"]["verdicts"].startswith("None.")
    assert payload["hmm"]["hmm2"]["posterior_semantics"] == "FILTERED_FORWARD_RECURSION"
    assert "settings" not in json.dumps(payload) and "contract" not in payload


@pytest.mark.parametrize(
    "mutate,match",
    [
        (lambda p: p["claims"].__setitem__("validated_alpha", True), "Claim"),
        (lambda p: p.__setitem__("tier", "LOCAL_ONLY"), "Local"),
        (lambda p: p["hmm"]["hmm2"].__setitem__("smoothed", [0.5]), "smoothed"),
        (lambda p: p["hmm"]["hmm2"].__setitem__("posterior_semantics", "FORWARD_BACKWARD"), "filtered"),
        (lambda p: p.__setitem__("calendar", {"note": "SYNTHETIC_DEMO"}), "Synthetic"),
        (lambda p: p["current"]["volatility"].__setitem__("close", 1.0), "Raw"),
    ],
)
def test_public_validator_fails_closed(published, mutate, match):
    payload = copy.deepcopy(_snapshot(published[0]))
    mutate(payload)
    with pytest.raises(ValueError, match=match):
        validate_public("snapshot", payload)


def test_changed_artifact_bytes_fail_the_boundary(published, tmp_path):
    root = published[0]
    public = tmp_path / "public"
    shutil.copytree(root / "public", public)
    manifest = json.loads((public / "replay-manifest.json").read_bytes())
    identity = manifest["routes"]["/regimes/snapshot?asset=IN-MKT"]
    path = public / manifest["artifacts"][identity]["url"].lstrip("/")
    path.write_bytes(path.read_bytes().replace(b"INDIA", b"IND1A"))
    with pytest.raises(ValueError):
        verify_addition(public, identity, manifest["artifacts"][identity])


def test_fresh_scheduler_runtime_with_identical_source_bytes_computes_nothing(tmp_path):
    """D6 as the Actions runner sees it: an empty runtime each night, same source bytes."""
    from finsight.plugins import Runner, RunRegistry
    from src.regimes.service import Pipeline

    (tmp_path / "public/artifacts/replay").mkdir(parents=True)
    shutil.copyfile(ROOT / "frontend-v2/public/replay-manifest.json", tmp_path / "public/replay-manifest.json")
    write_factor_captures(tmp_path / "night1")
    shutil.copytree(tmp_path / "night1", tmp_path / "night2")
    for meta in (tmp_path / "night2").glob("*.meta.json"):
        value = json.loads(meta.read_text())
        meta.write_text(json.dumps({**value, "captured_at": "2026-10-11T06:00:00Z"}))
    guard = pytest.MonkeyPatch()

    def forbidden(*args, **kwargs):
        raise AssertionError("Phase 5 export must never run the row runner or open a holdout")

    guard.setattr(Runner, "run", forbidden)
    guard.setattr(RunRegistry, "holdout", forbidden)
    try:
        collector.collect(tmp_path / "runtime1", directory=tmp_path / "night1")
        first = exporter.export(tmp_path / "runtime1", tmp_path / "public", tmp_path / "exports")
        published = (tmp_path / "public/replay-manifest.json").read_bytes()
        collector.collect(tmp_path / "runtime2", directory=tmp_path / "night2")
        second = exporter.export(tmp_path / "runtime2", tmp_path / "public", tmp_path / "exports")
    finally:
        guard.undo()
    assert first["status"] == "PUBLISHED" and first["new_runs"] == 10
    assert second == {"status": "UNCHANGED", "new_runs": 0, "holdout_openings": 0}
    assert (tmp_path / "public/replay-manifest.json").read_bytes() == published
    pipe = Pipeline(tmp_path / "runtime2")
    events = pipe.registry.events(pipe.tenant_id)
    assert not any(e["event"] in {"RUN_SEALED", "HOLDOUT_OPENED"} for e in events)
    assert pipe.registry.opening_count(pipe.tenant_id) == 0
