"""An RL-shaped environment for frozen, verifier-graded research tasks."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

import pandas as pd

from src.eval.canonical import canonical_sha256
from src.findings.schema import ResearchFinding, ResearchTask
from src.rewards.reward_model import (
    ResourceUsage,
    RewardBreakdown,
    VerifiedRewardModel,
)
from src.sandbox.runner import ExecutionResult
from src.verifiers.core import VerificationContext, VerificationResult, VerificationStatus
from src.verifiers.specs import EvidenceRequirement, NumericExpectation
from src.verifiers.suite import VerifierSuite
from src.world.market_world import MarketWorld


BENCHMARK_SCHEMA_VERSION = "0.2"
SUPPORTED_BENCHMARK_SCHEMA_VERSIONS = {"0.1", "0.2"}


@dataclass(frozen=True)
class BenchmarkCase:
    task: ResearchTask
    world: MarketWorld
    numeric_expectations: tuple[NumericExpectation, ...]
    evidence_requirements: tuple[EvidenceRequirement, ...]
    minimum_replays: int = 2
    schema_version: str = "0.1"

    def __post_init__(self) -> None:
        if type(self.minimum_replays) is not int or self.minimum_replays < 1:
            raise ValueError("minimum_replays must be an integer >= 1")
        if self.task.as_of.cutoff != self.world.as_of.cutoff:
            raise ValueError("benchmark task and world must use the same as_of boundary")
        if self.task.seed != self.world.seed:
            raise ValueError("benchmark task and world must use the same seed")
        if self.schema_version not in SUPPORTED_BENCHMARK_SCHEMA_VERSIONS:
            raise ValueError(f"unsupported benchmark schema {self.schema_version!r}")

    @property
    def case_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "task": self.task.to_dict(),
            "world": self.world.manifest(),
            "numeric_expectations": [
                expectation.to_dict() for expectation in self.numeric_expectations
            ],
            "evidence_requirements": [
                requirement.to_dict() for requirement in self.evidence_requirements
            ],
            "minimum_replays": self.minimum_replays,
        }


@dataclass(frozen=True)
class PolicyOutput:
    finding: ResearchFinding
    usage: ResourceUsage = ResourceUsage()
    executions: tuple[ExecutionResult, ...] = ()


@dataclass(frozen=True)
class EpisodeResult:
    episode_id: str
    task_id: str
    case_hash: str
    world_id: str
    finding_hash: str
    passed: bool
    verifier_results: tuple[VerificationResult, ...]
    reward: RewardBreakdown
    usage: ResourceUsage
    executions: tuple[ExecutionResult, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "episode_id": self.episode_id,
            "task_id": self.task_id,
            "case_hash": self.case_hash,
            "world_id": self.world_id,
            "finding_hash": self.finding_hash,
            "passed": self.passed,
            "verifier_results": [result.to_dict() for result in self.verifier_results],
            "reward": self.reward.to_dict(),
            "usage": self.usage.to_dict(),
            "executions": [result.to_dict() for result in self.executions],
        }


Policy = Callable[[ResearchTask, MarketWorld], ResearchFinding | PolicyOutput]


class BenchmarkRunner:
    """Evaluate policy output with deterministic gates and shaped reward."""

    def __init__(
        self,
        *,
        verifier_suite: VerifierSuite | None = None,
        reward_model: VerifiedRewardModel | None = None,
    ) -> None:
        self.verifier_suite = verifier_suite or VerifierSuite()
        self.reward_model = reward_model or VerifiedRewardModel()

    def run(self, case: BenchmarkCase, policy: Policy) -> EpisodeResult:
        output = policy(case.task, case.world)
        if isinstance(output, ResearchFinding):
            output = PolicyOutput(output)
        if not isinstance(output, PolicyOutput):
            raise TypeError("benchmark policy must return ResearchFinding or PolicyOutput")
        return self.evaluate(
            case,
            output.finding,
            usage=output.usage,
            executions=output.executions,
        )

    def evaluate(
        self,
        case: BenchmarkCase,
        finding: ResearchFinding,
        *,
        usage: ResourceUsage | None = None,
        executions: tuple[ExecutionResult, ...] = (),
    ) -> EpisodeResult:
        resolved_usage = usage or ResourceUsage()
        context = VerificationContext(
            task=case.task,
            finding=finding,
            world=case.world,
            numeric_expectations=case.numeric_expectations,
            evidence_requirements=case.evidence_requirements,
            minimum_replays=case.minimum_replays,
            executions=executions,
        )
        results = self.verifier_suite.run(context)
        passed = all(
            result.status is VerificationStatus.PASS for result in results
        )
        reward = self.reward_model.score(
            results,
            required_verifiers=case.task.required_verifiers,
            usage=resolved_usage,
            budget=case.task.budget,
        )
        episode_payload = {
            "case_hash": case.case_hash,
            "world_id": case.world.world_id,
            "finding_hash": finding.finding_hash,
            "verifiers": [result.to_dict() for result in results],
            "usage": resolved_usage.to_dict(),
            "executions": [result.reproducibility_hash for result in executions],
        }
        return EpisodeResult(
            episode_id=canonical_sha256(episode_payload),
            task_id=case.task.task_id,
            case_hash=case.case_hash,
            world_id=case.world.world_id,
            finding_hash=finding.finding_hash,
            passed=passed,
            verifier_results=results,
            reward=reward,
            usage=resolved_usage,
            executions=executions,
        )

def _strict_fields(
    data: Mapping[str, Any],
    *,
    required: set[str],
    optional: set[str] | None = None,
    label: str,
) -> None:
    optional = optional or set()
    missing = required - set(data)
    unknown = set(data) - required - optional
    if missing:
        raise ValueError(f"{label} is missing fields: {sorted(missing)}")
    if unknown:
        raise ValueError(f"{label} has unknown fields: {sorted(unknown)}")


def load_benchmark_case(
    path: str | Path,
    *,
    seed_override: int | None = None,
) -> BenchmarkCase:
    """Load one strict JSON fixture into a point-in-time market world."""

    source = Path(path)
    document = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise ValueError(f"{source} must contain a JSON object")
    _strict_fields(
        document,
        required={
            "schema_version",
            "task",
            "world",
            "numeric_expectations",
            "evidence_requirements",
            "minimum_replays",
        },
        label="benchmark case",
    )
    if document["schema_version"] not in SUPPORTED_BENCHMARK_SCHEMA_VERSIONS:
        raise ValueError(
            f"unsupported benchmark schema {document['schema_version']!r}"
        )
    task = ResearchTask.from_dict(document["task"])
    if seed_override is not None:
        if type(seed_override) is not int or seed_override < 0:
            raise ValueError("seed_override must be an integer >= 0")
        task = ResearchTask.from_dict({**task.to_dict(), "seed": seed_override})
    world_data = document["world"]
    if not isinstance(world_data, dict):
        raise ValueError("world must be an object")
    _strict_fields(
        world_data,
        required={"name", "information_policy", "datasets"},
        label="benchmark world",
    )
    datasets = world_data["datasets"]
    if not isinstance(datasets, list) or not datasets:
        raise ValueError("benchmark world datasets must be a non-empty array")
    world = MarketWorld(
        as_of=task.as_of,
        seed=task.seed,
        information_policy=world_data["information_policy"],
        name=world_data["name"],
    )
    for raw_dataset in datasets:
        if not isinstance(raw_dataset, dict):
            raise ValueError("dataset fixture must be an object")
        _strict_fields(
            raw_dataset,
            required={
                "name",
                "observed_at",
                "available_from",
                "records",
            },
            optional={"snapshot_id"},
            label="dataset fixture",
        )
        records = raw_dataset["records"]
        if not isinstance(records, list):
            raise ValueError("dataset records must be an array")
        world = world.with_dataset(
            raw_dataset["name"],
            pd.DataFrame(records),
            observed_at=raw_dataset["observed_at"],
            available_from=raw_dataset["available_from"],
            snapshot_id=raw_dataset.get("snapshot_id"),
        )
    numeric = document["numeric_expectations"]
    evidence = document["evidence_requirements"]
    if not isinstance(numeric, list) or not isinstance(evidence, list):
        raise ValueError("benchmark expectations and requirements must be arrays")
    return BenchmarkCase(
        task=task,
        world=world,
        numeric_expectations=tuple(NumericExpectation.from_dict(item) for item in numeric),
        evidence_requirements=tuple(EvidenceRequirement.from_dict(item) for item in evidence),
        minimum_replays=document["minimum_replays"],
        schema_version=document["schema_version"],
    )

def load_benchmark_cases(directory: str | Path) -> tuple[BenchmarkCase, ...]:
    root = Path(directory)
    paths = sorted(root.glob("*.json"))
    if not paths:
        raise ValueError(f"no benchmark JSON cases found in {root}")
    cases = tuple(load_benchmark_case(path) for path in paths)
    task_ids = [case.task.task_id for case in cases]
    if len(task_ids) != len(set(task_ids)):
        raise ValueError("benchmark task_id values must be unique")
    return cases
