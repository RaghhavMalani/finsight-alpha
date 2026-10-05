"""Preregistered descriptive diagnostics; flags are evidence-compatible tags."""

from __future__ import annotations

import copy
import math
from collections import Counter, defaultdict
from typing import Any, Mapping

import numpy as np

from src.dynamics import hawkes_boundary as instrument


def failure_tags(
    record: Mapping[str, Any], row: Mapping[str, Any], source: int, target: int
) -> list[str]:
    truth = np.asarray(record["truth"]["G"])
    named = {p["protocol"]["name"]: p for p in record["protocols"]}
    support = (
        lambda p: p["uncertainty"]["event_attribution"]["edge_support"][target][source]
        == 1
    )
    tags = []
    if support(named["ZERO"]) and all(
        named[p]["fit"]["optimizer"]["success"] and not support(named[p])
        for p in ("KNOWN", "ORACLE")
    ):
        tags.append("BOUNDARY_INDUCED_EDGE")
    if truth[source, target] > 0.035:
        tags.append("DIRECTION_REVERSAL")
    if {source, target} == {0, 1} and (
        record["truth"]["driver_latent"] or record["truth"]["driver_observed"]
    ):
        tags.append("COMMON_DRIVER_ALIASING")
    if (
        "COMMON_DRIVER_ALIASING" not in tags
        and max(truth[source, source], truth[target, target]) > 0.035
    ):
        tags.append("SELF_TO_CROSS_LEAKAGE")
    if sum(record["latent"]["counts"]) < 300:
        tags.append("SPARSE_EVENT_FALSE_EDGE")
    if (
        max(truth[target, source], truth[source, target]) > 0.035
        and abs(truth[target, source] - truth[source, target]) <= 0.05
    ):
        tags.append("SYMMETRIC_EDGE_AMBIGUITY")
    return tags or ["UNEXPLAINED"]


def edge_evidence(
    record: Mapping[str, Any],
    row: Mapping[str, Any],
    source: int,
    target: int,
    kind: str,
) -> dict:
    truth = np.asarray(record["truth"]["G"])
    fit, latent = row["fit"], record["latent"]
    method = row["uncertainty"]["event_attribution"]
    alpha = np.asarray(fit["alpha"]).copy()
    full = instrument.conditional_likelihood_gradient(
        latent["retained_events"],
        fit["baseline"],
        alpha,
        fit["beta"],
        latent["horizon"],
        row["protocol"],
    )[0]
    alpha[target, source] = 0.0
    ablated = instrument.conditional_likelihood_gradient(
        latent["retained_events"],
        fit["baseline"],
        alpha,
        fit["beta"],
        latent["horizon"],
        row["protocol"],
    )[0]
    tags = failure_tags(record, row, source, target) if kind == "FALSE" else []
    return {
        "kind": kind,
        "source": source,
        "target": target,
        "true_contribution": truth[target, source],
        "estimated_contribution": fit["branching_matrix"][target][source],
        "lower": method["branching"]["lower"][target][source],
        "upper": method["branching"]["upper"][target][source],
        "support_fraction": method["bootstrap_support_probability"][target][source],
        "likelihood_ablation_delta": full - ablated,
        "likelihood_scope": "IN_SAMPLE_FIXED_OTHER_PARAMETERS",
        "event_count": sum(latent["counts"]),
        "source_count": latent["counts"][source],
        "target_count": latent["counts"][target],
        "source_true_base_rate": record["truth"]["mu"][source],
        "target_true_base_rate": record["truth"]["mu"][target],
        "source_fitted_base_rate": fit["baseline"][source],
        "target_fitted_base_rate": fit["baseline"][target],
        "source_self": truth[source, source],
        "target_self": truth[target, target],
        "true_common_driver": record["truth"]["driver_latent"]
        or record["truth"]["driver_observed"],
        "observed_common_driver": record["truth"]["driver_observed"],
        "edge_asymmetry": abs(truth[target, source] - truth[source, target]),
        "shared_decay_kernel_overlap": 1.0,
        "tags": tags,
        "primary_category": tags[0] if tags else None,
        "reversed": bool(kind == "FALSE" and truth[source, target] > 0.035),
    }


