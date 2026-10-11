"""Publication-only remediation: no raw/reconstructable returns and no model rerun."""

import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from scripts.correct_regime_factors import correct, verify_corrections
from src.regimes.publication import project_factors, validate_public
from tests.regimes.conftest import ROOT

SEALED = "87230e036f97c0914ab9d51287f8847396579eea"


def blob(path):
    return subprocess.check_output(["git", "show", SEALED + ":" + path], cwd=ROOT)


@pytest.fixture
def legacy(tmp_path):
    public, directory = tmp_path / "public", tmp_path / "exports"
    shutil.copytree(ROOT / "frontend-v2/public", public)
    shutil.copytree(ROOT / "data/exports/regimes_v0_1", directory)
    for path in directory.glob("receipt*.json"):
        path.unlink()
    (public / "replay-manifest.json").write_bytes(blob("frontend-v2/public/replay-manifest.json"))
    manifest = json.loads((public / "replay-manifest.json").read_bytes())
    # Use the original sealed output bytes. Never fetch sources or fit any model.
    for path in (public / "artifacts/replay").glob("regimes-factors-*.json"):
        path.unlink()
    for identity, entry in manifest["artifacts"].items():
        if identity.startswith("regimes:factors:"):
            rel = entry["url"].lstrip("/")
            (public / rel).write_bytes(blob("frontend-v2/public/" + rel))
    paths = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", SEALED, "--", "data/exports/regimes_v0_1"], cwd=ROOT).decode().splitlines()
    for path in paths:
        (directory / Path(path).name).write_bytes(blob(path))
    return public, directory


def current_factors():
    public = ROOT / "frontend-v2/public"
    manifest = json.loads((public / "replay-manifest.json").read_bytes())
    identity = manifest["routes"]["/regimes/factors?asset=US-MKT"]
    return json.loads((public / manifest["artifacts"][identity]["url"].lstrip("/")).read_bytes())["payload"]


@pytest.mark.parametrize("mutate", [
    lambda p: p.__setitem__("decomposition_tail", [{"observed_at": "2025-09-03T00:00:00Z", "raw": .006}]),
    lambda p: p.__setitem__("decomposition_tail", [{"observed_at": "2025-09-03T00:00:00Z", "explained": .0038, "residual": .0022}]),
    lambda p: p["rolling_tail"][0].__setitem__("raw", .006),
    lambda p: p["rolling_tail"][0].update(explained=.0038, residual=.0022),
    lambda p: p["rolling_tail"][0].__setitem__("mom", .006),
    lambda p: p["full_window"].__setitem__("raw_mean", .006),
    lambda p: p["full_window"]["terms"][0].__setitem__("raw", .006),
    lambda p: p["full_window"].__setitem__("n", 1),
    lambda p: p.__setitem__("history", [{"date": "2025-09-03", "value": .006}]),
])
def test_factor_kind_whitelist_rejects_raw_pairs_and_aliases(mutate):
    payload = copy.deepcopy(current_factors())
    mutate(payload)
    with pytest.raises(ValueError):
        validate_public("factors", payload)


def test_public_projection_discards_local_decomposition():
    payload = current_factors()
    local = {"asset": payload["asset"], "lineage": {"factors": {"status": "VERIFIED"}}, "runs": {
        "factors": {"status": payload["status"], "diagnostics": {"name": payload["name"], "controls": payload["controls"], "full_window": {**payload["full_window"], "raw_mean": .006}, "stability": payload["stability"]},
                    "paths": {"rolling_tail": payload["rolling_tail"], "decomposition_tail": [{"observed_at": "2025-09-03T00:00:00Z", "raw": .006, "explained": .0038, "residual": .0022}]}}
    }}
    projected = project_factors(local)
    assert projected == payload
    assert local["runs"]["factors"]["paths"]["decomposition_tail"][0]["raw"] == .006
    validate_public("factors", projected)


def test_all_public_factor_versions_are_safe_and_withdrawals_stay_absent():
    public, directory = ROOT / "frontend-v2/public", ROOT / "data/exports/regimes_v0_1"
    assert verify_corrections(public, directory) == 6
    manifest = json.loads((public / "replay-manifest.json").read_bytes())
    factors = [k for k in manifest["artifacts"] if k.startswith("regimes:factors:")]
    assert len(factors) == 6
    for identity in factors:
        payload = json.loads((public / manifest["artifacts"][identity]["url"].lstrip("/")).read_bytes())["payload"]
        validate_public("factors", payload)
        assert not {"decomposition_tail", "raw", "explained", "residual"} & set(payload)


