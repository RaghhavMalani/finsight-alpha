from __future__ import annotations

from pathlib import Path

from src.benchmark import load_benchmark_case
from src.eval.canonical import canonical_sha256
from src.execution import (
    EpistemicValue,
    ExecutionAssumptions,
    MeasurementState,
    SimulationMode,
    SimulationRequest,
    SimulationToolPlane,
    default_registry,
)
from src.tool_plane import ForgeToolPlane


ROOT = Path(__file__).resolve().parents[1]


def _request(world_hash: str) -> SimulationRequest:
    inputs = {"orders": [], "market_events": [], "initial_cash": 1_000.0}
    absent = EpistemicValue.absent(MeasurementState.NOT_MEASURED, "not needed for availability test")
    return SimulationRequest(
        world_hash=world_hash,
        strategy_hash=canonical_sha256("strategy"),
        dataset_hash=canonical_sha256(inputs),
        core_lock_hash=canonical_sha256("lock"),
        start="2020-01-01T00:00:00Z", end="2020-01-02T00:00:00Z",
        seed=42, mode=SimulationMode.BACKTEST, scenario_id="tool-plane",
        required_capabilities=("tick_data",),
        execution=ExecutionAssumptions(absent, absent, absent, absent, absent),
        inputs=inputs,
    )


def test_single_research_tool_plane_composes_optional_simulation_tools(tmp_path) -> None:
    case = load_benchmark_case(ROOT / "eval" / "tasks" / "forge_v0_2" / "task_001.json")
    plane = ForgeToolPlane(
        task=case.task,
        world=case.world,
        sandbox_root=tmp_path / "sandbox",
        simulation_plane=SimulationToolPlane(default_registry()),
    )

    listed = plane.call("simulation.list_engines", state="GATHER_EVIDENCE")
    unavailable = plane.call(
        "simulation.run",
        {"engine": "hftbacktest", "request": _request(case.world.world_id)},
        state="EXECUTE",
    )
    wrong_world = plane.call(
        "simulation.run",
        {"engine": "hftbacktest", "request": _request(canonical_sha256("other-world"))},
        state="EXECUTE",
    )

    assert listed.success and len(listed.value) == 4
    assert unavailable.value["state"] == "UNAVAILABLE"
    assert not unavailable.success
    assert wrong_world.value["error"].startswith("ToolInvocationError")
    assert [action.tool for action in plane.actions] == [
        "simulation.list_engines", "simulation.run", "simulation.run"
    ]