def derive_details(raw: Mapping[str, Any]) -> dict:
    record = copy.deepcopy(raw)
    latent, truth = record["latent"], np.asarray(record["truth"]["G"])
    named = {row["protocol"]["name"]: row for row in record["protocols"]}
    zero = named["ZERO"]
    known = named["KNOWN"]["protocol"]
    common_ll = lambda r: instrument.conditional_likelihood_gradient(
        latent["retained_events"],
        r["fit"]["baseline"],
        r["fit"]["alpha"],
        r["fit"]["beta"],
        latent["horizon"],
        known,
    )[0]
    for row in record["protocols"]:
        support = np.asarray(row["uncertainty"]["event_attribution"]["edge_support"])
        row["edge_failures"] = [
            edge_evidence(
                record,
                row,
                source,
                target,
                "FALSE" if support[target, source] == 1 else "MISSED",
            )
            for target in range(len(truth))
            for source in range(len(truth))
            if source != target
            and ((support[target, source] == 1) != (truth[target, source] > 0.035))
        ]
        row["comparison_to_zero"] = {
            "mu_delta": np.asarray(zero["fit"]["baseline"]) - row["fit"]["baseline"],
            "alpha_delta": np.asarray(zero["fit"]["alpha"]) - row["fit"]["alpha"],
            "beta_delta": zero["fit"]["beta"] - row["fit"]["beta"],
            "branching_delta": np.asarray(zero["fit"]["branching_matrix"])
            - row["fit"]["branching_matrix"],
            "rho_delta": zero["fit"]["spectral_radius"] - row["fit"]["spectral_radius"],
            "rho_absolute_error_improvement": abs(zero["errors"]["rho"])
            - abs(row["errors"]["rho"]),
            "supported_entries_changed": int(
                np.sum(
                    support
                    != np.asarray(
                        zero["uncertainty"]["event_attribution"]["edge_support"]
                    )
                )
            ),
            "full_cross_graph_changed": row["graph"]["inferred_edges"]
            != zero["graph"]["inferred_edges"],
            "conditional_objective_delta": row["fit"]["log_likelihood"]
            - zero["fit"]["log_likelihood"],
            "known_history_common_model_delta": common_ll(row) - common_ll(zero),
        }
    return instrument.incumbent._round(record)


def _mean(values: list) -> float | None:
    return float(np.mean(values)) if values else None


def bin_value(value: float | None, cuts: tuple, labels: tuple) -> str:
    return (
        "UNAVAILABLE"
        if value is None
        else labels[int(np.searchsorted(cuts, value, side="right"))]
    )


