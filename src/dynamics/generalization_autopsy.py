"""D0.3.3.1 confirmation generalization autopsy.

This module is diagnostic only. It reads the frozen D0.3.3 evidence, rebuilds
only deterministic path descriptors from the sealed world metadata, and never
fits an estimator or selects an operating threshold.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

from src.dynamics.estimator_tournament import _world_hash
from src.dynamics.identifiability import _simulate_world
from src.dynamics.selection_freeze import canonical_sha256
from src.dynamics.targeted_recovery import (
    DEFAULT_D033_ARTIFACT,
    _planned_worlds,
    load_frozen_targeted_recovery,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D0331_ARTIFACT = ROOT / "eval/dynamics/d0_3_3_1/generalization_autopsy.json"
GENERALIZATION_AUTOPSY_SOURCE = Path(__file__)
TARGETED_RECOVERY_SOURCE = Path(__file__).with_name("targeted_recovery.py")

D033_ARTIFACT_HASH = "729af3f253a8878b158e21124bcea70f5d388d4f60f07f0c6ec1c2c3597f3fdc"
D033_FILE_SHA256 = "b038c55bcc7fc7632e8befb6a0daa2d679d957292f0a9c3e83fba8d174616993"
D033_SOURCE_SHA256 = "b2cf6fcfe38e9a469789a8f5fc89b514df3d807dc05b7a98093bd8fcd8bf8a98"

PARENT_SEALS: tuple[dict[str, str], ...] = (
    {
        "milestone": "D0.2.1",
        "artifact": "eval/dynamics/d0_2_1/selection_aware_certification.json",
        "artifact_hash": (
            "b5e759c3a4e71daad1d5eefb8303fa0e9da9ebca13ac36d79c488b4ec284d4b0"
        ),
        "file_sha256": (
            "e3c1d55e00c784b2b7ab6feb650ff02f284e86804d4ec2739118093401e43618"
        ),
    },
    {
        "milestone": "D0.3",
        "artifact": "eval/dynamics/d0_3/nonlinear_certification.json",
        "artifact_hash": (
            "751a3a42b87c198a2ec58905b968ff0f898c1f59b97d9d79199e30dff2d6e8b6"
        ),
        "file_sha256": (
            "429f8a0f8a8e08c1bf2668ad58709d0b5eaabfb40cb31ebf86e32de0c827d515"
        ),
    },
    {
        "milestone": "D0.3.1",
        "artifact": "eval/dynamics/d0_3_1/nonlinear_identifiability.json",
        "artifact_hash": (
            "347a7d7de2992434d50eba2b8c1afd80b0fe69a872cbf77f2ac8b1334b551e72"
        ),
        "file_sha256": (
            "40ab6d4098461a1adb93e61bb395eff2e141209c05fe978b0878955a0969d213"
        ),
    },
    {
        "milestone": "D0.3.2",
        "artifact": "eval/dynamics/d0_3_2/estimator_tournament.json",
        "artifact_hash": (
            "b5302ed706d4ee75cc40e2275f32c75f61aa0c1853fcf3cc46b24db892a85c9f"
        ),
        "file_sha256": (
            "033732cb23c86a12a63cc0783ee84ae518fe7fcddb76cd5eb9aced899b8f19d0"
        ),
    },
    {
        "milestone": "D0.3.2.1",
        "artifact": "eval/dynamics/d0_3_2_1/failure_decomposition.json",
        "artifact_hash": (
            "b6b8b5e7851791254df33935fe28ffcb433d4533013f7a0d13380705f614f781"
        ),
        "file_sha256": (
            "ce4d92b294c802b72be531a969011e3c82196881173ae172ff62c1b1f8609688"
        ),
        "source_sha256": (
            "1f10fc1b70b8772aca4a137807e642ba73cb99c8e9ffb0a575bacc7e89c76920"
        ),
    },
    {
        "milestone": "D0.3.3",
        "artifact": "eval/dynamics/d0_3_3/targeted_recovery.json",
        "artifact_hash": D033_ARTIFACT_HASH,
        "file_sha256": D033_FILE_SHA256,
        "source_sha256": D033_SOURCE_SHA256,
    },
)

GATE_DEFINITIONS: dict[str, dict[str, float | str | None]] = {
    "linear_specificity": {"gate": 0.95, "direction": "higher"},
    "false_nonlinear_discovery_rate": {"gate": 0.05, "direction": "lower"},
    "false_basin_discovery_rate": {"gate": 0.05, "direction": "lower"},
    "double_well_detection": {"gate": 0.80, "direction": "higher"},
    "basin_precision": {"gate": None, "direction": "higher"},
    "basin_recall": {"gate": 0.75, "direction": "higher"},
    "potential_topology_accuracy": {"gate": 0.75, "direction": "higher"},
    "state_diffusion_detection": {"gate": 0.80, "direction": "higher"},
    "numerical_failure_rate": {"gate": 0.02, "direction": "lower"},
    "sealed_holdout_compliance": {"gate": 1.0, "direction": "higher"},
}

LOCKED_THRESHOLDS: dict[str, dict[str, float]] = {
    "topology_certificate_score": {"threshold": 0.40, "descriptive_band": 0.10},
    "root_persistence_support": {"threshold": 0.40, "descriptive_band": 0.10},
    "diffusion_twice_log_likelihood_ratio": {
        "threshold": 0.0,
        "descriptive_band": 2.0,
    },
    "diffusion_max_min_ratio": {"threshold": 1.70, "descriptive_band": 0.10},
    "diffusion_bootstrap_dominance": {
        "threshold": 0.50,
        "descriptive_band": 0.10,
    },
}

REAL_MARKET_INTERPRETATION = (
    "No nonlinear structure was certified by an estimator whose nonlinear "
    "identification power is currently insufficient."
)


class GeneralizationAutopsyError(ValueError):
    """Raised when the D0.3.3.1 diagnostic evidence fails closed."""


def wilson_interval(numerator: int, denominator: int) -> list[float] | None:
    """Return a two-sided Wilson 95 percent interval for a proportion."""

    if denominator <= 0 or numerator < 0 or numerator > denominator:
        return None
    z = 1.959963984540054
    proportion = numerator / denominator
    z2 = z * z
    center = (proportion + z2 / (2.0 * denominator)) / (1.0 + z2 / denominator)
    half = (
        z
        * math.sqrt(
            proportion * (1.0 - proportion) / denominator
            + z2 / (4.0 * denominator * denominator)
        )
        / (1.0 + z2 / denominator)
    )
    return [max(0.0, center - half), min(1.0, center + half)]


def gate_margin(value: float, gate: float | None, direction: str) -> float | None:
    if gate is None:
        return None
    if direction == "higher":
        return value - gate
    if direction == "lower":
        return gate - value
    raise GeneralizationAutopsyError(f"unsupported gate direction: {direction}")


def signed_worsening(development: float, confirmation: float, direction: str) -> float:
    if direction == "higher":
        return development - confirmation
    if direction == "lower":
        return confirmation - development
    raise GeneralizationAutopsyError(f"unsupported metric direction: {direction}")


def waterfall_attrition(stage_a: int, stage_b: int) -> float | None:
    if stage_a <= 0:
        return None
    return 1.0 - stage_b / stage_a


def _point_matches(expected: Sequence[float], inferred: Sequence[float]) -> int:
    remaining = [float(value) for value in inferred]
    matches = 0
    for truth in expected:
        if not remaining:
            break
        index = min(
            range(len(remaining)), key=lambda item: abs(remaining[item] - truth)
        )
        if abs(remaining[index] - truth) <= 0.42:
            matches += 1
            remaining.pop(index)
    return matches


def _case_metric_counts(
    cases: Sequence[Mapping[str, Any]],
) -> dict[str, tuple[int, int]]:
    double_well = [row for row in cases if row["role"] == "double_well"]
    state_diffusion = [row for row in cases if row["role"] == "state_diffusion"]
    linear = [row for row in cases if row["role"] == "linear_control"]
    basin_controls = [
        row for row in cases if row["role"] in {"linear_control", "no_basin_control"}
    ]
    matched_stable = sum(
        _point_matches(row["truth"]["stable_points"], row["after"]["stable_points"])
        for row in double_well
    )
    predicted_stable = sum(len(row["after"]["stable_points"]) for row in double_well)
    true_stable = sum(len(row["truth"]["stable_points"]) for row in double_well)
    repairs = [
        repair
        for row in cases
        for repair in (row.get("topology_repair"), row.get("diffusion_repair"))
        if repair is not None
    ]
    return {
        "linear_specificity": (
            sum(not row["after"]["nonlinear_detected"] for row in linear),
            len(linear),
        ),
        "false_nonlinear_discovery_rate": (
            sum(row["after"]["nonlinear_detected"] for row in linear),
            len(linear),
        ),
        "false_basin_discovery_rate": (
            sum(row["after"]["topology_certified"] for row in basin_controls),
            len(basin_controls),
        ),
        "double_well_detection": (
            sum(row["after"]["topology_certified"] for row in double_well),
            len(double_well),
        ),
        "basin_precision": (matched_stable, predicted_stable),
        "basin_recall": (matched_stable, true_stable),
        "potential_topology_accuracy": (
            sum(row["after"]["topology_match"] for row in double_well),
            len(double_well),
        ),
        "state_diffusion_detection": (
            sum(row["after"]["state_diffusion_certified"] for row in state_diffusion),
            len(state_diffusion),
        ),
        "numerical_failure_rate": (
            sum(bool(repair["numerical_failure"]) for repair in repairs),
            len(repairs),
        ),
        "sealed_holdout_compliance": (
            sum(bool(repair["sealed_holdout_evaluated"]) for repair in repairs),
            len(repairs),
        ),
    }


def _metric_table(parent: Mapping[str, Any]) -> list[dict[str, Any]]:
    development = _case_metric_counts(parent["development_cases"])
    confirmation = _case_metric_counts(parent["confirmation_cases"])
    rows: list[dict[str, Any]] = []
    for metric, definition in GATE_DEFINITIONS.items():
        dev_num, dev_den = development[metric]
        con_num, con_den = confirmation[metric]
        dev_value = dev_num / dev_den if dev_den else 1.0
        con_value = con_num / con_den if con_den else 1.0
        gate = definition["gate"]
        direction = str(definition["direction"])
        rows.append(
            {
                "metric": metric,
                "direction": direction,
                "gate": gate,
                "development": {
                    "value": dev_value,
                    "numerator": dev_num,
                    "denominator": dev_den,
                    "wilson_95": wilson_interval(dev_num, dev_den),
                    "margin_to_gate": gate_margin(
                        dev_value,
                        float(gate) if gate is not None else None,
                        direction,
                    ),
                },
                "confirmation": {
                    "value": con_value,
                    "numerator": con_num,
                    "denominator": con_den,
                    "wilson_95": wilson_interval(con_num, con_den),
                    "margin_to_gate": gate_margin(
                        con_value,
                        float(gate) if gate is not None else None,
                        direction,
                    ),
                },
                "signed_generalization_worsening": signed_worsening(
                    dev_value, con_value, direction
                ),
            }
        )
    return rows


def _quantile(values: Sequence[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(float(value) for value in values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def _distribution(values: Sequence[float]) -> dict[str, float | int | None]:
    finite = [float(value) for value in values if math.isfinite(float(value))]
    return {
        "count": len(finite),
        "minimum": min(finite) if finite else None,
        "q25": _quantile(finite, 0.25),
        "median": _quantile(finite, 0.50),
        "q75": _quantile(finite, 0.75),
        "maximum": max(finite) if finite else None,
        "mean": sum(finite) / len(finite) if finite else None,
    }


def _planned_world_index() -> dict[tuple[str, str], Any]:
    return {
        (planned.split, planned.spec.cell_id): planned
        for split in ("development", "confirmation")
        for planned in _planned_worlds(split)
    }


def _regenerate_path(
    case: Mapping[str, Any], planned_index: Mapping[tuple[str, str], Any]
) -> tuple[np.ndarray, np.ndarray]:
    key = (str(case["split"]), str(case["cell_id"]))
    planned = planned_index.get(key)
    if planned is None or int(case["seed"]) != planned.seed:
        raise GeneralizationAutopsyError(
            f"world metadata does not match the frozen plan: {case['cell_id']}"
        )
    values, observed_at, delta_times = _simulate_world(planned.spec, planned.seed)
    if _world_hash(values, observed_at) != case["world_hash"]:
        raise GeneralizationAutopsyError(
            f"world hash does not match deterministic regeneration: {case['cell_id']}"
        )
    return values, delta_times


def _double_well_path_record(
    case: Mapping[str, Any],
    values: np.ndarray,
) -> dict[str, Any]:
    stable_points = sorted(float(value) for value in case["truth"]["stable_points"])
    barrier = float(case["truth"]["unstable_points"][0])
    left, right = stable_points
    separation = right - left
    left_cut = (left + barrier) / 2.0
    right_cut = (barrier + right) / 2.0
    left_mask = values <= left_cut
    right_mask = values >= right_cut
    barrier_mask = ~(left_mask | right_mask)
    centered = values - barrier
    signs = np.sign(centered)
    nonzero_signs = signs[signs != 0.0]
    barrier_crossings = int(np.sum(nonzero_signs[:-1] * nonzero_signs[1:] < 0.0))
    basin_labels = np.where(left_mask, -1, np.where(right_mask, 1, 0))
    visited_basins = [int(value) for value in basin_labels if value != 0]
    compressed = [
        value
        for index, value in enumerate(visited_basins)
        if index == 0 or value != visited_basins[index - 1]
    ]
    completed_transitions = sum(
        left_label != right_label
        for left_label, right_label in zip(compressed[:-1], compressed[1:])
    )
    near_radius = 0.15 * separation
    coverage_low = left - 0.25 * separation
    coverage_high = right + 0.25 * separation
    counts, _ = np.histogram(
        np.clip(values, coverage_low, coverage_high),
        bins=np.linspace(coverage_low, coverage_high, 13),
    )
    return {
        "split": case["split"],
        "cell_id": case["cell_id"],
        "seed": case["seed"],
        "world_hash": case["world_hash"],
        "observations": int(len(values)),
        "left_basin_occupancy": float(np.mean(left_mask)),
        "right_basin_occupancy": float(np.mean(right_mask)),
        "barrier_region_occupancy": float(np.mean(barrier_mask)),
        "barrier_crossings": barrier_crossings,
        "completed_basin_transitions": int(completed_transitions),
        "observed_state_min": float(np.min(values)),
        "observed_state_max": float(np.max(values)),
        "observed_state_range": float(np.ptp(values)),
        "state_space_coverage": float(np.mean(counts > 0)),
        "samples_near_left_stable": int(np.sum(np.abs(values - left) <= near_radius)),
        "samples_near_right_stable": int(np.sum(np.abs(values - right) <= near_radius)),
        "samples_near_unstable": int(np.sum(np.abs(values - barrier) <= near_radius)),
        "effective_sample_size": {
            "status": "UNAVAILABLE",
            "reason": "No accepted effective-sample-size implementation exists in the repository.",
        },
    }


def _state_diffusion_path_record(
    case: Mapping[str, Any],
    values: np.ndarray,
    delta_times: np.ndarray,
) -> dict[str, Any]:
    truth = case["truth"]
    theta = float(truth["theta"])
    sigma = float(truth["sigma"])
    gamma = float(truth["gamma"])
    stationary_scale = sigma / math.sqrt(2.0 * theta)
    standardized = values / stationary_scale
    bin_edges = np.asarray([-np.inf, -2.0, -1.0, 0.0, 1.0, 2.0, np.inf], dtype=float)
    state_bin = np.digitize(standardized[:-1], bin_edges[1:-1])
    occupancy_counts = [
        int(np.sum(state_bin == index)) for index in range(len(bin_edges) - 1)
    ]
    increments = np.diff(values)
    drift = -theta * values[:-1] * delta_times
    innovations = (increments - drift) / np.sqrt(delta_times)
    conditional_variances = [
        (
            float(np.mean(np.square(innovations[state_bin == index])))
            if occupancy_counts[index]
            else None
        )
        for index in range(len(occupancy_counts))
    ]
    positive_variances = [
        value for value in conditional_variances if value is not None and value > 0.0
    ]
    conditional_contrast = (
        max(positive_variances) / min(positive_variances)
        if positive_variances
        else None
    )
    true_diffusion = sigma * np.exp(np.clip(gamma * values[:-1], -1.2, 1.2))
    global_low = sigma * math.exp(-1.2)
    global_high = sigma * math.exp(1.2)
    visited_fraction = (
        float(np.ptp(true_diffusion)) / (global_high - global_low)
        if global_high > global_low
        else 1.0
    )
    repair = case["diffusion_repair"]
    return {
        "split": case["split"],
        "cell_id": case["cell_id"],
        "seed": case["seed"],
        "world_hash": case["world_hash"],
        "observations": int(len(values)),
        "visited_x_min": float(np.min(values)),
        "visited_x_max": float(np.max(values)),
        "visited_x_range": float(np.ptp(values)),
        "standardized_state_bin_edges": [
            "-inf",
            -2.0,
            -1.0,
            0.0,
            1.0,
            2.0,
            "inf",
        ],
        "occupancy_by_state_bin": [
            {
                "bin": index,
                "count": count,
                "fraction": count / max(len(values) - 1, 1),
                "conditional_variance": conditional_variances[index],
            }
            for index, count in enumerate(occupancy_counts)
        ],
        "minimum_samples_per_support_bin": min(occupancy_counts),
        "state_support_coverage": sum(count > 0 for count in occupancy_counts)
        / len(occupancy_counts),
        "conditional_variance_contrast": conditional_contrast,
        "true_g_contrast_over_visited_support": float(
            np.max(true_diffusion) / np.min(true_diffusion)
        ),
        "estimated_g_contrast": float(repair["diffusion_max_min_ratio"]),
        "ground_truth_diffusion_range_visited_fraction": min(
            1.0, max(0.0, visited_fraction)
        ),
    }


def _path_information(parent: Mapping[str, Any]) -> dict[str, Any]:
    planned_index = _planned_world_index()
    double_records: list[dict[str, Any]] = []
    diffusion_records: list[dict[str, Any]] = []
    for case in [*parent["development_cases"], *parent["confirmation_cases"]]:
        if case["role"] not in {"double_well", "state_diffusion"}:
            continue
        values, delta_times = _regenerate_path(case, planned_index)
        if case["role"] == "double_well":
            double_records.append(_double_well_path_record(case, values))
        else:
            diffusion_records.append(
                _state_diffusion_path_record(case, values, delta_times)
            )
    return {
        "definitions": {
            "double_well_basin_boundaries": (
                "Midpoints between each true stable point and the true barrier."
            ),
            "double_well_near_point_radius": (
                "Fifteen percent of true stable-point separation."
            ),
            "double_well_coverage": (
                "Occupied fraction of 12 truth-anchored state bins."
            ),
            "state_diffusion_bins": (
                "Six bins in state divided by sigma/sqrt(2*theta), with outer overflow bins."
            ),
            "diffusion_range_fraction": (
                "Visited true g(x) span divided by the generator's clipped true g(x) span."
            ),
            "estimator_rerun": False,
        },
        "double_well": {
            "world_records": double_records,
            "summaries": _path_summaries(double_records, "double_well"),
        },
        "state_diffusion": {
            "world_records": diffusion_records,
            "summaries": _path_summaries(diffusion_records, "state_diffusion"),
        },
    }


def _path_summaries(
    records: Sequence[Mapping[str, Any]], family: str
) -> dict[str, Any]:
    fields = (
        (
            "left_basin_occupancy",
            "right_basin_occupancy",
            "barrier_region_occupancy",
            "barrier_crossings",
            "completed_basin_transitions",
            "observed_state_range",
            "state_space_coverage",
            "samples_near_left_stable",
            "samples_near_right_stable",
            "samples_near_unstable",
        )
        if family == "double_well"
        else (
            "visited_x_range",
            "minimum_samples_per_support_bin",
            "state_support_coverage",
            "conditional_variance_contrast",
            "true_g_contrast_over_visited_support",
            "estimated_g_contrast",
            "ground_truth_diffusion_range_visited_fraction",
        )
    )
    return {
        split: {
            field: _distribution(
                [
                    float(row[field])
                    for row in records
                    if row["split"] == split and row[field] is not None
                ]
            )
            for field in fields
        }
        for split in ("development", "confirmation")
    }


DOUBLE_WELL_STAGE_ORDER = (
    "oracle_family_discrimination",
    "field_reconstruction_correctness",
    "root_recovery",
    "stable_unstable_sign_sequence",
    "bootstrap_root_persistence",
    "basin_recovery",
    "potential_topology_recovery",
    "final_certification",
)

STATE_DIFFUSION_STAGE_ORDER = (
    "oracle_family_discrimination",
    "drift_reconstruction",
    "innovation_construction",
    "conditional_variance_signal",
    "g_reconstruction",
    "state_support_coverage",
    "diffusion_decision",
    "final_certification",
)


def _double_well_stage_record(case: Mapping[str, Any]) -> dict[str, Any]:
    repair = case["topology_repair"]
    root_certificate = repair["root_certificate"]
    inferred_stable = [
        float(root["location"]) for root in root_certificate if root["stable"]
    ]
    truth_stable = case["truth"]["stable_points"]
    basin_recovery = len(inferred_stable) == len(truth_stable) and _point_matches(
        truth_stable, inferred_stable
    ) == len(truth_stable)
    return {
        "split": case["split"],
        "cell_id": case["cell_id"],
        "stages": {
            "oracle_family_discrimination": bool(
                case["oracle"] and case["oracle"]["correct"]
            ),
            "field_reconstruction_correctness": bool(
                repair["full_field"]["topology_match"]
            ),
            "root_recovery": bool(repair["root_clustering_pass"]),
            "stable_unstable_sign_sequence": (
                float(repair["sign_topology_support"]) >= 0.40
            ),
            "bootstrap_root_persistence": (
                float(repair["root_persistence_support"]) >= 0.40
            ),
            "basin_recovery": basin_recovery,
            "potential_topology_recovery": bool(
                repair["full_field"]["barrier"]["exists"]
                and repair["full_field"]["topology_match"]
            ),
            "final_certification": bool(case["after"]["topology_match"]),
        },
    }


def _state_diffusion_stage_record(case: Mapping[str, Any]) -> dict[str, Any]:
    repair = case["diffusion_repair"]
    return {
        "split": case["split"],
        "cell_id": case["cell_id"],
        "stages": {
            "oracle_family_discrimination": bool(
                case["oracle"] and case["oracle"]["correct"]
            ),
            "drift_reconstruction": None,
            "innovation_construction": bool(
                repair["cross_fit"]["method"]
                == "two-fold moving-block cross-fitted innovations"
                and not repair["numerical_failure"]
            ),
            "conditional_variance_signal": bool(repair["variance_signal"]),
            "g_reconstruction": bool(repair["g_reconstruction_pass"]),
            "state_support_coverage": None,
            "diffusion_decision": bool(repair["threshold_eligible"]),
            "final_certification": bool(case["after"]["state_diffusion_certified"]),
        },
        "unavailable_reasons": {
            "drift_reconstruction": (
                "D0.3.3 did not freeze a standalone drift-reconstruction pass criterion."
            ),
            "state_support_coverage": (
                "D0.3.3 did not preregister a pass threshold for state-support coverage."
            ),
        },
    }


def _waterfall_summary(
    records: Sequence[Mapping[str, Any]], stage_order: Sequence[str]
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for split in ("development", "confirmation"):
        split_records = [row for row in records if row["split"] == split]
        prior_survivors: set[str] | None = {
            str(row["cell_id"]) for row in split_records
        }
        stages: list[dict[str, Any]] = []
        for stage in stage_order:
            available = [
                row for row in split_records if row["stages"].get(stage) is not None
            ]
            if not available:
                stages.append(
                    {
                        "stage": stage,
                        "status": "UNAVAILABLE",
                        "reason": next(
                            (
                                row.get("unavailable_reasons", {}).get(stage)
                                for row in split_records
                                if row.get("unavailable_reasons", {}).get(stage)
                            ),
                            "No compatible frozen evidence.",
                        ),
                        "raw": None,
                        "sequential": None,
                        "attrition_from_prior": None,
                    }
                )
                prior_survivors = None
                continue
            raw_passes = {
                str(row["cell_id"]) for row in available if row["stages"][stage]
            }
            if prior_survivors is None:
                sequential = None
                attrition = None
            else:
                sequential = prior_survivors & raw_passes
                attrition = waterfall_attrition(len(prior_survivors), len(sequential))
            stages.append(
                {
                    "stage": stage,
                    "status": "AVAILABLE",
                    "raw": {
                        "numerator": len(raw_passes),
                        "denominator": len(available),
                        "value": len(raw_passes) / len(available),
                    },
                    "sequential": (
                        {
                            "numerator": len(sequential),
                            "denominator": len(split_records),
                            "value": len(sequential) / len(split_records),
                        }
                        if sequential is not None
                        else None
                    ),
                    "attrition_from_prior": attrition,
                }
            )
            prior_survivors = sequential
        result[split] = {"worlds": len(split_records), "stages": stages}
    return result


def _causal_waterfalls(parent: Mapping[str, Any]) -> dict[str, Any]:
    cases = [*parent["development_cases"], *parent["confirmation_cases"]]
    double_records = [
        _double_well_stage_record(case)
        for case in cases
        if case["role"] == "double_well"
    ]
    diffusion_records = [
        _state_diffusion_stage_record(case)
        for case in cases
        if case["role"] == "state_diffusion"
    ]
    return {
        "double_well": {
            "world_records": double_records,
            "summaries": _waterfall_summary(double_records, DOUBLE_WELL_STAGE_ORDER),
        },
        "state_diffusion": {
            "world_records": diffusion_records,
            "summaries": _waterfall_summary(
                diffusion_records, STATE_DIFFUSION_STAGE_ORDER
            ),
        },
    }


def _control_diagnostics(parent: Mapping[str, Any]) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    for case in [*parent["development_cases"], *parent["confirmation_cases"]]:
        if case["role"] != "linear_control":
            continue
        topology = case["topology_repair"]
        diffusion = case["diffusion_repair"]
        clusters = topology["root_clusters"]
        records.append(
            {
                "split": case["split"],
                "cell_id": case["cell_id"],
                "maximum_spurious_root_persistence": max(
                    [float(row["persistence"]) for row in clusters], default=0.0
                ),
                "spurious_certified_roots": len(case["after"]["stable_points"])
                + len(case["after"]["unstable_points"]),
                "nonlinearity_score": float(topology["certificate_score"]),
                "diffusion_nonconstancy_score": float(
                    diffusion["diffusion_max_min_ratio"]
                ),
                "diffusion_twice_log_likelihood_ratio": float(
                    diffusion["twice_log_likelihood_ratio"]
                ),
                "false_positive": bool(case["after"]["nonlinear_detected"]),
            }
        )
    fields = (
        "maximum_spurious_root_persistence",
        "spurious_certified_roots",
        "nonlinearity_score",
        "diffusion_nonconstancy_score",
        "diffusion_twice_log_likelihood_ratio",
    )
    return {
        "world_records": records,
        "summaries": {
            split: {
                **{
                    field: _distribution(
                        [float(row[field]) for row in records if row["split"] == split]
                    )
                    for field in fields
                },
                "false_positive": {
                    "numerator": sum(
                        bool(row["false_positive"])
                        for row in records
                        if row["split"] == split
                    ),
                    "denominator": sum(row["split"] == split for row in records),
                },
            }
            for split in ("development", "confirmation")
        },
    }


def _threshold_records(parent: Mapping[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for case in [*parent["development_cases"], *parent["confirmation_cases"]]:
        candidates: list[tuple[str, float]] = []
        topology = case.get("topology_repair")
        diffusion = case.get("diffusion_repair")
        if topology is not None:
            candidates.extend(
                [
                    (
                        "topology_certificate_score",
                        float(topology["certificate_score"]),
                    ),
                    (
                        "root_persistence_support",
                        float(topology["root_persistence_support"]),
                    ),
                ]
            )
        if diffusion is not None:
            candidates.extend(
                [
                    (
                        "diffusion_twice_log_likelihood_ratio",
                        float(diffusion["twice_log_likelihood_ratio"]),
                    ),
                    (
                        "diffusion_max_min_ratio",
                        float(diffusion["diffusion_max_min_ratio"]),
                    ),
                    (
                        "diffusion_bootstrap_dominance",
                        float(diffusion["bootstrap_dominance"]),
                    ),
                ]
            )
        for gate, value in candidates:
            threshold = LOCKED_THRESHOLDS[gate]["threshold"]
            band = LOCKED_THRESHOLDS[gate]["descriptive_band"]
            margin = value - threshold
            records.append(
                {
                    "split": case["split"],
                    "cell_id": case["cell_id"],
                    "role": case["role"],
                    "gate": gate,
                    "value": value,
                    "frozen_threshold": threshold,
                    "margin": margin,
                    "descriptive_band": band,
                    "near_boundary": abs(margin) <= band,
                }
            )
    return records


def _threshold_summary(
    records: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    return {
        gate: {
            split: {
                "frozen_threshold": definition["threshold"],
                "descriptive_band": definition["descriptive_band"],
                "median_margin": _quantile(
                    [
                        float(row["margin"])
                        for row in records
                        if row["gate"] == gate and row["split"] == split
                    ],
                    0.5,
                ),
                "near_boundary_numerator": sum(
                    bool(row["near_boundary"])
                    for row in records
                    if row["gate"] == gate and row["split"] == split
                ),
                "near_boundary_denominator": sum(
                    row["gate"] == gate and row["split"] == split for row in records
                ),
            }
            for split in ("development", "confirmation")
        }
        for gate, definition in LOCKED_THRESHOLDS.items()
    }


def _metric_row(
    metric_table: Sequence[Mapping[str, Any]], metric: str
) -> Mapping[str, Any]:
    return next(row for row in metric_table if row["metric"] == metric)


def _stage_value(
    waterfalls: Mapping[str, Any], family: str, split: str, stage: str
) -> float | None:
    row = next(
        item
        for item in waterfalls[family]["summaries"][split]["stages"]
        if item["stage"] == stage
    )
    return None if row["raw"] is None else float(row["raw"]["value"])


def _make_flag(
    code: str,
    active: bool,
    evidence: list[dict[str, Any]],
    affected_worlds: Sequence[str],
    reason: str,
    computed_by: str,
) -> dict[str, Any]:
    if active and not evidence:
        raise GeneralizationAutopsyError(
            f"active diagnostic flag lacks computed evidence: {code}"
        )
    return {
        "code": code,
        "active": active,
        "evidence": evidence if active else [],
        "affected_worlds": sorted(set(affected_worlds)) if active else [],
        "reason": reason,
        "computed_by": computed_by,
    }


def _diagnostic_flags(
    metric_table: Sequence[Mapping[str, Any]],
    waterfalls: Mapping[str, Any],
    path_information: Mapping[str, Any],
    controls: Mapping[str, Any],
    threshold_sensitivity: Mapping[str, Any],
    parent: Mapping[str, Any],
) -> list[dict[str, Any]]:
    all_cases = [*parent["development_cases"], *parent["confirmation_cases"]]
    flags: list[dict[str, Any]] = []

    oracle_evidence: list[dict[str, Any]] = []
    oracle_worlds: list[str] = []
    for family in ("double_well", "state_diffusion"):
        development = _stage_value(
            waterfalls, family, "development", "oracle_family_discrimination"
        )
        confirmation = _stage_value(
            waterfalls, family, "confirmation", "oracle_family_discrimination"
        )
        if (
            development is not None
            and confirmation is not None
            and development - confirmation >= 0.10
        ):
            oracle_evidence.append(
                {
                    "family": family,
                    "development": development,
                    "confirmation": confirmation,
                    "drop": development - confirmation,
                }
            )
            oracle_worlds.extend(
                row["cell_id"]
                for row in waterfalls[family]["world_records"]
                if row["split"] == "confirmation"
                and not row["stages"]["oracle_family_discrimination"]
            )
    flags.append(
        _make_flag(
            "ORACLE_POWER_DROP",
            bool(oracle_evidence),
            oracle_evidence,
            oracle_worlds,
            "Confirmation oracle discrimination fell by at least 10 percentage points.",
            "development oracle pass rate minus confirmation oracle pass rate",
        )
    )

    field_dev = _stage_value(
        waterfalls,
        "double_well",
        "development",
        "field_reconstruction_correctness",
    )
    field_con = _stage_value(
        waterfalls,
        "double_well",
        "confirmation",
        "field_reconstruction_correctness",
    )
    field_active = bool(
        field_dev is not None
        and field_con is not None
        and field_dev - field_con >= 0.10
    )
    flags.append(
        _make_flag(
            "FIELD_RECOVERY_DROP",
            field_active,
            (
                [
                    {
                        "development": field_dev,
                        "confirmation": field_con,
                        "drop": float(field_dev) - float(field_con),
                    }
                ]
                if field_active
                else []
            ),
            [
                row["cell_id"]
                for row in waterfalls["double_well"]["world_records"]
                if row["split"] == "confirmation"
                and not row["stages"]["field_reconstruction_correctness"]
            ],
            "Double-well field recovery fell by at least 10 percentage points.",
            "development field-pass rate minus confirmation field-pass rate",
        )
    )

    root_dev = _stage_value(
        waterfalls,
        "double_well",
        "development",
        "bootstrap_root_persistence",
    )
    root_con = _stage_value(
        waterfalls,
        "double_well",
        "confirmation",
        "bootstrap_root_persistence",
    )
    root_active = bool(
        root_dev is not None and root_con is not None and root_dev - root_con >= 0.10
    )
    flags.append(
        _make_flag(
            "ROOT_PERSISTENCE_DROP",
            root_active,
            (
                [
                    {
                        "development": root_dev,
                        "confirmation": root_con,
                        "drop": float(root_dev) - float(root_con),
                    }
                ]
                if root_active
                else []
            ),
            [
                row["cell_id"]
                for row in waterfalls["double_well"]["world_records"]
                if row["split"] == "confirmation"
                and not row["stages"]["bootstrap_root_persistence"]
            ],
            "Bootstrap root persistence fell by at least 10 percentage points.",
            "development persistence-pass rate minus confirmation persistence-pass rate",
        )
    )

    certification_metrics = [
        _metric_row(metric_table, "double_well_detection"),
        _metric_row(metric_table, "state_diffusion_detection"),
    ]
    certification_losses = [
        {
            "metric": row["metric"],
            "development": row["development"]["value"],
            "confirmation": row["confirmation"]["value"],
            "worsening": row["signed_generalization_worsening"],
        }
        for row in certification_metrics
        if float(row["signed_generalization_worsening"]) >= 0.10
    ]
    flags.append(
        _make_flag(
            "CERTIFICATION_ATTRITION",
            bool(certification_losses),
            certification_losses,
            [
                str(case["cell_id"])
                for case in parent["confirmation_cases"]
                if case["role"] in {"double_well", "state_diffusion"}
                and not (
                    case["after"]["topology_certified"]
                    or case["after"]["state_diffusion_certified"]
                )
            ],
            "Final target-family certification fell by at least 10 percentage points.",
            "signed development-to-confirmation worsening",
        )
    )

    coverage_evidence: list[dict[str, Any]] = []
    coverage_worlds: list[str] = []
    for family, field in (
        ("double_well", "state_space_coverage"),
        ("state_diffusion", "state_support_coverage"),
    ):
        summaries = path_information[family]["summaries"]
        development = summaries["development"][field]["median"]
        confirmation = summaries["confirmation"][field]["median"]
        if (
            development is not None
            and confirmation is not None
            and development - confirmation >= 0.10
        ):
            coverage_evidence.append(
                {
                    "family": family,
                    "metric": field,
                    "development_median": development,
                    "confirmation_median": confirmation,
                    "drop": development - confirmation,
                }
            )
            coverage_worlds.extend(
                row["cell_id"]
                for row in path_information[family]["world_records"]
                if row["split"] == "confirmation"
                and float(row[field]) < float(development)
            )
    flags.append(
        _make_flag(
            "STATE_COVERAGE_DROP",
            bool(coverage_evidence),
            coverage_evidence,
            coverage_worlds,
            "Confirmation median state coverage fell by at least 0.10.",
            "development median coverage minus confirmation median coverage",
        )
    )

    variance_dev = _stage_value(
        waterfalls,
        "state_diffusion",
        "development",
        "conditional_variance_signal",
    )
    variance_con = _stage_value(
        waterfalls,
        "state_diffusion",
        "confirmation",
        "conditional_variance_signal",
    )
    visited = path_information["state_diffusion"]["summaries"]
    visited_dev = visited["development"][
        "ground_truth_diffusion_range_visited_fraction"
    ]["median"]
    visited_con = visited["confirmation"][
        "ground_truth_diffusion_range_visited_fraction"
    ]["median"]
    diffusion_undersampled = bool(
        variance_dev is not None
        and variance_con is not None
        and variance_dev - variance_con >= 0.10
        and visited_dev is not None
        and visited_con is not None
        and visited_dev - visited_con >= 0.05
    )
    flags.append(
        _make_flag(
            "DIFFUSION_SIGNAL_UNDERSAMPLED",
            diffusion_undersampled,
            (
                [
                    {
                        "variance_signal_development": variance_dev,
                        "variance_signal_confirmation": variance_con,
                        "visited_fraction_development_median": visited_dev,
                        "visited_fraction_confirmation_median": visited_con,
                    }
                ]
                if diffusion_undersampled
                else []
            ),
            [
                row["cell_id"]
                for row in path_information["state_diffusion"]["world_records"]
                if row["split"] == "confirmation"
                and float(row["ground_truth_diffusion_range_visited_fraction"])
                < float(visited_dev or 0.0)
            ],
            "Variance-signal recovery and visited true diffusion range both fell.",
            "joint preregistered signal-rate and path-support drop",
        )
    )

    false_controls = [
        row
        for row in controls["world_records"]
        if row["split"] == "confirmation" and row["false_positive"]
    ]
    flags.append(
        _make_flag(
            "CONTROL_FALSE_STRUCTURE",
            bool(false_controls),
            (
                [
                    {
                        "false_positives": len(false_controls),
                        "controls": sum(
                            row["split"] == "confirmation"
                            for row in controls["world_records"]
                        ),
                    }
                ]
                if false_controls
                else []
            ),
            [str(row["cell_id"]) for row in false_controls],
            "At least one confirmation linear control produced certified nonlinear structure.",
            "confirmation linear-control false-positive count",
        )
    )

    brittle: list[dict[str, Any]] = []
    for gate, splits in threshold_sensitivity["summaries"].items():
        for split, summary in splits.items():
            denominator = int(summary["near_boundary_denominator"])
            fraction = (
                int(summary["near_boundary_numerator"]) / denominator
                if denominator
                else 0.0
            )
            if fraction >= 0.25:
                brittle.append(
                    {
                        "gate": gate,
                        "split": split,
                        "near_boundary_fraction": fraction,
                        "band": summary["descriptive_band"],
                    }
                )
    flags.append(
        _make_flag(
            "THRESHOLD_MARGIN_BRITTLE",
            bool(brittle),
            brittle,
            [
                row["cell_id"]
                for row in threshold_sensitivity["world_records"]
                if row["near_boundary"]
                and any(
                    item["gate"] == row["gate"] and item["split"] == row["split"]
                    for item in brittle
                )
            ],
            "At least 25 percent of relevant cases lie inside a predeclared descriptive gate band.",
            "near-boundary cases divided by relevant cases",
        )
    )

    numerical_cases = [
        case
        for case in all_cases
        if any(
            repair is not None and repair["numerical_failure"]
            for repair in (
                case.get("topology_repair"),
                case.get("diffusion_repair"),
            )
        )
    ]
    flags.append(
        _make_flag(
            "NUMERICAL_INSTABILITY",
            bool(numerical_cases),
            (
                [{"numerical_failure_worlds": len(numerical_cases)}]
                if numerical_cases
                else []
            ),
            [str(case["cell_id"]) for case in numerical_cases],
            "At least one frozen repair evaluation reported numerical failure.",
            "frozen numerical_failure fields",
        )
    )
    return flags


def _scientific_conclusion(
    flags: Sequence[Mapping[str, Any]],
    waterfalls: Mapping[str, Any],
) -> dict[str, Any]:
    active = {str(flag["code"]) for flag in flags if flag["active"]}
    double_oracle = _stage_value(
        waterfalls,
        "double_well",
        "confirmation",
        "oracle_family_discrimination",
    )
    diffusion_oracle = _stage_value(
        waterfalls,
        "state_diffusion",
        "confirmation",
        "oracle_family_discrimination",
    )
    confirmation_support_retained = bool(
        double_oracle is not None
        and double_oracle >= 0.80
        and diffusion_oracle is not None
        and diffusion_oracle >= 0.80
    )
    downstream_loss = bool(
        active
        & {
            "FIELD_RECOVERY_DROP",
            "ROOT_PERSISTENCE_DROP",
            "CERTIFICATION_ATTRITION",
            "CONTROL_FALSE_STRUCTURE",
        }
    )
    path_or_oracle_loss = bool(
        active
        & {
            "ORACLE_POWER_DROP",
            "STATE_COVERAGE_DROP",
            "DIFFUSION_SIGNAL_UNDERSAMPLED",
        }
    )
    if confirmation_support_retained and downstream_loss:
        decision = "TARGETED_GENERALIZATION_REPAIR_WARRANTED"
    elif path_or_oracle_loss and not downstream_loss:
        decision = "DATA_LIMITED_NO_REPAIR"
    else:
        decision = "EVIDENCE_INSUFFICIENT"
    return {
        "d0_3_3_result": "NO_GRADUATE",
        "next_milestone_decision": decision,
        "confirmation_support_retained_across_both_target_families": (
            confirmation_support_retained
        ),
        "specific_downstream_loss_detected": downstream_loss,
        "path_or_oracle_loss_detected": path_or_oracle_loss,
        "primary_generalization_losses": sorted(active),
        "rule": (
            "Targeted repair requires confirmation support in both target families "
            "and a specific downstream loss. Path or oracle loss alone supports a "
            "data-limited decision; mixed evidence remains insufficient."
        ),
    }


def _world_manifest(parent: Mapping[str, Any]) -> dict[str, Any]:
    return {
        split: [
            {
                "cell_id": row["cell_id"],
                "role": row["role"],
                "seed": row["seed"],
                "world_hash": row["world_hash"],
            }
            for row in parent[f"{split}_cases"]
        ]
        for split in ("development", "confirmation")
    }


def run_generalization_autopsy(
    parent: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the diagnostic-only D0.3.3.1 artifact."""

    frozen_parent = (
        dict(parent) if parent is not None else load_frozen_targeted_recovery()
    )
    if frozen_parent.get("artifact_hash") != D033_ARTIFACT_HASH:
        raise GeneralizationAutopsyError("D0.3.3 parent content address changed")
    if frozen_parent.get("graduation", {}).get("decision") != "NO_GRADUATE":
        raise GeneralizationAutopsyError("D0.3.3 historical result changed")

    metric_table = _metric_table(frozen_parent)
    path_information = _path_information(frozen_parent)
    waterfalls = _causal_waterfalls(frozen_parent)
    controls = _control_diagnostics(frozen_parent)
    threshold_records = _threshold_records(frozen_parent)
    threshold_sensitivity = {
        "label": "THRESHOLD_SENSITIVITY",
        "optimization_performed": False,
        "world_records": threshold_records,
        "summaries": _threshold_summary(threshold_records),
    }
    flags = _diagnostic_flags(
        metric_table,
        waterfalls,
        path_information,
        controls,
        threshold_sensitivity,
        frozen_parent,
    )
    conclusion = _scientific_conclusion(flags, waterfalls)
    payload: dict[str, Any] = {
        "schema_version": "dynamics-generalization-autopsy/0.3.3.1",
        "milestone": "D0.3.3.1",
        "frozen": True,
        "generated_at": "2026-09-22T00:00:00+05:30",
        "question": (
            "Why did the frozen D0.3.3 development pass fail to generalize "
            "to untouched confirmation worlds?"
        ),
        "generation": {
            "deterministic": True,
            "source_sha256": hashlib.sha256(
                GENERALIZATION_AUTOPSY_SOURCE.read_bytes()
            ).hexdigest(),
            "path_regeneration_only": True,
            "estimator_rerun": False,
        },
        "parent_seals": [dict(row) for row in PARENT_SEALS],
        "sealed_d0_3_3_source_sha256": D033_SOURCE_SHA256,
        "boundaries": {
            "no_retuning": True,
            "confirmation_threshold_selection": False,
            "new_estimator_added": False,
            "real_market_rerun": False,
            "hawkes_started": False,
            "neural_sde_started": False,
            "symbolic_regression_started": False,
        },
        "worlds": _world_manifest(frozen_parent),
        "gate_definitions": GATE_DEFINITIONS,
        "locked_thresholds": LOCKED_THRESHOLDS,
        "metric_table": metric_table,
        "causal_waterfalls": waterfalls,
        "path_information": path_information,
        "control_diagnostics": controls,
        "threshold_sensitivity": threshold_sensitivity,
        "diagnostic_flags": flags,
        "sindy_structure_stability": {
            "status": "UNAVAILABLE",
            "reason": "bootstrap term-level evidence was not frozen",
            "estimator_rerun_performed": False,
        },
        "scientific_conclusion": conclusion,
        "market_claim_eligible": False,
        "real_market_claim": {
            "selected_model": "M1",
            "market_claim": "ABSTAIN",
            "rerun_performed": False,
            "interpretation": REAL_MARKET_INTERPRETATION,
        },
        "routing": {
            "hawkes_deferred": True,
            "next_milestone_decision": conclusion["next_milestone_decision"],
        },
    }
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