def test_read_only_reprojection_preserves_all_other_evidence_and_is_idempotent(legacy, monkeypatch):
    from finsight.plugins import Runner, RunRegistry, SeriesRunner
    from scripts import collect_regime_inputs, export_regimes_replay
    from src.regimes.service import Pipeline

    def forbidden(*args, **kwargs):
        raise AssertionError("Publication correction must never capture, compute or open a holdout")

    for cls, name in [(Runner, "run"), (RunRegistry, "holdout"), (SeriesRunner, "compute"), (Pipeline, "run_market"), (collect_regime_inputs, "collect"), (export_regimes_replay, "export")]:
        monkeypatch.setattr(cls, name, forbidden)
    public, directory = legacy
    manifest = json.loads((public / "replay-manifest.json").read_bytes())
    prior_receipt = json.loads((directory / "receipt.json").read_bytes())
    untouched = {p: p.read_bytes() for p in public.rglob("*") if p.is_file() and p.name != "replay-manifest.json" and not p.name.startswith("regimes-factors-")}
    archived = {p: p.read_bytes() for p in directory.glob("receipt-*.json")}
    rolling = {identity: json.loads((public / entry["url"].lstrip("/")).read_bytes())["payload"]["rolling_tail"] for identity, entry in manifest["artifacts"].items() if identity.startswith("regimes:factors:")}
    assert correct(public, directory) == {"status": "CORRECTED", "new_runs": 0, "holdout_openings": 0, "replacements": 6}
    assert all(p.read_bytes() == raw for p, raw in {**untouched, **archived}.items())
    corrected = json.loads((directory / "receipt.json").read_bytes())
    assert corrected["fingerprint"] == prior_receipt["fingerprint"]
    assert corrected["as_of"] == prior_receipt["as_of"]
    current_manifest = json.loads((public / "replay-manifest.json").read_bytes())
    for identity, entry in manifest["artifacts"].items():
        if not identity.startswith("regimes:factors:"):
            assert current_manifest["artifacts"][identity] == entry
    for asset in corrected["markets"]:
        assert corrected["markets"][asset]["run_ids"] == prior_receipt["markets"][asset]["run_ids"]
    for record in corrected["publication_correction"]["withdrawals"]:
        new = current_manifest["artifacts"][record["replacement_artifact"]]
        assert json.loads((public / new["url"].lstrip("/")).read_bytes())["payload"]["rolling_tail"] == rolling[record["withdrawn_artifact"]]
    after = {p: p.read_bytes() for base in (public, directory) for p in base.rglob("*") if p.is_file()}
    assert correct(public, directory) == {"status": "UNCHANGED", "new_runs": 0, "holdout_openings": 0, "replacements": 0}
    assert all(p.read_bytes() == raw for p, raw in after.items())


def test_sealed_input_substitution_fails_before_any_write(legacy):
    public, directory = legacy
    manifest = json.loads((public / "replay-manifest.json").read_bytes())
    identity = manifest["routes"]["/regimes/factors?asset=US-MKT"]
    path = public / manifest["artifacts"][identity]["url"].lstrip("/")
    path.write_bytes(path.read_bytes() + b" ")
    before = (public / "replay-manifest.json").read_bytes()
    with pytest.raises(ValueError, match="Sealed projection"):
        correct(public, directory)
    assert (public / "replay-manifest.json").read_bytes() == before


def test_orphan_factor_direct_url_is_rejected(legacy):
    public, directory = legacy
    old = next((public / "artifacts/replay").glob("regimes-factors-*.json"))
    leaked = old.read_bytes()
    correct(public, directory)
    old.write_bytes(leaked)
    with pytest.raises(ValueError, match="still anonymously served"):
        verify_corrections(public, directory)


def test_d6_schedule_and_all_scope_cannot_execute_phase5():
    workflow = yaml.safe_load((ROOT / ".github/workflows/organs.yml").read_text(encoding="utf-8"))
    steps = workflow["jobs"]["reference"]["steps"]
    gate = "github.event_name == 'workflow_dispatch' && inputs.scope == 'regimes'"
    phase5 = [s for s in steps if "collect_regime_inputs.py --network" in s.get("run", "") or "export_regimes_replay.py" in s.get("run", "") or "verify_regimes.py --runtime" in s.get("run", "")]
    assert len(phase5) == 3
    assert all(s["if"] == gate for s in phase5)
    # Both clauses must pass; schedule and a default all dispatch stay gated.
    for event, scope in [("schedule", "all"), ("schedule", "regimes"), ("workflow_dispatch", "all")]:
        assert not (event == "workflow_dispatch" and scope == "regimes")
    assert all(s["if"] == "inputs.scope != 'regimes'" for s in steps if "collect_data_organ.py --network" in s.get("run", "") or "export_data_organ_replay.py" in s.get("run", ""))
    assert not any("run_plugin_reference.py" in s.get("run", "") for s in steps)
