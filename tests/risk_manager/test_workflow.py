"""SYNTHETIC_TEST_ONLY workflow boundary checks; no dispatch or execution."""
from pathlib import Path
import yaml

def test_manual_workflow_is_bounded_and_has_no_scientific_environment():
    root = Path(__file__).resolve().parents[2]
    workflow = yaml.safe_load((root / ".github/workflows/risk.yml").read_text(encoding="utf-8"))
    trigger = workflow.get("on", workflow.get(True))  # PyYAML's YAML 1.1 key parsing.
    assert set(trigger) == {"workflow_dispatch"}
    assert trigger["workflow_dispatch"]["inputs"]["scope"]["options"] == ["risk"]
    assert set(workflow["jobs"]) == {"risk"}
    job = workflow["jobs"]["risk"]
    assert job["timeout-minutes"] == 10
    commands = [step["run"] for step in job["steps"] if "run" in step]
    installs = [command for command in commands if "pip install" in command]
    assert installs == ["python -m pip install pydantic==2.13.4"]
    # Exactly one bounded preflight precedes the sweep. Expensive nested historical
    # validators belong in CI; the full immutable subset is checked by this one.
    sweep = commands.index("python scripts/run_risk_sweep.py --scope risk")
    assert commands[:sweep] == [
        "python -m pip install pydantic==2.13.4",
        "python scripts/verify_risk_manager.py",
    ]
    assert commands[sweep + 2] == "python scripts/verify_risk_manager.py"
    assert workflow["concurrency"]["cancel-in-progress"] is False
    assert workflow["concurrency"]["group"] == "checked-organs-${{ github.ref_name }}"
