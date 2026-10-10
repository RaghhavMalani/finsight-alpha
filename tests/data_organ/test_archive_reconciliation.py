"""The last broad-fingerprint nightly run stays sealed, including its opening."""

import json
from pathlib import Path

import pytest

from scripts import data_archive, verify_plugin_replay

ROOT = Path(__file__).resolve().parents[2]
THIRD = "35b2839947ef7fe71700c3b25efff7ff5b6ca003156b20f6840b95e5add27ebc"
SNAPSHOT = "072b788ca5348f380d62520a7bb0fed6334c7eba09eb7fbd79198a998e748b7b"


def test_all_three_retained_runs_are_audited_without_execution(monkeypatch):
    from finsight.plugins import Runner

    def forbidden(*args, **kwargs):
        pytest.fail("Archive verification must never execute a plugin")

    monkeypatch.setattr(Runner, "run", forbidden)
    verify_plugin_replay.verify()
    directory = ROOT / "data/exports/nervous_system_v0_1"
    receipts = [json.loads(p.read_bytes()) for p in directory.glob("receipt-*.json")]
    assert len(receipts) == 3
    assert THIRD in {r["run_id"] for r in receipts}
    registry = json.loads((directory / "registry.json").read_bytes())
    assert sum(e["event"] == "HOLDOUT_OPENED" for e in registry["events"]) == 3
    assert all(
        r["contract"].get("schema_version", "plugin-computation/1")
        == "plugin-computation/1"
        for r in registry["runs"]
    )


@pytest.mark.parametrize(
    "path",
    [
        f"data/exports/nervous_system_v0_1/receipt-{THIRD}.json",
        f"data/exports/nervous_system_v0_1/registry-{SNAPSHOT}.json",
        f"frontend-v2/public/artifacts/replay/plugins-run-{THIRD}.json",
    ],
)
def test_third_run_bytes_are_inside_the_phase_3_archive(monkeypatch, path):
    original = Path.read_bytes

    def corrupted(target):
        raw = original(target)
        return raw + b" " if target == ROOT / path else raw

    monkeypatch.setattr(Path, "read_bytes", corrupted)
    with pytest.raises(ValueError, match="Immutable Phase 0-2 bytes changed"):
        data_archive.verify(ROOT)


def test_scheduler_only_verifies_plugins_and_stages_data_organ():
    workflow = (ROOT / ".github/workflows/organs.yml").read_text()
    assert workflow.count("python scripts/verify_plugin_replay.py") == 2
    assert "python scripts/collect_data_organ.py --network" in workflow
    assert "python scripts/export_data_organ_replay.py" in workflow
    assert "export_plugin_replay.py" not in workflow
    assert "momentum_plugin.py" not in workflow
    staged = next(
        line.strip() for line in workflow.splitlines() if "git add --" in line
    )
    assert staged == (
        "git add -- data/exports/data_organ_v0_1 "
        "frontend-v2/public/artifacts/replay/data-organ-*.json "
        "frontend-v2/public/replay-manifest.json"
    )