def coverage_rows(records: list[dict]) -> list[dict]:
    buckets = defaultdict(
        lambda: {"covered": [], "width": [], "rho": [], "worlds": set()}
    )
    for record in records:
        latent, truth = record["latent"], np.asarray(record["truth"]["G"])
        count = sum(latent["counts"])
        for row in record["protocols"]:
            protocol = row["protocol"]["name"]
            strata = {
                "all": "ALL",
                "information": latent["spec"]["information"],
                "rho_eta": bin_value(
                    record["truth"]["rho"],
                    (0.7, 0.9, 0.97),
                    ("LT_0.70", "0.70_TO_0.90", "0.90_TO_0.97", "GE_0.97"),
                ),
                "event_count": bin_value(
                    count,
                    (100, 300, 1000, 3000),
                    ("LT_100", "100_TO_299", "300_TO_999", "1000_TO_2999", "GE_3000"),
                ),
                "events_per_half_life": bin_value(
                    count * latent["half_life"] / latent["horizon"],
                    (1, 5, 20),
                    ("LT_1", "1_TO_5", "5_TO_20", "GE_20"),
                ),
                "half_life": bin_value(
                    latent["half_life"], (0.3, 0.7), ("LT_0.3", "0.3_TO_0.7", "GE_0.7")
                ),
                "condition": bin_value(
                    row["geometry"]["condition"], (1e4, 1e6), ("LOW", "MID", "HIGH")
                ),
            }
            for method, evidence in row["uncertainty"].items():
                if not evidence["available"]:
                    continue
                branch = evidence["branching"]
                for axis, stratum in strata.items():
                    bucket = buckets[(protocol, method, axis, stratum)]
                    mask = truth > 0.035
                    bucket["covered"].extend(
                        np.asarray(branch["covered"])[mask].tolist()
                    )
                    bucket["width"].extend(np.asarray(branch["width"])[mask].tolist())
                    bucket["worlds"].add(latent["spec"]["id"])
                    ci = evidence["spectral_radius_ci95"]
                    if ci is not None:
                        bucket["rho"].append(
                            int(ci[0] <= record["truth"]["rho"] <= ci[1])
                        )
                for target, source in zip(*np.where(truth > 0.035)):
                    stratum = bin_value(
                        truth[target, source],
                        (0.15, 0.30),
                        ("SMALL", "MEDIUM", "LARGE"),
                    )
                    bucket = buckets[(protocol, method, "edge_magnitude", stratum)]
                    bucket["covered"].append(branch["covered"][target][source])
                    bucket["width"].append(branch["width"][target][source])
                    bucket["worlds"].add(latent["spec"]["id"])
    return [
        {
            "protocol": p,
            "method": m,
            "axis": axis,
            "stratum": stratum,
            "worlds": len(b["worlds"]),
            "parameters": len(b["covered"]),
            "covered": int(sum(b["covered"])),
            "coverage": _mean(b["covered"]),
            "mean_width": _mean(b["width"]),
            "median_width": float(np.median(b["width"])) if b["width"] else None,
            "rho_parameters": len(b["rho"]),
            "rho_coverage": _mean(b["rho"]),
        }
        for (p, m, axis, stratum), b in sorted(buckets.items())
    ]


def geometry_summary(records: list[dict]) -> list[dict]:
    output = []
    for protocol in instrument.PROTOCOLS:
        selected = [
            (
                record,
                next(
                    r for r in record["protocols"] if r["protocol"]["name"] == protocol
                ),
            )
            for record in records
        ]
        valid = [
            (record, row)
            for record, row in selected
            if row["geometry"]["condition"] is not None
            and row["geometry"]["condition"] > 0
        ]
        x = [math.log10(row["geometry"]["condition"]) for _, row in valid]
        correlations = {}
        for metric in (
            "graph_error",
            "absolute_rho_error",
            "coverage_failure",
            "optimizer_failure",
        ):
            y = []
            for record, row in valid:
                mask = np.asarray(record["truth"]["G"]) > 0.035
                coverage = np.asarray(
                    row["uncertainty"]["event_attribution"]["branching"]["covered"]
                )[mask]
                y.append(
                    float(not row["graph"]["exact_graph"])
                    if metric == "graph_error"
                    else (
                        abs(row["errors"]["rho"])
                        if metric == "absolute_rho_error"
                        else (
                            1.0 - float(np.mean(coverage))
                            if metric == "coverage_failure" and len(coverage)
                            else (
                                float(not row["fit"]["optimizer"]["success"])
                                if metric == "optimizer_failure"
                                else None
                            )
                        )
                    )
                )
            pairs = [(a, b) for a, b in zip(x, y) if b is not None]
            a, b = ([p[0] for p in pairs], [p[1] for p in pairs])
            correlations[metric] = {
                "n": len(pairs),
                "pearson": (
                    float(np.corrcoef(a, b)[0, 1])
                    if len(pairs) >= 3 and np.std(a) > 0 and np.std(b) > 0
                    else None
                ),
            }
        groups = []
        for group in ("LOW", "MID", "HIGH", "UNAVAILABLE"):
            rows = [
                row
                for _, row in selected
                if bin_value(
                    row["geometry"]["condition"], (1e4, 1e6), ("LOW", "MID", "HIGH")
                )
                == group
            ]
            groups.append(
                {
                    "group": group,
                    "fits": len(rows),
                    "graph_error_rate": _mean(
                        [int(not r["graph"]["exact_graph"]) for r in rows]
                    ),
                    "rho_absolute_error": _mean(
                        [abs(r["errors"]["rho"]) for r in rows]
                    ),
                    "optimizer_failure_rate": _mean(
                        [int(not r["fit"]["optimizer"]["success"]) for r in rows]
                    ),
                }
            )
        output.append(
            {
                "protocol": protocol,
                "correlations": correlations,
                "groups": groups,
                "interpretation": "DESCRIPTIVE_ASSOCIATION_NOT_FISHER_OR_CAUSAL",
            }
        )
    return output


