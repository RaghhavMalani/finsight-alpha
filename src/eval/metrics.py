"""Calculators for FinSight's six public coding-agent evaluation numbers."""

from __future__ import annotations

import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable, Sequence

from src.eval.canonical import canonical_sha256
from src.eval.models import AttemptRecord, validate_attempt_records


@dataclass(frozen=True)
class EvaluationThresholds:
    """Publication gates; descriptive metrics remain visible without a target."""

    minimum_replay_runs: int = 5
    minimum_fault_trials: int = 1
    minimum_judgments: int = 2
    minimum_seeds: int = 5
    replay_fidelity: float = 1.0
    recovery_rate: float = 0.90
    judge_human_kappa: float = 0.80
    regression_pass_rate: float = 1.0
    maximum_seed_variance: float = 0.0

    def __post_init__(self) -> None:
        if self.minimum_replay_runs < 2:
            raise ValueError("minimum_replay_runs must be >= 2")
        for name in ("minimum_fault_trials", "minimum_judgments", "minimum_seeds"):
            if getattr(self, name) < 1:
                raise ValueError(f"{name} must be >= 1")
        for name in (
            "replay_fidelity",
            "recovery_rate",
            "regression_pass_rate",
        ):
            value = getattr(self, name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be between 0 and 1")
        if not -1.0 <= self.judge_human_kappa <= 1.0:
            raise ValueError("judge_human_kappa must be between -1 and 1")
        if self.maximum_seed_variance < 0.0:
            raise ValueError("maximum_seed_variance must be >= 0")


def _gate(actual: float, target: float, *, operator: str) -> dict[str, Any]:
    if operator == ">=":
        passed = actual >= target
    elif operator == "==":
        passed = math.isclose(actual, target, rel_tol=0.0, abs_tol=0.0)
    elif operator == "<=":
        passed = actual <= target
    else:  # pragma: no cover - private caller controls this
        raise ValueError(f"unsupported gate operator {operator!r}")
    return {"operator": operator, "target": target, "passed": passed}


def calculate_replay_fidelity(
    records: Sequence[AttemptRecord], thresholds: EvaluationThresholds
) -> dict[str, Any]:
    groups: list[dict[str, Any]] = []
    matching = 0
    comparisons = 0
    total_runs = 0
    insufficient_groups = 0

    for record in records:
        if not record.replays:
            continue
        ordered = sorted(record.replays, key=lambda row: row.replay_index)
        baseline = ordered[0]
        matches = sum(
            item.artifact_sha256 == baseline.artifact_sha256
            and item.byte_count == baseline.byte_count
            for item in ordered[1:]
        )
        group_comparisons = max(0, len(ordered) - 1)
        matching += matches
        comparisons += group_comparisons
        total_runs += len(ordered)
        enough_runs = len(ordered) >= thresholds.minimum_replay_runs
        insufficient_groups += int(not enough_runs)
        groups.append(
            {
                "run_id": record.run_id,
                "task_id": record.task_id,
                "seed": record.seed,
                "replay_runs": len(ordered),
                "matching_comparisons": matches,
                "comparisons": group_comparisons,
                "byte_identical": matches == group_comparisons,
                "minimum_runs_met": enough_runs,
            }
        )

    if not groups or comparisons == 0:
        return {
            "status": "not_measured",
            "reason": "At least two replay artifacts are required for a run.",
            "minimum_replay_runs": thresholds.minimum_replay_runs,
            "groups": groups,
        }

    fidelity = matching / comparisons
    gate = _gate(fidelity, thresholds.replay_fidelity, operator="==")
    if not gate["passed"]:
        status = "fail"
    elif insufficient_groups:
        status = "partial"
    else:
        status = "pass"
    return {
        "status": status,
        "fidelity": fidelity,
        "matching_comparisons": matching,
        "comparisons": comparisons,
        "replay_runs": total_runs,
        "run_groups": len(groups),
        "insufficient_groups": insufficient_groups,
        "minimum_replay_runs": thresholds.minimum_replay_runs,
        "gate": gate,
        "comparison": "SHA-256 digest and byte length equality against replay 0",
        "groups": groups,
    }


def calculate_contamination_estimate(records: Sequence[AttemptRecord]) -> dict[str, Any]:
    measured = [row for row in records if row.sharpe is not None]
    if not measured:
        return {
            "status": "not_measured",
            "reason": "No paired real-world and counterfactual-world Sharpe values.",
            "definition": "real_world_sharpe - counterfactual_world_sharpe",
        }

    pairs: dict[tuple[str, str, int, str], dict[str, AttemptRecord]] = defaultdict(dict)
    for record in measured:
        assert record.pair_id is not None  # enforced by AttemptRecord
        pairs[(record.commit_sha, record.task_id, record.seed, record.pair_id)][record.world] = record

    rows: list[dict[str, Any]] = []
    incomplete: list[dict[str, Any]] = []
    for (commit_sha, task_id, seed, pair_id), worlds in sorted(pairs.items()):
        if set(worlds) != {"real", "counterfactual"}:
            incomplete.append(
                {
                    "commit_sha": commit_sha,
                    "task_id": task_id,
                    "seed": seed,
                    "pair_id": pair_id,
                    "worlds_present": sorted(worlds),
                }
            )
            continue
        real = worlds["real"]
        counterfactual = worlds["counterfactual"]
        assert real.sharpe is not None and counterfactual.sharpe is not None
        rows.append(
            {
                "commit_sha": commit_sha,
                "task_id": task_id,
                "seed": seed,
                "pair_id": pair_id,
                "real_world_sharpe": real.sharpe,
                "counterfactual_world_sharpe": counterfactual.sharpe,
                "contamination_delta": real.sharpe - counterfactual.sharpe,
            }
        )

    if not rows:
        return {
            "status": "not_measured",
            "reason": "Sharpe values exist, but no complete real/counterfactual pair exists.",
            "pair_groups": len(pairs),
            "incomplete_pairs": incomplete,
            "definition": "real_world_sharpe - counterfactual_world_sharpe",
        }

    deltas = [row["contamination_delta"] for row in rows]
    return {
        "status": "partial" if incomplete else "measured",
        "estimate": statistics.fmean(deltas),
        "median": statistics.median(deltas),
        "population_stddev": statistics.pstdev(deltas),
        "complete_pairs": len(rows),
        "pair_groups": len(pairs),
        "pair_coverage": len(rows) / len(pairs),
        "incomplete_pairs": incomplete,
        "definition": "mean(real_world_sharpe - counterfactual_world_sharpe)",
        "pairs": rows,
    }


def calculate_cost_per_verified_finding(
    records: Sequence[AttemptRecord],
) -> dict[str, Any]:
    total_cost = sum((row.cost_usd for row in records), start=Decimal("0"))
    verified = [
        (record.run_id, finding.finding_id)
        for record in records
        for finding in record.findings
        if finding.verifier_passed
    ]
    attempted = sum(len(record.findings) for record in records)
    if not verified:
        return {
            "status": "not_measured",
            "reason": "No verifier-passing findings exist in the evidence.",
            "total_cost_usd": float(total_cost),
            "attempted_findings": attempted,
            "verified_findings": 0,
        }
    cost_per_finding = total_cost / len(verified)
    return {
        "status": "measured",
        "cost_per_verified_finding_usd": float(cost_per_finding),
        "total_cost_usd": float(total_cost),
        "attempted_findings": attempted,
        "verified_findings": len(verified),
        "definition": "total recorded model/tool cost / verifier-passing findings",
    }


def calculate_recovery_rate(
    records: Sequence[AttemptRecord], thresholds: EvaluationThresholds
) -> dict[str, Any]:
    faults = [fault for record in records for fault in record.faults]
    if not faults:
        return {
            "status": "not_measured",
            "reason": "No deterministic fault-injection trials were recorded.",
            "minimum_fault_trials": thresholds.minimum_fault_trials,
        }
    recovered = sum(fault.recovered for fault in faults)
    rate = recovered / len(faults)
    gate = _gate(rate, thresholds.recovery_rate, operator=">=")
    if len(faults) < thresholds.minimum_fault_trials:
        status = "partial"
    else:
        status = "pass" if gate["passed"] else "fail"
    by_type: dict[str, dict[str, Any]] = {}
    grouped: dict[str, list[bool]] = defaultdict(list)
    for fault in faults:
        grouped[fault.fault_type].append(fault.recovered)
    for fault_type, outcomes in sorted(grouped.items()):
        by_type[fault_type] = {
            "recovered": sum(outcomes),
            "trials": len(outcomes),
            "rate": sum(outcomes) / len(outcomes),
        }
    return {
        "status": status,
        "recovery_rate": rate,
        "recovered": recovered,
        "fault_trials": len(faults),
        "minimum_fault_trials": thresholds.minimum_fault_trials,
        "gate": gate,
        "by_fault_type": by_type,
    }


def calculate_judge_human_agreement(
    records: Sequence[AttemptRecord], thresholds: EvaluationThresholds
) -> dict[str, Any]:
    judgments = [judgment for record in records for judgment in record.judgments]
    if not judgments:
        return {
            "status": "not_measured",
            "reason": "No paired judge and human labels were recorded.",
            "minimum_judgments": thresholds.minimum_judgments,
        }

    judge_counts = Counter(row.judge_label for row in judgments)
    human_counts = Counter(row.human_label for row in judgments)
    labels = sorted(set(judge_counts) | set(human_counts))
    count = len(judgments)
    agreements = sum(row.judge_label == row.human_label for row in judgments)
    observed = agreements / count
    expected = sum(
        (judge_counts[label] / count) * (human_counts[label] / count)
        for label in labels
    )
    if math.isclose(expected, 1.0):
        return {
            "status": "undefined",
            "reason": "Cohen's kappa is undefined when expected agreement is 1.",
            "judgments": count,
            "raw_agreement": observed,
            "expected_agreement": expected,
            "labels": labels,
        }

    kappa = (observed - expected) / (1.0 - expected)
    gate = _gate(kappa, thresholds.judge_human_kappa, operator=">=")
    if count < thresholds.minimum_judgments:
        status = "partial"
    else:
        status = "pass" if gate["passed"] else "fail"
    return {
        "status": status,
        "cohens_kappa": kappa,
        "judgments": count,
        "minimum_judgments": thresholds.minimum_judgments,
        "raw_agreement": observed,
        "expected_agreement": expected,
        "labels": labels,
        "gate": gate,
    }


def calculate_regression_metrics(
    records: Sequence[AttemptRecord], thresholds: EvaluationThresholds
) -> dict[str, Any]:
    real_records = [row for row in records if row.world == "real"]
    if not real_records:
        return {
            "status": "not_measured",
            "reason": "No real-world task outcomes were recorded.",
            "commits": [],
        }

    by_commit: dict[str, list[AttemptRecord]] = defaultdict(list)
    for record in real_records:
        by_commit[record.commit_sha].append(record)

    commits: list[dict[str, Any]] = []
    for commit_sha, commit_records in sorted(by_commit.items()):
        tasks = sorted({row.task_id for row in commit_records})
        seeds = sorted({row.seed for row in commit_records})
        task_seed_pairs = {(row.task_id, row.seed) for row in commit_records}
        expected_pairs = {(task, seed) for task in tasks for seed in seeds}
        coverage = len(task_seed_pairs) / len(expected_pairs)

        seed_pass_rates: dict[str, float] = {}
        for seed in seeds:
            outcomes = [row.passed for row in commit_records if row.seed == seed]
            seed_pass_rates[str(seed)] = sum(outcomes) / len(outcomes)
        pass_rate = sum(row.passed for row in commit_records) / len(commit_records)
        seed_variance = statistics.pvariance(seed_pass_rates.values())
        seed_stddev = math.sqrt(seed_variance)
        pass_gate = _gate(
            pass_rate, thresholds.regression_pass_rate, operator=">="
        )
        variance_gate = _gate(
            seed_variance, thresholds.maximum_seed_variance, operator="<="
        )
        complete = coverage == 1.0 and len(seeds) >= thresholds.minimum_seeds
        if not complete:
            status = "partial"
        else:
            status = "pass" if pass_gate["passed"] and variance_gate["passed"] else "fail"
        commits.append(
            {
                "commit_sha": commit_sha,
                "status": status,
                "pass_rate": pass_rate,
                "passed_attempts": sum(row.passed for row in commit_records),
                "attempts": len(commit_records),
                "tasks": len(tasks),
                "seeds": len(seeds),
                "minimum_seeds": thresholds.minimum_seeds,
                "task_seed_coverage": coverage,
                "seed_pass_rates": seed_pass_rates,
                "seed_variance": seed_variance,
                "seed_stddev": seed_stddev,
                "pass_rate_gate": pass_gate,
                "seed_variance_gate": variance_gate,
            }
        )

    statuses = {row["status"] for row in commits}
    if "fail" in statuses:
        status = "fail"
    elif "partial" in statuses:
        status = "partial"
    else:
        status = "pass"
    return {"status": status, "commits": commits}


def build_evaluation_report(
    records: Iterable[AttemptRecord],
    *,
    thresholds: EvaluationThresholds | None = None,
    source_sha256: str | None = None,
) -> dict[str, Any]:
    """Build a deterministic scorecard from validated attempt evidence."""

    thresholds = thresholds or EvaluationThresholds()
    ordered = validate_attempt_records(records)
    evidence = [record.to_dict() for record in ordered]
    evaluation_id = canonical_sha256(evidence)
    metrics = {
        "replay_fidelity": calculate_replay_fidelity(ordered, thresholds),
        "contamination_estimate": calculate_contamination_estimate(ordered),
        "cost_per_verified_finding": calculate_cost_per_verified_finding(ordered),
        "fault_recovery_rate": calculate_recovery_rate(ordered, thresholds),
        "judge_human_agreement": calculate_judge_human_agreement(ordered, thresholds),
        "regression_by_commit": calculate_regression_metrics(ordered, thresholds),
    }
    incomplete_statuses = {"not_measured", "partial", "undefined"}
    publication_status = (
        "complete"
        if all(metric["status"] not in incomplete_statuses for metric in metrics.values())
        else "incomplete"
    )
    gates_passed = publication_status == "complete" and all(
        metric["status"] not in {"fail"} for metric in metrics.values()
    )
    return {
        "schema_version": "1.0",
        "evaluation_id": evaluation_id,
        "evidence_cutoff_utc": max(row.recorded_at_utc for row in ordered),
        "source_sha256": source_sha256,
        "attempt_records": len(ordered),
        "publication_status": publication_status,
        "all_gates_passed": gates_passed,
        "metrics": metrics,
    }
