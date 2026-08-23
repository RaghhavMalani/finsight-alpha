"""Reward-discrimination and distribution metrics without ML dependencies."""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from typing import Any, Iterable, Mapping


def discrimination_auc(
    verified_scores: Iterable[float],
    failed_scores: Iterable[float],
) -> float:
    """Return P(R+ > R-) with half credit for ties."""

    positives = tuple(float(value) for value in verified_scores)
    negatives = tuple(float(value) for value in failed_scores)
    if not positives or not negatives:
        raise ValueError("AUC requires at least one verified and one failed score")
    wins = sum(
        1.0 if positive > negative else 0.5 if positive == negative else 0.0
        for positive in positives
        for negative in negatives
    )
    return wins / (len(positives) * len(negatives))


def reward_histogram(values: Iterable[float]) -> dict[str, int]:
    bins = {f"{index / 10:.1f}-{(index + 1) / 10:.1f}": 0 for index in range(10)}
    for raw in values:
        value = max(0.0, min(1.0, float(raw)))
        index = min(9, int(value * 10))
        bins[f"{index / 10:.1f}-{(index + 1) / 10:.1f}"] += 1
    return bins


def _median(values: list[float]) -> float:
    return statistics.median(values) if values else math.nan


def discrimination_report(
    rows: Iterable[Mapping[str, Any]],
    *,
    score_key: str,
    variance_floor: float = 0.005,
) -> dict[str, Any]:
    frozen = tuple(rows)
    verified = [float(row[score_key]) for row in frozen if row["verified"]]
    failed = [float(row[score_key]) for row in frozen if not row["verified"]]
    task_groups: dict[str, list[float]] = defaultdict(list)
    for row in frozen:
        task_groups[str(row["task_id"])].append(float(row[score_key]))
    task_variances = {
        task_id: statistics.pvariance(values)
        for task_id, values in sorted(task_groups.items())
    }
    variable_tasks = sum(value >= variance_floor for value in task_variances.values())
    verified_median = _median(verified)
    failed_median = _median(failed)
    return {
        "reward_discrimination_auc": discrimination_auc(verified, failed),
        "verified_median": verified_median,
        "failed_median": failed_median,
        "median_separation": verified_median - failed_median,
        "verified_mean": statistics.fmean(verified),
        "failed_mean": statistics.fmean(failed),
        "failed_above_0_80_fraction": sum(value > 0.80 for value in failed) / len(failed),
        "near_perfect_above_0_95_fraction": (
            sum(float(row[score_key]) > 0.95 for row in frozen) / len(frozen)
        ),
        "overall_variance": statistics.pvariance(
            float(row[score_key]) for row in frozen
        ),
        "task_variances": task_variances,
        "task_variance_floor": variance_floor,
        "variable_task_fraction": variable_tasks / len(task_variances),
        "histogram": reward_histogram(float(row[score_key]) for row in frozen),
    }
