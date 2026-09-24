from pathlib import Path

from src.benchmark import load_benchmark_case
from src.tool_plane import ForgeToolPlane


TASKS = Path(__file__).resolve().parents[1] / "eval" / "tasks" / "forge_v0_2"


def test_typed_tools_return_provenance_and_trusted_replays(tmp_path):
    case = load_benchmark_case(TASKS / "task_007.json")
    plane = ForgeToolPlane(
        task=case.task,
        world=case.world,
        sandbox_root=tmp_path / "sandbox",
    )

    description = plane.call("world.describe", state="UNDERSTAND")
    snapshot = plane.call(
        "world.get_snapshot",
        {"dataset": "covariance_estimates"},
        state="GATHER_EVIDENCE",
    )
    experiment = plane.call(
        "experiment.execute_python",
        {
            "code": "(ARTIFACT_DIR / 'result.json').write_text('{\"ok\":true}')",
            "input": snapshot.value,
        },
        state="EXECUTE",
    )

    assert description.provenance.snapshot_hash == case.world.world_id
    assert snapshot.provenance.as_of == case.task.as_of.isoformat
    assert snapshot.provenance.epistemic_state == "historical_observation"
    assert experiment.success
    assert len(plane.executions) == 2
    assert len({item.reproducibility_hash for item in plane.executions}) == 1
    assert [action.sequence for action in plane.actions] == [1, 2, 3]
