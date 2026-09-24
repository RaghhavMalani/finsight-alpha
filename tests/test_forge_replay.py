import copy
from pathlib import Path

import pytest

from src.agent.research_agent import ResearchAgent
from src.benchmark import BenchmarkRunner, load_benchmark_case
from src.trajectories import Trajectory
from src.replay import TrajectoryReplayer


ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / "eval" / "tasks" / "forge_v0_2" / "task_007.json"


def _trajectory(tmp_path):
    case = load_benchmark_case(TASK)
    research = ResearchAgent().run(
        case.task,
        case.world,
        sandbox_root=str(tmp_path / "original"),
    )
    episode = BenchmarkRunner().evaluate(
        case,
        research.finding,
        usage=research.usage,
        executions=research.executions,
    )
    return Trajectory.from_episode(case, research, episode).to_dict()


def _reidentify(document):
    document.pop("trajectory_id", None)
    document["trajectory_id"] = Trajectory.from_dict(document).trajectory_id
    return document


def test_trajectory_replay_reproduces_every_layer(tmp_path):
    document = _trajectory(tmp_path)
    result = TrajectoryReplayer(ROOT).replay_document(
        document,
        work_root=tmp_path / "replay",
    )
    assert result.matched
    assert result.fidelity == 1.0


@pytest.mark.parametrize(
    "mutation,failed_check",
    [
        (lambda value: value["task"].__setitem__("seed", 99), "replay_sandbox"),
        (lambda value: value.__setitem__("world_hash", "0" * 64), "world_snapshot"),
        (
            lambda value: value["actions"][2]["result"]["value"]["replays"][0].__setitem__(
                "manifest_hash", "1" * 64
            ),
            "tool_sequence",
        ),
        (
            lambda value: value["actions"][2]["arguments"].__setitem__(
                "code", value["actions"][2]["arguments"]["code"] + "\n# mutation"
            ),
            "tool_sequence",
        ),
        (
            lambda value: value["actions"][1]["result"]["value"].__setitem__(
                "records", []
            ),
            "tool_sequence",
        ),
        (
            lambda value: value["task"].__setitem__("question", "mutated task"),
            "task_identity",
        ),
    ],
)
def test_replay_detects_seed_snapshot_lock_source_tool_and_task_mutations(
    tmp_path, mutation, failed_check
):
    document = copy.deepcopy(_trajectory(tmp_path))
    mutation(document)
    _reidentify(document)
    result = TrajectoryReplayer(ROOT).replay_document(
        document,
        work_root=tmp_path / "mutated-replay",
    )
    assert not result.matched
    assert not result.checks[failed_check]
    assert result.fidelity < 1.0
