"""D0.3.1 nonlinear power recovery and identifiability frontier.

The estimator under test is the byte-frozen D0.3 M0-M3 hierarchy.  This module
only generates known stochastic worlds, scores the unchanged estimator against
their disclosed truth, and reports where the resulting conclusions are or are
not identifiable.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from statistics import median
from typing import Any, Callable, Mapping, Sequence

import numpy as np

from src.dynamics.nonlinear import (
    MINIMUM_BOOTSTRAP_DOMINANCE,
    MINIMUM_FIELD_STABILITY,
    MINIMUM_M3_OVER_M2_IMPROVEMENT,
    MINIMUM_NONLINEAR_OOS_IMPROVEMENT,
    NonlinearDynamicsError,
    fit_nonlinear_dynamics,
)
from src.dynamics.selection_freeze import canonical_sha256


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D03_ARTIFACT = ROOT / "eval/dynamics/d0_3/nonlinear_certification.json"
DEFAULT_D031_ARTIFACT = (
    ROOT / "eval/dynamics/d0_3_1/nonlinear_identifiability.json"
)
ESTIMATOR_SOURCE = Path(__file__).with_name("nonlinear.py")
POWER_THRESHOLD = 0.80
TOPOLOGY_LOCATION_TOLERANCE = 0.40


class IdentifiabilityError(ValueError):
    """Raised when a D0.3.1 experiment would break its frozen boundary."""


@dataclass(frozen=True)
class WorldSpec:
    cell_id: str
    family: str
    observations: int
    expected_model: str
    effect_band: str
    theta: float = 0.18
    sigma: float = 0.30
    cubic: float = 0.0
    gamma: float = 0.0
    quadratic: float = 0.0
    measurement_noise: float = 0.0
    missingness: float = 0.0
    delta_time: float = 1.0
    expected_stable_points: tuple[float, ...] = ()
    expected_unstable_points: tuple[float, ...] = ()
    assumption_violation: str | None = None


def _estimator_protocol() -> dict[str, Any]:
    source_bytes = ESTIMATOR_SOURCE.read_bytes()
    parent_bytes = DEFAULT_D03_ARTIFACT.read_bytes()
    parent = json.loads(parent_bytes)
    return {
        "milestone": "D0.3",
        "schema_version": "dynamics-nonlinear/0.3.0",
        "immutable": True,
        "source_file": "src/dynamics/nonlinear.py",
        "source_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "parent_artifact": "eval/dynamics/d0_3/nonlinear_certification.json",
        "parent_artifact_hash": parent["artifact_hash"],
        "parent_file_sha256": hashlib.sha256(parent_bytes).hexdigest(),
        "hierarchy": ["M0", "M1", "M2", "M3"],
        "bootstrap_repetitions": 8,
        "selection_thresholds": {
            "minimum_nonlinear_oos_improvement": (
                MINIMUM_NONLINEAR_OOS_IMPROVEMENT
            ),
            "minimum_m3_over_m2_improvement": MINIMUM_M3_OVER_M2_IMPROVEMENT,
            "minimum_bootstrap_dominance": MINIMUM_BOOTSTRAP_DOMINANCE,
            "minimum_field_stability": MINIMUM_FIELD_STABILITY,
        },
        "mutation_policy": (
            "No estimator, spline, regularization, promotion, bootstrap, or "
            "holdout rule may change inside D0.3.1."
        ),
    }


def _reference_specs() -> tuple[WorldSpec, ...]:
    specs: list[WorldSpec] = []
    for observations in (100, 250, 500):
        for cubic, effect_band in (
            (0.0, "linear"),
            (0.08, "weak"),
            (0.30, "medium"),
            (0.70, "strong"),
        ):
            specs.append(
                WorldSpec(
                    cell_id=f"cubic-b{cubic:.2f}-n{observations}",
                    family="linear_ou" if cubic == 0.0 else "cubic",
                    observations=observations,
                    expected_model="M1" if cubic == 0.0 else "M2",
                    effect_band=effect_band,
                    theta=0.10,
                    sigma=0.28,
                    cubic=cubic,
                    expected_stable_points=(0.0,),
                )
            )
    for observations in (120, 300, 600):
        for gamma, effect_band in ((0.15, "weak"), (0.35, "medium"), (0.65, "strong")):
            specs.append(
                WorldSpec(
                    cell_id=f"diffusion-g{gamma:.2f}-n{observations}",
                    family="state_diffusion",
                    observations=observations,
                    expected_model="M3",
                    effect_band=effect_band,
                    theta=0.32,
                    sigma=0.24,
                    gamma=gamma,
                    expected_stable_points=(0.0,),
                )
            )
    for observations in (250, 500):
        specs.append(
            WorldSpec(
                cell_id=f"double-well-n{observations}",
                family="double_well",
                observations=observations,
                expected_model="M2",
                effect_band="strong",
                theta=0.72,
                sigma=0.42,
                cubic=0.72,
                expected_stable_points=(-1.0, 1.0),
                expected_unstable_points=(0.0,),
            )
        )
    specs.extend(
        (
            WorldSpec(
                cell_id="asymmetric-medium-n300",
                family="asymmetric",
                observations=300,
                expected_model="M2",
                effect_band="medium",
                theta=0.16,
                sigma=0.28,
                cubic=0.30,
                quadratic=0.10,
            ),
            WorldSpec(
                cell_id="cubic-noisy-n300",
                family="cubic",
                observations=300,
                expected_model="M2",
                effect_band="medium",
                theta=0.10,
                sigma=0.28,
                cubic=0.30,
                measurement_noise=0.35,
                expected_stable_points=(0.0,),
            ),
            WorldSpec(
                cell_id="cubic-missing-n300",
                family="cubic",
                observations=300,
                expected_model="M2",
                effect_band="medium",
                theta=0.10,
                sigma=0.28,
                cubic=0.30,
                missingness=0.30,
                expected_stable_points=(0.0,),
            ),
            WorldSpec(
                cell_id="random-walk-n300",
                family="random_walk",
                observations=300,
                expected_model="ABSTAIN",
                effect_band="misspecified",
                sigma=0.28,
                assumption_violation="no stationary restoring force",
            ),
            WorldSpec(
                cell_id="jump-contamination-n300",
                family="jump_contamination",
                observations=300,
                expected_model="ABSTAIN",
                effect_band="misspecified",
                theta=0.22,
                sigma=0.25,
                assumption_violation="discontinuous jump component",
            ),
            WorldSpec(
                cell_id="regime-switch-n300",
                family="regime_switch",
                observations=300,
                expected_model="ABSTAIN",
                effect_band="misspecified",
                theta=0.22,
                sigma=0.28,
                assumption_violation="time-varying drift law",
            ),
        )
    )
    return tuple(specs)


def _smoke_specs() -> tuple[WorldSpec, ...]:
    wanted = {
        "cubic-b0.00-n100",
        "cubic-b0.08-n100",
        "cubic-b0.30-n250",
        "cubic-b0.70-n500",
        "diffusion-g0.15-n120",
        "diffusion-g0.35-n300",
        "diffusion-g0.65-n600",
        "double-well-n250",
        "cubic-noisy-n300",
        "random-walk-n300",
        "jump-contamination-n300",
    }
    return tuple(spec for spec in _reference_specs() if spec.cell_id in wanted)


def _drift(spec: WorldSpec, state: float, fraction: float) -> float:
    if spec.family == "random_walk":
        return 0.0
    if spec.family == "double_well":
        return spec.theta * state - spec.cubic * state**3
    if spec.family == "asymmetric":
        return (
            -spec.theta * state
            - spec.cubic * state**3
            + spec.quadratic * state**2
        )
    if spec.family == "regime_switch":
        theta = spec.theta * (2.8 if fraction < 0.52 else 0.35)
        return -theta * state
    return -spec.theta * state - spec.cubic * state**3


def _diffusion(spec: WorldSpec, state: float) -> float:
    if spec.family == "state_diffusion":
        return spec.sigma * math.exp(float(np.clip(spec.gamma * state, -1.2, 1.2)))
    return spec.sigma


def _simulate_world(
    spec: WorldSpec, seed: int
) -> tuple[np.ndarray, list[datetime], np.ndarray]:
    rng = np.random.default_rng(seed)
    clock_pattern = np.asarray((0.45, 0.8, 1.0, 1.7, 0.6, 1.25, 2.1))
    delta_times = np.resize(clock_pattern * spec.delta_time, spec.observations - 1)
    if spec.missingness > 0.0:
        missing = rng.random(spec.observations - 1) < spec.missingness
        delta_times = delta_times * np.where(missing, 2.0, 1.0)

    latent = np.zeros(spec.observations, dtype=float)
    if spec.family == "double_well":
        latent[0] = -1.0
    for index, elapsed in enumerate(delta_times):
        current = float(latent[index])
        substeps = max(1, int(math.ceil(float(elapsed) / 0.12)))
        step = float(elapsed) / substeps
        fraction = index / max(spec.observations - 2, 1)
        for _ in range(substeps):
            drift = _drift(spec, current, fraction)
            diffusion = _diffusion(spec, current)
            current += drift * step + diffusion * math.sqrt(step) * float(rng.normal())
            if spec.family == "jump_contamination" and rng.random() < 0.045 * step:
                current += float(rng.normal(0.0, 1.20))
            current = float(np.clip(current, -4.5, 4.5))
        latent[index + 1] = current

    observed = latent.copy()
    if spec.measurement_noise > 0.0:
        observed += rng.normal(
            0.0, spec.measurement_noise * spec.sigma, spec.observations
        )
    start = datetime(2022, 1, 3, tzinfo=timezone.utc)
    timestamps = [start]
    for elapsed in delta_times:
        timestamps.append(timestamps[-1] + timedelta(days=float(elapsed)))
    return observed, timestamps, delta_times


def _identified_model(artifact: Mapping[str, Any]) -> str:
    verdicts = artifact["verdicts"]
    if verdicts["nonlinear_dynamics"] == "ACCEPT":
        return str(verdicts["selected_model"])
    m1 = next(model for model in artifact["models"] if model["code"] == "M1")
    return "M1" if m1["scientific_verdict"] == "ACCEPT" else "ABSTAIN"


def _match_points(
    expected: Sequence[float], inferred: Sequence[float], tolerance: float
) -> int:
    remaining = list(float(value) for value in inferred)
    matches = 0
    for truth in expected:
        if not remaining:
            break
        index = min(range(len(remaining)), key=lambda item: abs(remaining[item] - truth))
        if abs(remaining[index] - truth) <= tolerance:
            matches += 1
            remaining.pop(index)
    return matches


def _truth_functions(
    spec: WorldSpec,
) -> tuple[Callable[[np.ndarray], np.ndarray], Callable[[np.ndarray], np.ndarray]]:
    def drift(states: np.ndarray) -> np.ndarray:
        if spec.family == "double_well":
            return spec.theta * states - spec.cubic * states**3
        if spec.family == "asymmetric":
            return (
                -spec.theta * states
                - spec.cubic * states**3
                + spec.quadratic * states**2
            )
        return -spec.theta * states - spec.cubic * states**3

    def diffusion(states: np.ndarray) -> np.ndarray:
        if spec.family == "state_diffusion":
            return spec.sigma * np.exp(np.clip(spec.gamma * states, -1.2, 1.2))
        return np.full_like(states, spec.sigma, dtype=float)

    return drift, diffusion


def _reconstruction_errors(
    spec: WorldSpec, artifact: Mapping[str, Any]
) -> tuple[float | None, float | None]:
    if spec.expected_model not in {"M1", "M2", "M3"}:
        return None, None
    points = artifact["fields"][spec.expected_model]["points"]
    states = np.asarray([point["state"] for point in points], dtype=float)
    estimated_drift = np.asarray([point["drift"] for point in points], dtype=float)
    estimated_diffusion = np.asarray(
        [point["diffusion"] for point in points], dtype=float
    )
    weights = np.asarray(
        [max(float(point["local_transition_support"]), 1.0) for point in points]
    )
    weights /= float(np.sum(weights))
    true_drift_fn, true_diffusion_fn = _truth_functions(spec)
    true_drift = true_drift_fn(states)
    true_diffusion = true_diffusion_fn(states)
    drift_denominator = float(np.sum(weights * np.square(true_drift)))
    diffusion_denominator = float(np.sum(weights * np.square(true_diffusion)))
    drift_error = float(
        np.sum(weights * np.square(estimated_drift - true_drift))
        / max(drift_denominator, 1e-10)
    )
    diffusion_error = float(
        np.sum(weights * np.square(estimated_diffusion - true_diffusion))
        / max(diffusion_denominator, 1e-10)
    )
    return drift_error, diffusion_error


def _score_world(
    spec: WorldSpec, repetition: int, spec_index: int
) -> dict[str, Any]:
    seed = 41_000 + spec_index * 100 + repetition
    values, observed_at, delta_times = _simulate_world(spec, seed)
    available_at = [timestamp + timedelta(minutes=12) for timestamp in observed_at]
    artifact = fit_nonlinear_dynamics(
        values.tolist(),
        observable=f"d0.3.1::{spec.cell_id}",
        observed_at=observed_at,
        available_at=available_at,
        as_of=available_at[-1],
        time_unit="day",
        train_fraction=0.72,
        source="controlled-synthetic-identifiability",
        revision=f"d0.3.1-{seed}",
        bootstrap_repetitions=8,
        seed=seed,
    )
    identified = _identified_model(artifact)
    selected_code = str(artifact["verdicts"]["selected_model"])
    inferred_points = artifact["fields"][selected_code]["fixed_points"]
    certified = [point for point in inferred_points if point["certified_for_display"]]
    inferred_stable = [float(point["state"]) for point in certified if point["stable"]]
    inferred_unstable = [
        float(point["state"]) for point in certified if not point["stable"]
    ]
    stable_matches = _match_points(
        spec.expected_stable_points,
        inferred_stable,
        TOPOLOGY_LOCATION_TOLERANCE,
    )
    unstable_matches = _match_points(
        spec.expected_unstable_points,
        inferred_unstable,
        TOPOLOGY_LOCATION_TOLERANCE,
    )
    topology_evaluated = spec.family == "double_well"
    topology_match = bool(
        topology_evaluated
        and stable_matches == len(spec.expected_stable_points)
        and unstable_matches == len(spec.expected_unstable_points)
        and len(inferred_stable) == len(spec.expected_stable_points)
        and len(inferred_unstable) == len(spec.expected_unstable_points)
    )
    drift_error, diffusion_error = _reconstruction_errors(spec, artifact)
    landscape = None
    if topology_evaluated:
        source_points = artifact["fields"][selected_code]["points"][::4]
        states = np.asarray([point["state"] for point in source_points], dtype=float)
        true_potential = -(
            spec.theta * np.square(states)
            - 0.5 * spec.cubic * np.power(states, 4)
        ) / max(spec.sigma**2, 1e-10)
        true_potential -= float(np.min(true_potential))
        landscape = {
            "selected_model": selected_code,
            "points": [
                {
                    "state": float(state),
                    "true_potential": float(truth),
                    "inferred_potential": float(point["effective_potential"]),
                }
                for state, truth, point in zip(
                    states,
                    true_potential,
                    source_points,
                )
            ],
        }
    return {
        "cell_id": spec.cell_id,
        "family": spec.family,
        "repetition": repetition,
        "seed": seed,
        "truth": {
            "expected_model": spec.expected_model,
            "effect_band": spec.effect_band,
            "observations": spec.observations,
            "theta": spec.theta,
            "sigma": spec.sigma,
            "cubic": spec.cubic,
            "gamma": spec.gamma,
            "measurement_noise": spec.measurement_noise,
            "missingness": spec.missingness,
            "assumption_violation": spec.assumption_violation,
            "stable_points": list(spec.expected_stable_points),
            "unstable_points": list(spec.expected_unstable_points),
        },
        "observed_clock": {
            "minimum_delta_time": float(np.min(delta_times)),
            "maximum_delta_time": float(np.max(delta_times)),
            "unique_delta_times": int(len(np.unique(np.round(delta_times, 10)))),
        },
        "inference": {
            "identified_model": identified,
            "reported_selected_model": selected_code,
            "correct_model": identified == spec.expected_model,
            "nonlinear_detected": identified in {"M2", "M3"},
            "economic_verdict": artifact["verdicts"]["economic"],
            "stable_points": inferred_stable,
            "unstable_points": inferred_unstable,
            "stable_point_matches": stable_matches,
            "unstable_point_matches": unstable_matches,
            "topology_evaluated": topology_evaluated,
            "topology_match": topology_match,
            "drift_reconstruction_error": drift_error,
            "diffusion_reconstruction_error": diffusion_error,
            "landscape": landscape,
            "best_nonlinear_oos_gain": max(
                float(artifact["promotion"][code]["adjusted_nll_gain_over_ou"])
                for code in ("M2", "M3")
            ),
            "best_nonlinear_bootstrap_dominance": max(
                float(
                    artifact["promotion"][code][
                        "paired_bootstrap_dominance_over_ou"
                    ]
                )
                for code in ("M2", "M3")
            ),
        },
    }


def _ratio(numerator: int, denominator: int, *, empty: float = 0.0) -> float:
    return numerator / denominator if denominator else empty


def _wilson_interval(successes: int, total: int) -> dict[str, float]:
    if total == 0:
        return {"lower_95": 0.0, "upper_95": 1.0}
    z = 1.959963984540054
    rate = successes / total
    denominator = 1.0 + z * z / total
    center = (rate + z * z / (2.0 * total)) / denominator
    half = (
        z
        * math.sqrt(rate * (1.0 - rate) / total + z * z / (4.0 * total * total))
        / denominator
    )
    return {"lower_95": max(0.0, center - half), "upper_95": min(1.0, center + half)}


def _identifiability_label(correct_probability: float) -> str:
    if correct_probability >= POWER_THRESHOLD:
        return "HIGH"
    if correct_probability >= 0.50:
        return "MEDIUM"
    if correct_probability > 0.0:
        return "LOW"
    return "UNRESOLVED"


def _group_frontier(
    cases: Sequence[Mapping[str, Any]], family: str, effect_key: str
) -> list[dict[str, Any]]:
    grouped: dict[tuple[float, int], list[Mapping[str, Any]]] = {}
    for case in cases:
        if case["family"] != family:
            continue
        truth = case["truth"]
        key = (float(truth[effect_key]), int(truth["observations"]))
        grouped.setdefault(key, []).append(case)
    rows: list[dict[str, Any]] = []
    for (effect, observations), members in sorted(grouped.items()):
        correct = sum(bool(member["inference"]["correct_model"]) for member in members)
        detected = sum(
            bool(member["inference"]["nonlinear_detected"]) for member in members
        )
        abstained = sum(
            member["inference"]["identified_model"] == "ABSTAIN" for member in members
        )
        probability = correct / len(members)
        rows.append(
            {
                effect_key: effect,
                "observations": observations,
                "runs": len(members),
                "correct_selection_probability": probability,
                "nonlinear_detection_probability": detected / len(members),
                "abstention_probability": abstained / len(members),
                "confidence": _wilson_interval(correct, len(members)),
                "identifiability": _identifiability_label(probability),
            }
        )
    return rows


def _minimum_detectable(
    rows: Sequence[Mapping[str, Any]], effect_key: str
) -> list[dict[str, Any]]:
    sample_sizes = sorted({int(row["observations"]) for row in rows})
    output = []
    for observations in sample_sizes:
        eligible = [
            row
            for row in rows
            if int(row["observations"]) == observations
            and float(row[effect_key]) > 0.0
            and float(row["nonlinear_detection_probability"]) >= POWER_THRESHOLD
        ]
        output.append(
            {
                "observations": observations,
                f"minimum_detectable_{effect_key}": (
                    min(float(row[effect_key]) for row in eligible)
                    if eligible
                    else None
                ),
                "power_threshold": POWER_THRESHOLD,
            }
        )
    return output


def _metric_summary(cases: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    linear = [case for case in cases if case["truth"]["expected_model"] == "M1"]
    nonlinear = [
        case for case in cases if case["truth"]["expected_model"] in {"M2", "M3"}
    ]
    state_diffusion = [
        case for case in cases if case["truth"]["expected_model"] == "M3"
    ]
    misspecified = [
        case for case in cases if case["truth"]["expected_model"] == "ABSTAIN"
    ]
    double_well = [case for case in cases if case["family"] == "double_well"]
    predicted_stable = sum(
        len(case["inference"]["stable_points"]) for case in double_well
    )
    true_stable = sum(len(case["truth"]["stable_points"]) for case in double_well)
    matched_stable = sum(
        int(case["inference"]["stable_point_matches"]) for case in double_well
    )
    no_basin = [case for case in cases if case["family"] == "random_walk"]
    false_basin = sum(
        bool(case["inference"]["stable_points"]) for case in no_basin
    )
    correct = sum(bool(case["inference"]["correct_model"]) for case in cases)
    drift_errors = [
        float(case["inference"]["drift_reconstruction_error"])
        for case in nonlinear
        if case["inference"]["drift_reconstruction_error"] is not None
    ]
    diffusion_errors = [
        float(case["inference"]["diffusion_reconstruction_error"])
        for case in nonlinear
        if case["inference"]["diffusion_reconstruction_error"] is not None
    ]
    by_band: dict[str, float] = {}
    for band in ("weak", "medium", "strong"):
        members = [case for case in nonlinear if case["truth"]["effect_band"] == band]
        by_band[band] = _ratio(
            sum(bool(case["inference"]["correct_model"]) for case in members),
            len(members),
        )
    return {
        "theory_identification_accuracy": _ratio(correct, len(cases)),
        "linear_specificity": _ratio(
            sum(not case["inference"]["nonlinear_detected"] for case in linear),
            len(linear),
        ),
        "false_nonlinear_discovery_rate": _ratio(
            sum(case["inference"]["nonlinear_detected"] for case in linear),
            len(linear),
        ),
        "nonlinear_detection_rate": _ratio(
            sum(case["inference"]["correct_model"] for case in nonlinear),
            len(nonlinear),
        ),
        "nonlinear_false_negative_rate": _ratio(
            sum(not case["inference"]["correct_model"] for case in nonlinear),
            len(nonlinear),
        ),
        "detection_by_effect_band": by_band,
        "state_dependent_diffusion_detection": _ratio(
            sum(case["inference"]["correct_model"] for case in state_diffusion),
            len(state_diffusion),
        ),
        "misspecification_abstention_rate": _ratio(
            sum(case["inference"]["identified_model"] == "ABSTAIN" for case in misspecified),
            len(misspecified),
        ),
        "basin_precision": _ratio(matched_stable, predicted_stable, empty=1.0),
        "basin_recall": _ratio(matched_stable, true_stable),
        "potential_topology_accuracy": _ratio(
            sum(case["inference"]["topology_match"] for case in double_well),
            len(double_well),
        ),
        "false_basin_discovery_rate": _ratio(false_basin, len(no_basin)),
        "basin_counts": {
            "matched_stable_points": matched_stable,
            "predicted_stable_points": predicted_stable,
            "true_stable_points": true_stable,
        },
        "median_drift_reconstruction_error": median(drift_errors) if drift_errors else None,
        "median_diffusion_reconstruction_error": (
            median(diffusion_errors) if diffusion_errors else None
        ),
    }


def _minimum_reliable_sample_size(
    frontier: Sequence[Mapping[str, Any]], effect_key: str, minimum_effect: float
) -> int | None:
    candidates = [
        int(row["observations"])
        for row in frontier
        if float(row[effect_key]) >= minimum_effect
        and float(row["correct_selection_probability"]) >= POWER_THRESHOLD
    ]
    return min(candidates) if candidates else None


def _real_market_context(
    cubic_frontier: Sequence[Mapping[str, Any]], reference: Mapping[str, Any]
) -> dict[str, Any]:
    observations = int(reference["reference"]["world"]["observations"])
    weak_rows = [row for row in cubic_frontier if float(row["cubic"]) == 0.08]
    nearest = min(
        weak_rows,
        key=lambda row: abs(int(row["observations"]) - observations),
    )
    power = float(nearest["nonlinear_detection_probability"])
    identifiability = "LOW" if power < 0.50 else "MEDIUM" if power < 0.80 else "HIGH"
    return {
        "source": "frozen D0.2.1 survivor evaluated by D0.3",
        "pair_id": reference["reference"]["experiment"]["pair_id"],
        "observations": observations,
        "d03_selected_model": reference["reference"]["verdicts"]["selected_model"],
        "d03_nonlinear_verdict": reference["reference"]["verdicts"][
            "nonlinear_dynamics"
        ],
        "effect_region": "unknown; weak-effect row used as a conservative local reference",
        "nearest_frontier_cell": nearest,
        "identifiability": identifiability,
        "claim": (
            "No nonlinear structure was certified. This is not evidence that the "
            "market law is linear when the matched power region is below the "
            "prespecified threshold."
        ),
    }


@lru_cache(maxsize=6)
def run_nonlinear_identifiability_suite(
    repetitions: int = 1, profile: str = "reference"
) -> dict[str, Any]:
    """Measure the unchanged D0.3 estimator on synthetic worlds with known truth."""

    if not 1 <= repetitions <= 20:
        raise IdentifiabilityError("repetitions must be in [1, 20]")
    if profile not in {"reference", "smoke"}:
        raise IdentifiabilityError("profile must be reference or smoke")
    specs = _reference_specs() if profile == "reference" else _smoke_specs()
    protocol = _estimator_protocol()
    cases = [
        _score_world(spec, repetition, spec_index)
        for spec_index, spec in enumerate(specs)
        for repetition in range(repetitions)
    ]
    cubic_frontier = _group_frontier(cases, "cubic", "cubic")
    linear_frontier = _group_frontier(cases, "linear_ou", "cubic")
    cubic_frontier = sorted(
        [*linear_frontier, *cubic_frontier],
        key=lambda row: (float(row["cubic"]), int(row["observations"])),
    )
    diffusion_frontier = _group_frontier(cases, "state_diffusion", "gamma")
    metrics = _metric_summary(cases)
    parent = json.loads(DEFAULT_D03_ARTIFACT.read_text(encoding="utf-8"))
    capability_card = {
        "status": "CALIBRATED" if repetitions >= 10 else "PRELIMINARY",
        "worlds": len(cases),
        "repetitions_per_cell": repetitions,
        **metrics,
        "minimum_reliable_sample_size": {
            "strong_nonlinear_drift": _minimum_reliable_sample_size(
                cubic_frontier, "cubic", 0.70
            ),
            "strong_state_diffusion": _minimum_reliable_sample_size(
                diffusion_frontier, "gamma", 0.65
            ),
        },
        "weak_effect_policy": "ABSTAIN when measured correct-selection power is below 80%",
    }
    payload: dict[str, Any] = {
        "schema_version": "dynamics-identifiability/0.3.1",
        "milestone": "D0.3.1",
        "question": (
            "Under what conditions can the frozen D0.3 estimator reliably detect "
            "nonlinear stochastic dynamics when they truly exist?"
        ),
        "frozen": True,
        "profile": profile,
        "estimator_protocol": protocol,
        "experiment_axes": [
            "family",
            "observations",
            "delta_time",
            "sigma",
            "cubic",
            "gamma",
            "measurement_noise",
            "missingness",
            "assumption_violation",
        ],
        "power_threshold": POWER_THRESHOLD,
        "cells": len(specs),
        "runs": len(cases),
        "cases": cases,
        "frontiers": {
            "nonlinear_drift": cubic_frontier,
            "state_dependent_diffusion": diffusion_frontier,
            "minimum_detectable_nonlinearity": _minimum_detectable(
                cubic_frontier, "cubic"
            ),
            "minimum_detectable_state_diffusion": _minimum_detectable(
                diffusion_frontier, "gamma"
            ),
        },
        "capability_card": capability_card,
        "real_market_context": _real_market_context(cubic_frontier, parent),
        "interpretation": (
            "High specificity without nonlinear recall is underpowered, not a "
            "successful nonlinear discovery system. Frontier cells report measured "
            "power and uncertainty without changing the estimator."
        ),
        "excluded_scope": [
            "estimator tuning",
            "estimator tournament",
            "Hawkes dynamics",
            "symbolic regression",
            "economic promotion",
        ],
    }
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


def verify_identifiability_artifact(
    artifact: Mapping[str, Any], *, verify_local_sources: bool = True
) -> dict[str, Any]:
    """Independently reconcile a frozen D0.3.1 artifact and its lineage."""

    errors: list[str] = []
    body = dict(artifact)
    claimed_hash = body.pop("artifact_hash", None)
    calculated_hash = canonical_sha256(body)
    if claimed_hash != calculated_hash:
        errors.append("artifact_hash does not match the canonical payload")
    if artifact.get("schema_version") != "dynamics-identifiability/0.3.1":
        errors.append("schema_version is not dynamics-identifiability/0.3.1")
    if artifact.get("frozen") is not True:
        errors.append("identifiability protocol is not frozen")
    protocol = artifact.get("estimator_protocol", {})
    if not isinstance(protocol, Mapping) or protocol.get("immutable") is not True:
        errors.append("D0.3 estimator is not recorded as immutable")
    cases = artifact.get("cases", [])
    if not isinstance(cases, list) or artifact.get("runs") != len(cases):
        errors.append("case ledger does not reconcile to run count")
    if any(
        case.get("inference", {}).get("economic_verdict") != "ABSTAIN"
        for case in cases
        if isinstance(case, Mapping)
    ):
        errors.append("a synthetic power world escaped the economic abstention gate")
    if verify_local_sources and isinstance(protocol, Mapping):
        if hashlib.sha256(ESTIMATOR_SOURCE.read_bytes()).hexdigest() != protocol.get(
            "source_sha256"
        ):
            errors.append("frozen D0.3 estimator source bytes changed")
        parent_bytes = DEFAULT_D03_ARTIFACT.read_bytes()
        if hashlib.sha256(parent_bytes).hexdigest() != protocol.get(
            "parent_file_sha256"
        ):
            errors.append("frozen D0.3 parent artifact bytes changed")
        parent = json.loads(parent_bytes)
        if parent.get("artifact_hash") != protocol.get("parent_artifact_hash"):
            errors.append("D0.3 parent content address changed")
    return {
        "valid": not errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "runs": len(cases) if isinstance(cases, list) else 0,
        "errors": errors,
    }


def load_frozen_identifiability_artifact(
    path: Path = DEFAULT_D031_ARTIFACT,
) -> dict[str, Any]:
    """Load the byte-frozen D0.3.1 UI/reference artifact fail closed."""

    if not path.exists():
        raise IdentifiabilityError(
            "the frozen D0.3.1 artifact is unavailable; run the freeze script"
        )
    artifact = json.loads(path.read_text(encoding="utf-8"))
    verification = verify_identifiability_artifact(artifact)
    if not verification["valid"]:
        raise IdentifiabilityError("; ".join(verification["errors"]))
    return artifact