def _local_parent_errors() -> list[str]:
    errors: list[str] = []
    for seal in PARENT_SEALS:
        path = ROOT / seal["artifact"]
        if not path.exists():
            errors.append(f"missing frozen parent: {seal['milestone']}")
            continue
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != seal["file_sha256"]:
            errors.append(f"parent byte hash changed: {seal['milestone']}")
            continue
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            errors.append(f"parent JSON is invalid: {seal['milestone']}")
            continue
        if body.get("artifact_hash") != seal["artifact_hash"]:
            errors.append(f"parent content address changed: {seal['milestone']}")
    if hashlib.sha256(TARGETED_RECOVERY_SOURCE.read_bytes()).hexdigest() != (
        D033_SOURCE_SHA256
    ):
        errors.append("sealed D0.3.3 estimator source hash changed")
    return errors


def _verify_metric_arithmetic(
    metric_table: Sequence[Mapping[str, Any]], errors: list[str]
) -> None:
    if {str(row.get("metric")) for row in metric_table} != set(GATE_DEFINITIONS):
        errors.append("metric table does not cover the frozen metric set")
        return
    for row in metric_table:
        metric = str(row["metric"])
        definition = GATE_DEFINITIONS[metric]
        if row.get("direction") != definition["direction"]:
            errors.append(f"metric direction changed: {metric}")
        if row.get("gate") != definition["gate"]:
            errors.append(f"metric gate changed: {metric}")
        for split in ("development", "confirmation"):
            entry = row.get(split, {})
            numerator = entry.get("numerator")
            denominator = entry.get("denominator")
            if (
                not isinstance(numerator, int)
                or not isinstance(denominator, int)
                or denominator <= 0
                or numerator < 0
                or numerator > denominator
            ):
                errors.append(f"impossible rate arithmetic: {metric}/{split}")
                continue
            value = numerator / denominator
            if not math.isclose(
                float(entry.get("value", math.nan)), value, abs_tol=1e-12
            ):
                errors.append(f"rate does not reconcile: {metric}/{split}")
            if entry.get("wilson_95") != wilson_interval(numerator, denominator):
                errors.append(f"Wilson interval does not reconcile: {metric}/{split}")
            expected_margin = gate_margin(
                value,
                (float(definition["gate"]) if definition["gate"] is not None else None),
                str(definition["direction"]),
            )
            if entry.get("margin_to_gate") != expected_margin:
                errors.append(f"gate margin does not reconcile: {metric}/{split}")
        expected_worsening = signed_worsening(
            float(row["development"]["value"]),
            float(row["confirmation"]["value"]),
            str(definition["direction"]),
        )
        if row.get("signed_generalization_worsening") != expected_worsening:
            errors.append(f"signed worsening does not reconcile: {metric}")


