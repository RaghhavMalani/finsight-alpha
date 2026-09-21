"""Frozen adversarial tasks for Dynamics Lab theory certification.

The suite is intentionally small and deterministic. It tests whether the OU
adapter accepts genuine exact-transition controls and, more importantly,
whether it refuses processes for which the OU explanation is false.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from typing import Callable, Sequence

import numpy as np

from src.dynamics.contracts import HypothesisLedger, ScientificVerdict
from src.dynamics.ou_theory import certify_ou, generate_exact_ou


_OBSERVATIONS = 180
_ORIGIN = datetime(2025, 1, 2, 21, 0, tzinfo=timezone.utc)


def _regular_deltas() -> list[float]:
    return [1.0] * (_OBSERVATIONS - 1)


def _irregular_deltas() -> list[float]:
    pattern = (0.25, 0.5, 1.0, 1.75, 3.0, 0.75, 2.0)
    return [pattern[index % len(pattern)] for index in range(_OBSERVATIONS - 1)]


def _timestamps(delta_times: Sequence[float]) -> list[datetime]:
    timestamps = [_ORIGIN]
    for delta_time in delta_times:
        timestamps.append(timestamps[-1] + timedelta(days=float(delta_time)))
    return timestamps


def _random_walk(delta_times: Sequence[float], seed: int) -> list[float]:
    rng = np.random.default_rng(seed)
    increments = rng.normal(0.0, np.sqrt(np.asarray(delta_times)) * 0.18)
    return [float(value) for value in np.concatenate([[0.0], np.cumsum(increments)])]


def _trend(delta_times: Sequence[float], seed: int) -> list[float]:
    rng = np.random.default_rng(seed)
    elapsed = np.concatenate([[0.0], np.cumsum(np.asarray(delta_times))])
    return [float(value) for value in 0.018 * elapsed + rng.normal(0.0, 0.05, len(elapsed))]


def _regime_shift(delta_times: Sequence[float], seed: int) -> list[float]:
    base = np.asarray(generate_exact_ou(delta_times, theta=0.24, sigma=0.18, seed=seed))
    base[78:] += 1.25
    return [float(value) for value in base]


def _time_varying_reversion(delta_times: Sequence[float], seed: int) -> list[float]:
    rng = np.random.default_rng(seed)
    values = np.empty(len(delta_times) + 1, dtype=float)
    values[0] = 0.4
    for index, delta_time in enumerate(delta_times, start=1):
        theta = 0.5 if index < 72 else 0.025
        decay = math.exp(-theta * float(delta_time))
        variance = (0.2**2 / (2.0 * theta)) * (1.0 - math.exp(-2.0 * theta * float(delta_time)))
        values[index] = values[index - 1] * decay + math.sqrt(variance) * rng.normal()
    return [float(value) for value in values]


def _heavy_tailed(delta_times: Sequence[float], seed: int) -> list[float]:
    rng = np.random.default_rng(seed)
    shocks = rng.standard_t(df=2.4, size=len(delta_times)) / math.sqrt(2.4 / 0.4)
    return generate_exact_ou(
        delta_times,
        theta=0.22,
        sigma=0.24,
        seed=seed,
        innovations=shocks,
    )


def _jump_process(delta_times: Sequence[float], seed: int) -> list[float]:
    values = np.asarray(generate_exact_ou(delta_times, theta=0.2, sigma=0.16, seed=seed))
    values[[41, 86, 119, 153]] += np.asarray([1.8, -2.2, 2.0, -1.7])
    return [float(value) for value in values]


def _explosive_process(delta_times: Sequence[float], seed: int) -> list[float]:
    rng = np.random.default_rng(seed)
    theta = -0.03
    sigma = 0.05
    values = np.empty(len(delta_times) + 1, dtype=float)
    values[0] = 0.2
    for index, delta_time in enumerate(delta_times, start=1):
        decay = math.exp(-theta * float(delta_time))
        variance = (sigma * sigma / (2.0 * theta)) * (
            1.0 - math.exp(-2.0 * theta * float(delta_time))
        )
        values[index] = values[index - 1] * decay + math.sqrt(variance) * rng.normal()
    return [float(value) for value in values]


_CaseFactory = Callable[[Sequence[float], int], list[float]]


def _exact_control(delta_times: Sequence[float], seed: int) -> list[float]:
    return generate_exact_ou(delta_times, theta=0.24, mu=-0.08, sigma=0.2, seed=seed)


_FROZEN_CASES: tuple[tuple[str, str, str, bool, int, _CaseFactory], ...] = (
    ("ou-clean-regular", "Exact OU / regular clock", "ACCEPT", False, 700, _exact_control),
    ("ou-clean-irregular", "Exact OU / irregular clock", "ACCEPT", True, 701, _exact_control),
    ("unit-root", "Unit-root random walk", "REJECT", False, 700, _random_walk),
    ("unit-root-irregular", "Unit-root / irregular clock", "REJECT", True, 703, _random_walk),
    ("deterministic-trend", "Deterministic trend", "REJECT", False, 704, _trend),
    ("level-break", "Pre-holdout level break", "REJECT", False, 705, _regime_shift),
    ("time-varying-theta", "Time-varying reversion", "REJECT", False, 700, _time_varying_reversion),
    ("heavy-tailed", "Heavy-tailed innovations", "REJECT", False, 707, _heavy_tailed),
    ("jump-process", "Sparse jump process", "REJECT", True, 708, _jump_process),
    ("explosive-process", "Explosive anti-reversion", "REJECT", False, 709, _explosive_process),
)


def run_ou_certification_suite() -> dict[str, object]:
    """Run the immutable D0.1 controls and report theory false accepts."""

    tasks: list[dict[str, object]] = []
    for case_id, label, expected, irregular, seed, factory in _FROZEN_CASES:
        deltas = _irregular_deltas() if irregular else _regular_deltas()
        timestamps = _timestamps(deltas)
        artifact = certify_ou(
            factory(deltas, seed),
            observable=f"frozen control: {label}",
            observed_at=timestamps,
            available_at=timestamps,
            as_of=timestamps[-1],
            time_unit="day",
            hypothesis_ledger=HypothesisLedger(
                hypotheses_considered=1,
                selection_procedure="frozen before suite execution",
                selection_timestamp=_ORIGIN - timedelta(days=1),
                selection_metric="sealed holdout negative log likelihood",
                holdout_untouched=True,
            ),
            source="dynamics-d0.1-frozen-certification",
            revision="ou-suite-1",
        )
        theory_accepted = artifact.scientific_verdict is ScientificVerdict.ACCEPT
        killed_by = [
            check.code
            for check in artifact.falsification_checks
            if check.critical and check.status.value != "PASS"
        ]
        correct = theory_accepted if expected == "ACCEPT" else not theory_accepted
        tasks.append(
            {
                "id": case_id,
                "label": label,
                "expected": expected,
                "scientific_verdict": artifact.scientific_verdict.value,
                "predictive_verdict": artifact.predictive_verdict.value,
                "theory_accepted": theory_accepted,
                "correct": correct,
                "killed_by": killed_by,
                "decision_summary": artifact.decision_summary,
                "world_hash": artifact.world_hash,
                "seed": seed,
            }
        )

    negative = [task for task in tasks if task["expected"] == "REJECT"]
    positive = [task for task in tasks if task["expected"] == "ACCEPT"]
    false_accepts = sum(bool(task["theory_accepted"]) for task in negative)
    true_accepts = sum(bool(task["theory_accepted"]) for task in positive)
    abstentions = sum(task["scientific_verdict"] == "ABSTAIN" for task in tasks)
    false_rejects = sum(task["scientific_verdict"] == "REJECT" for task in positive)
    payload: dict[str, object] = {
        "schema_version": "dynamics-certification/0.1.0",
        "suite_id": "ou-frozen-adversarial-001",
        "frozen": True,
        "headline": {
            "theory_false_accept_rate": false_accepts / len(negative),
            "false_accepts": false_accepts,
            "negative_controls": len(negative),
            "theory_true_accept_rate": true_accepts / len(positive),
            "true_accepts": true_accepts,
            "positive_controls": len(positive),
            "theory_abstention_rate": abstentions / len(tasks),
            "abstentions": abstentions,
            "total_controls": len(tasks),
            "theory_false_reject_rate": false_rejects / len(positive),
            "false_rejects": false_rejects,
        },
        "tasks": tasks,
    }
    payload["run_hash"] = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return payload
