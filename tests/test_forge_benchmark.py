from pathlib import Path

import pytest

from src.benchmark import BenchmarkRunner, PolicyOutput, load_benchmark_case
from src.eval.canonical import canonical_sha256
from src.findings import NumericalClaim, ResearchArtifact, ResearchFinding
from src.rewards import ResourceUsage


TASKS = Path(__file__).resolve().parents[1] / "eval" / "tasks" / "forge_v0_1"


def _artifact(task_id: str, value: float) -> ResearchArtifact:
    digest = canonical_sha256({"task_id": task_id, "value": value})
    return ResearchArtifact(
        artifact_id=f"{task_id}-calculation",
        content_hash=digest,
        replay_hashes=(digest, digest),
    )


def _finding(case, value: float | None = None) -> ResearchFinding:
    if case.task.task_id == "pit_total_return":
        evidence = (
            case.world.evidence("prices", 0, evidence_id="start-price"),
            case.world.evidence("prices", 1, evidence_id="end-price"),
        )
        resolved = 0.1 if value is None else value
        claim = NumericalClaim(
            "cumulative_return",
            "cumulative_return",
            resolved,
            "decimal",
            tuple(item.evidence_id for item in evidence),
        )
    else:
        evidence = (case.world.evidence("sec_facts", 0, evidence_id="filing"),)
        resolved = 0.4 if value is None else value
        claim = NumericalClaim(
            "gross_margin",
            "gross_margin",
            resolved,
            "decimal",
            ("filing",),
        )
    return ResearchFinding(
        finding_id=f"{case.task.task_id}-finding",
        hypothesis="The as-of data supports the requested calculation.",
        conclusion=f"The verified value is {resolved}.",
        confidence=0.95,
        evidence=evidence,
        claims=(claim,),
        artifacts=(_artifact(case.task.task_id, resolved),),
    )


@pytest.mark.parametrize(
    "fixture",
    ["pit_total_return.json", "filing_gross_margin.json"],
)
def test_frozen_forge_cases_pass_all_deterministic_gates(fixture):
    case = load_benchmark_case(TASKS / fixture)
    runner = BenchmarkRunner()

    episode = runner.run(
        case,
        lambda task, world: PolicyOutput(
            _finding(case),
            ResourceUsage(cost_usd=0.01, latency_seconds=0.1, tool_calls=2),
        ),
    )
    replay = runner.evaluate(case, _finding(case), usage=episode.usage)

    assert episode.passed
    assert {result.status.value for result in episode.verifier_results} == {"pass"}
    assert episode.reward.verified_quality == 1.0
    assert episode.episode_id == replay.episode_id


def test_wrong_number_fails_the_numerical_gate_and_reduces_reward():
    case = load_benchmark_case(TASKS / "pit_total_return.json")
    runner = BenchmarkRunner()

    correct = runner.evaluate(case, _finding(case))
    wrong = runner.evaluate(case, _finding(case, value=0.9))
    wrong_results = {result.verifier: result for result in wrong.verifier_results}

    assert correct.passed
    assert not wrong.passed
    assert wrong_results["numerical"].status.value == "fail"
    assert wrong.reward.reward < correct.reward.reward


def test_finding_schema_rejects_unbounded_confidence():
    case = load_benchmark_case(TASKS / "filing_gross_margin.json")
    valid = _finding(case)

    with pytest.raises(ValueError, match="confidence"):
        ResearchFinding(
            finding_id="bad",
            hypothesis=valid.hypothesis,
            conclusion=valid.conclusion,
            confidence=1.1,
        )