def _verify_lower_level_summaries(
    artifact: Mapping[str, Any], errors: list[str]
) -> None:
    waterfalls = artifact.get("causal_waterfalls", {})
    for family, order in (
        ("double_well", DOUBLE_WELL_STAGE_ORDER),
        ("state_diffusion", STATE_DIFFUSION_STAGE_ORDER),
    ):
        section = waterfalls.get(family, {})
        records = section.get("world_records", [])
        if section.get("summaries") != _waterfall_summary(records, order):
            errors.append(f"waterfall summary does not reconcile: {family}")

    path_information = artifact.get("path_information", {})
    for family in ("double_well", "state_diffusion"):
        section = path_information.get(family, {})
        records = section.get("world_records", [])
        if section.get("summaries") != _path_summaries(records, family):
            errors.append(f"path-information summary does not reconcile: {family}")

    sensitivity = artifact.get("threshold_sensitivity", {})
    threshold_records = sensitivity.get("world_records", [])
    if sensitivity.get("summaries") != _threshold_summary(threshold_records):
        errors.append("threshold-sensitivity summary does not reconcile")
    for row in threshold_records:
        gate = str(row.get("gate"))
        if gate not in LOCKED_THRESHOLDS:
            errors.append(f"unknown threshold record gate: {gate}")
            continue
        definition = LOCKED_THRESHOLDS[gate]
        if row.get("frozen_threshold") != definition["threshold"]:
            errors.append(f"threshold record changed: {gate}")
        if row.get("descriptive_band") != definition["descriptive_band"]:
            errors.append(f"descriptive band changed: {gate}")
        expected_margin = float(row["value"]) - definition["threshold"]
        if row.get("margin") != expected_margin:
            errors.append(f"threshold margin does not reconcile: {gate}")
        if row.get("near_boundary") is not (
            abs(expected_margin) <= definition["descriptive_band"]
        ):
            errors.append(f"near-boundary flag does not reconcile: {gate}")


