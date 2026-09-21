"""Deterministic pilot power map for the OU certification engine."""

from __future__ import annotations

import hashlib
import json
import math
from functools import lru_cache
from typing import Any

import numpy as np

from src.dynamics.contracts import ScientificVerdict
from src.dynamics.ou_theory import certify_ou, generate_exact_ou


_PILOT_SCENARIOS: tuple[dict[str, float | int | str], ...] = (
    {"id": "reference", "theta": 0.18, "sigma": 0.24, "observations": 180, "delta_time": 1.0, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "slow-reversion", "theta": 0.04, "sigma": 0.24, "observations": 180, "delta_time": 1.0, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "medium-reversion", "theta": 0.09, "sigma": 0.24, "observations": 180, "delta_time": 1.0, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "fast-reversion", "theta": 0.50, "sigma": 0.24, "observations": 180, "delta_time": 1.0, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "short-sample", "theta": 0.18, "sigma": 0.24, "observations": 96, "delta_time": 1.0, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "long-sample", "theta": 0.18, "sigma": 0.24, "observations": 360, "delta_time": 1.0, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "low-diffusion", "theta": 0.18, "sigma": 0.10, "observations": 180, "delta_time": 1.0, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "high-diffusion", "theta": 0.18, "sigma": 0.50, "observations": 180, "delta_time": 1.0, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "dense-clock", "theta": 0.18, "sigma": 0.24, "observations": 180, "delta_time": 0.25, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "sparse-clock", "theta": 0.18, "sigma": 0.24, "observations": 180, "delta_time": 2.0, "measurement_noise": 0.0, "break_magnitude": 0.0},
    {"id": "measurement-noise", "theta": 0.18, "sigma": 0.24, "observations": 180, "delta_time": 1.0, "measurement_noise": 0.50, "break_magnitude": 0.0},
    {"id": "pre-holdout-break", "theta": 0.18, "sigma": 0.24, "observations": 180, "delta_time": 1.0, "measurement_noise": 0.0, "break_magnitude": 1.50},
)


@lru_cache(maxsize=4)
def run_ou_power_map(repetitions: int = 6) -> dict[str, Any]:
    """Estimate a reproducible pilot power surface across six control axes."""

    if not 2 <= repetitions <= 50:
        raise ValueError("repetitions must be between 2 and 50")
    cells: list[dict[str, Any]] = []
    for scenario_index, scenario in enumerate(_PILOT_SCENARIOS):
        verdicts: list[str] = []
        theta = float(scenario["theta"])
        sigma = float(scenario["sigma"])
        observations = int(scenario["observations"])
        delta_time = float(scenario["delta_time"])
        noise_ratio = float(scenario["measurement_noise"])
        break_magnitude = float(scenario["break_magnitude"])
        stationary_sigma = sigma / math.sqrt(2.0 * theta)
        for repetition in range(repetitions):
            seed = 20_000 + scenario_index * 100 + repetition
            values = np.asarray(
                generate_exact_ou(
                    [delta_time] * (observations - 1),
                    theta=theta,
                    sigma=sigma,
                    seed=seed,
                )
            )
            if noise_ratio > 0:
                values += np.random.default_rng(seed + 50_000).normal(
                    0.0, noise_ratio * stationary_sigma, observations
                )
            if break_magnitude > 0:
                break_index = int(observations * 0.45)
                values[break_index:] += break_magnitude * stationary_sigma
            artifact = certify_ou(
                values.tolist(),
                observable=f"power control {scenario['id']}",
                regular_dt=delta_time,
                source="dynamics-d0.2-power-map",
                revision="pilot-power-1",
            )
            verdicts.append(artifact.scientific_verdict.value)
        accepts = verdicts.count(ScientificVerdict.ACCEPT.value)
        rejects = verdicts.count(ScientificVerdict.REJECT.value)
        abstentions = verdicts.count(ScientificVerdict.ABSTAIN.value)
        expected = "REJECT" if break_magnitude > 0 else "ACCEPT"
        correct = rejects if expected == "REJECT" else accepts
        cells.append(
            {
                **scenario,
                "half_life": math.log(2.0) / theta,
                "expected": expected,
                "repetitions": repetitions,
                "acceptance_probability": accepts / repetitions,
                "rejection_probability": rejects / repetitions,
                "abstention_probability": abstentions / repetitions,
                "correct_certification_probability": correct / repetitions,
            }
        )
    payload: dict[str, Any] = {
        "schema_version": "dynamics-power/0.2.0",
        "map_id": "ou-pilot-power-001",
        "frozen": True,
        "axes": [
            "theta",
            "sigma",
            "observations",
            "delta_time",
            "measurement_noise",
            "break_magnitude",
        ],
        "method": "full D0.1 scientific certification over deterministic Monte Carlo controls",
        "repetitions_per_cell": repetitions,
        "cells": cells,
    }
    payload["run_hash"] = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return payload
