from pathlib import Path

from src.agent.research_agent import ResearchAgent, ResearchState
from src.benchmark import BenchmarkRunner, load_benchmark_cases
from src.trajectories import Trajectory, TrajectoryStore


TASKS = Path(__file__).resolve().parents[1] / "eval" / "tasks" / "forge_v0_2"


def test_single_research_agent_verifies_all_ten_v02_tasks(tmp_path):
    cases = load_benchmark_cases(TASKS)
    assert len(cases) == 10

    for case in cases:
        research = ResearchAgent().run(
            case.task,
            case.world,
            sandbox_root=str(tmp_path / case.task.task_id),
        )
        episode = BenchmarkRunner().evaluate(
            case,
            research.finding,
            usage=research.usage,
            executions=research.executions,
        )

        assert episode.passed, case.task.task_id
        assert {result.status.value for result in episode.verifier_results} == {"pass"}
        assert research.state_trace == tuple(state.value for state in ResearchState)
        assert [action.tool for action in research.actions] == [
            "world.describe",
            research.actions[1].tool,
            "experiment.execute_python",
            "finding.submit",
        ]


def test_trajectory_is_content_addressed_and_append_only(tmp_path):
    case = load_benchmark_cases(TASKS)[6]
    research = ResearchAgent().run(
        case.task,
        case.world,
        sandbox_root=str(tmp_path / "sandbox"),
    )
    episode = BenchmarkRunner().evaluate(
        case,
        research.finding,
        usage=research.usage,
        executions=research.executions,
    )
    first = Trajectory.from_episode(case, research, episode)
    second = Trajectory.from_episode(case, research, episode)
    store = TrajectoryStore(tmp_path / "trajectories.jsonl")
    store.append(first)
    store.append(second)

    assert first.trajectory_id == second.trajectory_id
    assert len((tmp_path / "trajectories.jsonl").read_text().splitlines()) == 2