def verify_generalization_autopsy(
    artifact: Mapping[str, Any],
    *,
    verify_local_sources: bool = True,
    parent: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Verify lineage, arithmetic, world identity, and diagnostic boundaries."""

    errors: list[str] = []
    body = dict(artifact)
    claimed_hash = body.pop("artifact_hash", None)
    calculated_hash = canonical_sha256(body)
    if claimed_hash != calculated_hash:
        errors.append("artifact_hash does not match canonical payload")
    if artifact.get("schema_version") != ("dynamics-generalization-autopsy/0.3.3.1"):
        errors.append("schema_version is not dynamics-generalization-autopsy/0.3.3.1")
    if artifact.get("milestone") != "D0.3.3.1" or artifact.get("frozen") is not True:
        errors.append("D0.3.3.1 artifact is not frozen")
    if artifact.get("parent_seals") != [dict(row) for row in PARENT_SEALS]:
        errors.append("parent seals changed")
    if artifact.get("sealed_d0_3_3_source_sha256") != D033_SOURCE_SHA256:
        errors.append("sealed D0.3.3 source hash changed")
    if artifact.get("gate_definitions") != GATE_DEFINITIONS:
        errors.append("frozen gate definitions changed")
    if artifact.get("locked_thresholds") != LOCKED_THRESHOLDS:
        errors.append("frozen operating thresholds changed")

    boundaries = artifact.get("boundaries", {})
    required_false = (
        "confirmation_threshold_selection",
        "new_estimator_added",
        "real_market_rerun",
        "hawkes_started",
        "neural_sde_started",
        "symbolic_regression_started",
    )
    if boundaries.get("no_retuning") is not True or any(
        boundaries.get(key) is not False for key in required_false
    ):
        errors.append("diagnostic-only boundary changed")

    frozen_parent = (
        dict(parent)
        if parent is not None
        else json.loads(DEFAULT_D033_ARTIFACT.read_text(encoding="utf-8"))
    )
    if frozen_parent.get("artifact_hash") != D033_ARTIFACT_HASH:
        errors.append("D0.3.3 parent content address changed")
    development = frozen_parent.get("development_cases", [])
    confirmation = frozen_parent.get("confirmation_cases", [])
    development_seeds = {int(row["seed"]) for row in development}
    confirmation_seeds = {int(row["seed"]) for row in confirmation}
    if development_seeds & confirmation_seeds:
        errors.append("development and confirmation seeds overlap")
    expected_worlds = _world_manifest(frozen_parent)
    if artifact.get("worlds") != expected_worlds:
        errors.append("world IDs, hashes, roles, or seeds do not match D0.3.3")

    metric_table = artifact.get("metric_table", [])
    if not isinstance(metric_table, list):
        errors.append("metric table is missing")
    else:
        _verify_metric_arithmetic(metric_table, errors)
        if metric_table != _metric_table(frozen_parent):
            errors.append("metric table does not reconcile to D0.3.3 cases")

    _verify_lower_level_summaries(artifact, errors)

    expected_path = _path_information(frozen_parent)
    if artifact.get("path_information") != expected_path:
        errors.append("path diagnostics do not reconcile to sealed worlds")
    expected_waterfalls = _causal_waterfalls(frozen_parent)
    if artifact.get("causal_waterfalls") != expected_waterfalls:
        errors.append("causal waterfalls do not reconcile to D0.3.3 cases")
    expected_controls = _control_diagnostics(frozen_parent)
    if artifact.get("control_diagnostics") != expected_controls:
        errors.append("control diagnostics do not reconcile")
    expected_threshold_records = _threshold_records(frozen_parent)
    expected_sensitivity = {
        "label": "THRESHOLD_SENSITIVITY",
        "optimization_performed": False,
        "world_records": expected_threshold_records,
        "summaries": _threshold_summary(expected_threshold_records),
    }
    if artifact.get("threshold_sensitivity") != expected_sensitivity:
        errors.append("threshold sensitivity does not reconcile")

    expected_flags = _diagnostic_flags(
        _metric_table(frozen_parent),
        expected_waterfalls,
        expected_path,
        expected_controls,
        expected_sensitivity,
        frozen_parent,
    )
    if artifact.get("diagnostic_flags") != expected_flags:
        errors.append("diagnostic flags do not reconcile")
    for flag in artifact.get("diagnostic_flags", []):
        if flag.get("active") is True and not flag.get("evidence"):
            errors.append(f"active flag lacks evidence: {flag.get('code')}")

    expected_conclusion = _scientific_conclusion(expected_flags, expected_waterfalls)
    if artifact.get("scientific_conclusion") != expected_conclusion:
        errors.append("scientific conclusion does not reconcile")
    if expected_conclusion.get("d0_3_3_result") != "NO_GRADUATE":
        errors.append("D0.3.3 historical result was softened")
    if artifact.get("market_claim_eligible") is not False:
        errors.append("market_claim_eligible must be false")
    real = artifact.get("real_market_claim", {})
    if (
        real.get("selected_model") != "M1"
        or real.get("market_claim") != "ABSTAIN"
        or real.get("rerun_performed") is not False
        or real.get("interpretation") != REAL_MARKET_INTERPRETATION
    ):
        errors.append("real-market historical conclusion changed")
    stability = artifact.get("sindy_structure_stability", {})
    if (
        stability.get("status") != "UNAVAILABLE"
        or stability.get("reason") != "bootstrap term-level evidence was not frozen"
        or stability.get("estimator_rerun_performed") is not False
    ):
        errors.append("SINDy stability availability was misrepresented")

    if verify_local_sources:
        errors.extend(_local_parent_errors())
        local_source_hash = hashlib.sha256(
            GENERALIZATION_AUTOPSY_SOURCE.read_bytes()
        ).hexdigest()
        if artifact.get("generation", {}).get("source_sha256") != local_source_hash:
            errors.append("local D0.3.3.1 source hash changed")
    return {
        "valid": not errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "development_worlds": len(development),
        "confirmation_worlds": len(confirmation),
        "decision": artifact.get("scientific_conclusion", {}).get(
            "next_milestone_decision"
        ),
        "errors": errors,
    }


def load_frozen_generalization_autopsy(
    path: Path = DEFAULT_D0331_ARTIFACT,
) -> dict[str, Any]:
    if not path.exists():
        raise GeneralizationAutopsyError(
            "the frozen D0.3.3.1 artifact is unavailable; run the freeze script"
        )
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise GeneralizationAutopsyError(
            "the frozen D0.3.3.1 artifact is not valid JSON"
        ) from exc
    verification = verify_generalization_autopsy(artifact)
    if not verification["valid"]:
        raise GeneralizationAutopsyError("; ".join(verification["errors"]))
    return artifact