def terminal_decision(records: list[dict]) -> dict:
    paired = []
    for record in records:
        if (
            record["latent"]["spec"]["family"] != "CRITICALITY"
            or record["truth"]["rho"] < 0.93
        ):
            continue
        named = {row["protocol"]["name"]: row for row in record["protocols"]}
        if all(
            named[p]["fit"]["optimizer"]["success"] for p in ("ZERO", "KNOWN", "ORACLE")
        ):
            paired.append(named)
    rmses = {
        p: (
            math.sqrt(float(np.mean([r[p]["errors"]["rho"] ** 2 for r in paired])))
            if paired
            else None
        )
        for p in ("ZERO", "KNOWN", "ORACLE")
    }
    ordinary = rmses["ZERO"]
    reductions = {
        p: 1.0 - rmses[p] / ordinary if ordinary and paired else None
        for p in ("KNOWN", "ORACLE")
    }
    gains = [
        abs(r["ZERO"]["errors"]["rho"]) - abs(r["ORACLE"]["errors"]["rho"])
        for r in paired
    ]
    improved = _mean([int(g >= 0.02) for g in gains])
    boundary = (
        len(paired) >= 48
        and reductions["ORACLE"] >= 0.25
        and reductions["KNOWN"] >= 0.20
        and improved >= 0.60
        and _mean(gains) >= 0.05
    )
    groups = {}
    for group in ("LOW", "HIGH"):
        candidates = []
        for record in records:
            row = next(
                p for p in record["protocols"] if p["protocol"]["name"] == "KNOWN"
            )
            condition = row["geometry"]["condition"]
            if (
                record["latent"]["spec"]["family"] == "GRAPH"
                and row["fit"]["optimizer"]["success"]
                and condition is not None
                and (condition < 1e4 if group == "LOW" else condition >= 1e6)
            ):
                candidates.append(row)
        groups[group] = {
            "n": len(candidates),
            "error_rate": _mean(
                [int(not r["graph"]["exact_graph"]) for r in candidates]
            ),
        }
    abstention = (
        all(groups[g]["n"] >= 15 for g in groups)
        and groups["HIGH"]["error_rate"] >= 0.50
        and groups["HIGH"]["error_rate"] - groups["LOW"]["error_rate"] >= 0.20
    )
    return {
        "decision": (
            "BOUNDARY_REPAIR_WARRANTED"
            if boundary
            else (
                "IDENTIFIABILITY_AWARE_ABSTENTION_WARRANTED"
                if abstention
                else "EVIDENCE_INSUFFICIENT"
            )
        ),
        "boundary_predicate": bool(boundary),
        "abstention_predicate": bool(abstention),
        "paired_critical_worlds": len(paired),
        "rho_rmse": rmses,
        "rmse_reduction": reductions,
        "oracle_improved_fraction": improved,
        "oracle_mean_absolute_error_improvement": _mean(gains),
        "known_graph_condition_groups": groups,
        "repair_implemented": False,
        "intrinsic_nonidentifiability_established": False,
    }


