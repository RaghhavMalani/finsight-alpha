from dataclasses import replace
from datetime import timedelta
from pathlib import Path

from src.benchmark import BenchmarkRunner, load_benchmark_case
from src.eval.canonical import canonical_sha256
from src.findings import NumericalClaim, ResearchArtifact, ResearchFinding


TASKS = Path(__file__).resolve().parents[2] / "eval" / "tasks" / "forge_v0_1"


def _base_finding(case):
    start = case.world.evidence("prices", 0, evidence_id="start")
    end = case.world.evidence("prices", 1, evidence_id="end")
    digest = canonical_sha256({"value": 0.1})
    return ResearchFinding(
        finding_id="guard-fixture",
        hypothesis="Visible prices imply a ten percent cumulative return.",
        conclusion="The cumulative return is 0.1.",
        confidence=0.9,
        evidence=(start, end),
        claims=(
            NumericalClaim(
                "cumulative_return",
                "cumulative_return",
                0.1,
                "decimal",
                ("start", "end"),
            ),
        ),
        artifacts=(ResearchArtifact("calc", digest, (digest, digest)),),
    )


def test_future_availability_sabotage_cannot_keep_a_verified_reward():
    case = load_benchmark_case(TASKS / "pit_total_return.json")
    finding = _base_finding(case)
    leaked = replace(
        finding.evidence[1],
        available_from=case.task.as_of.cutoff + timedelta(seconds=1),
    )
    sabotaged = replace(finding, evidence=(finding.evidence[0], leaked))

    episode = BenchmarkRunner().evaluate(case, sabotaged)
    results = {result.verifier: result for result in episode.verifier_results}

    assert not episode.passed
    assert results["temporal"].status.value == "fail"
    assert results["evidence"].status.value == "fail"
    assert not episode.reward.critical_gate_passed
    assert episode.reward.failure_multiplier == 0.40


def test_replay_mutation_fails_reproducibility_gate():
    case = load_benchmark_case(TASKS / "pit_total_return.json")
    finding = _base_finding(case)
    mutated_hash = canonical_sha256({"value": 0.1000001})
    artifact = replace(
        finding.artifacts[0],
        replay_hashes=(finding.artifacts[0].content_hash, mutated_hash),
    )

    episode = BenchmarkRunner().evaluate(
        case,
        replace(finding, artifacts=(artifact,)),
    )
    results = {result.verifier: result for result in episode.verifier_results}

    assert not episode.passed
    assert results["reproducibility"].status.value == "fail"