def summarize(records: list[dict]) -> dict:
    curves, confusions, categories, states, metrics = [], [], [], [], []
    names = ("NONE", "A_TO_B", "B_TO_A", "BIDIRECTIONAL")
    for protocol in instrument.PROTOCOLS:
        pairs = [
            (
                record,
                next(
                    p for p in record["protocols"] if p["protocol"]["name"] == protocol
                ),
            )
            for record in records
        ]
        for rho in (0.70, 0.85, 0.93, 0.97, 0.99):
            selected = [
                (r, p)
                for r, p in pairs
                if r["latent"]["spec"]["family"] == "CRITICALITY"
                and r["truth"]["rho"] == rho
            ]
            curves.append(
                {
                    "protocol": protocol,
                    "true_rho": rho,
                    "n": len(selected),
                    "mean_fitted_rho": _mean(
                        [p["fit"]["spectral_radius"] for _, p in selected]
                    ),
                    "rho_bias": _mean([p["errors"]["rho"] for _, p in selected]),
                    "rmse": math.sqrt(
                        float(np.mean([p["errors"]["rho"] ** 2 for _, p in selected]))
                    ),
                }
            )
        graph = [(r, p) for r, p in pairs if r["latent"]["spec"]["family"] == "GRAPH"]
        matrix = [[0] * 4 for _ in names]
        category = Counter()
        for _, row in graph:
            matrix[names.index(row["true_topology"])][
                names.index(row["fitted_topology"])
            ] += 1
            category.update(
                e["primary_category"]
                for e in row["edge_failures"]
                if e["kind"] == "FALSE"
            )
        confusions.append(
            {
                "protocol": protocol,
                "labels": names,
                "matrix": matrix,
                "latent_worlds": 100,
                "scope": "A_B_SUBGRAPH",
            }
        )
        categories.append(
            {
                "protocol": protocol,
                "counts": {
                    tag: category[tag]
                    for tag in (
                        "BOUNDARY_INDUCED_EDGE",
                        "DIRECTION_REVERSAL",
                        "COMMON_DRIVER_ALIASING",
                        "SELF_TO_CROSS_LEAKAGE",
                        "SPARSE_EVENT_FALSE_EDGE",
                        "SYMMETRIC_EDGE_AMBIGUITY",
                        "UNEXPLAINED",
                    )
                },
                "false_edges": sum(category.values()),
            }
        )
        states.append(
            {
                "protocol": protocol,
                "counts": dict(
                    sorted(
                        Counter(
                            p["structural_identifiability"] for _, p in pairs
                        ).items()
                    )
                ),
            }
        )
        metrics.append(
            {
                "protocol": protocol,
                "fits": 200,
                "optimizer_failures": sum(
                    not p["fit"]["optimizer"]["success"] for _, p in pairs
                ),
                "process_calibration_rate": _mean(
                    [int(p["residuals"]["calibrated"]) for _, p in pairs]
                ),
                "exact_graph_rate": _mean(
                    [int(p["graph"]["exact_graph"]) for _, p in graph]
                ),
                "true_positive": sum(p["graph"]["true_positive"] for _, p in graph),
                "false_positive": sum(p["graph"]["false_positive"] for _, p in graph),
                "false_negative": sum(p["graph"]["false_negative"] for _, p in graph),
                "reversed_edges": sum(p["graph"]["reversed_edges"] for _, p in graph),
                "mu_bias": _mean([v for _, p in pairs for v in p["errors"]["mu"]]),
                "alpha_bias": _mean(
                    [v for _, p in pairs for row in p["errors"]["alpha"] for v in row]
                ),
                "beta_bias": _mean([p["errors"]["beta"] for _, p in pairs]),
                "branching_bias": _mean(
                    [
                        v
                        for _, p in pairs
                        for row in p["errors"]["branching"]
                        for v in row
                    ]
                ),
                "rho_bias": _mean([p["errors"]["rho"] for _, p in pairs]),
            }
        )
    return instrument.incumbent._round(
        {
            "rho_curves": curves,
            "confusion": confusions,
            "false_edge_categories": categories,
            "epistemic_states": states,
            "protocol_metrics": metrics,
            "coverage": coverage_rows(records),
            "geometry": geometry_summary(records),
            "decision": terminal_decision(records),
            "predictive_value": "NOT_TESTED",
            "economic_value": "NOT_TESTED",
            "causal_interpretation": "NOT_ESTABLISHED",
            "failure_categories_are_causal": False,
        }
    )
