"""Shared records and aggregation for the v0.2.4.1 Reality Ladder."""

from __future__ import annotations

import platform
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from src.eval.canonical import canonical_sha256
from src.execution.reality_ladder_freeze import (
    CHECKPOINTS,
    CHECKPOINT_ENGINES,
    CHECKPOINT_LEVELS,
    METRIC_NAMES,
    REGIMES,
    SEEDS,
    STAGE_ASSUMPTIONS,
    STRATEGY,
    _mean,
    _rounded,
    calculate_metrics,
)


@dataclass(frozen=True)
class NativeRun:
    engine: str
    fills: tuple[Mapping[str, Any], ...]
    account: Mapping[str, Any]
    output_hash: str
    request_hash: str
    runtime_seconds: float
    runtime_identity: Mapping[str, Any]
    native_evidence_hash: str

def _analytical_fingerprint() -> dict[str, Any]:
    value = {
        "engine": "analytical",
        "engine_version": "forge-0.2.4.1",
        "adapter_version": "dual-moving-average-idealized-v1",
        "python_version": platform.python_version(),
        "platform": platform.platform(),
    }
    return {**value, "fingerprint_hash": canonical_sha256(value)}


def _certified_fingerprint(certified: Any) -> dict[str, Any]:
    return {
        **dict(certified.fingerprint),
        "fingerprint_hash": certified.fingerprint_hash,
        "certification_level": certified.certification_level,
        "certification_hash": certified.certification_hash,
    }


def _record(
    *,
    checkpoint: str,
    regime: str,
    seed: int,
    world: Mapping[str, Any],
    orders: Sequence[Mapping[str, Any]],
    fills: Sequence[Mapping[str, Any]],
    engine_fingerprint: Mapping[str, Any],
    runtime_seconds: float,
    native_output_hash: str,
    native_request_hash: str,
    native_evidence_hash: str,
    runtime_identity: Mapping[str, Any],
) -> dict[str, Any]:
    metrics = calculate_metrics(
        world,
        orders,
        fills,
        assumptions=STAGE_ASSUMPTIONS[checkpoint],
    )
    content = {
        "checkpoint": checkpoint,
        "reality_level": CHECKPOINT_LEVELS[checkpoint],
        "regime": regime,
        "seed": seed,
        "engine": CHECKPOINT_ENGINES[checkpoint],
        "engine_fingerprint": dict(engine_fingerprint),
        "strategy_hash": canonical_sha256(STRATEGY),
        "world_hash": world["world_hash"],
        "assumptions": dict(STAGE_ASSUMPTIONS[checkpoint]),
        "metrics": metrics,
        "runtime_seconds": _rounded(runtime_seconds),
        "fills": [dict(fill) for fill in fills],
        "native_request_hash": native_request_hash,
        "native_output_hash": native_output_hash,
        "native_evidence_hash": native_evidence_hash,
        "runtime_identity": dict(runtime_identity),
    }
    deterministic_content = {
        key: value for key, value in content.items()
        if key not in {"runtime_seconds", "native_request_hash", "native_output_hash", "runtime_identity"}
    }
    bound_content = {**content, "deterministic_hash": canonical_sha256(deterministic_content)}
    return {**bound_content, "record_hash": canonical_sha256(bound_content)}


def _checkpoint_summary(records: Sequence[Mapping[str, Any]], checkpoint: str) -> dict[str, Any]:
    selected = [record for record in records if record["checkpoint"] == checkpoint]
    if len(selected) != len(REGIMES) * len(SEEDS):
        raise ValueError(f"checkpoint {checkpoint} is incomplete")
    return {
        "checkpoint": checkpoint,
        "reality_level": CHECKPOINT_LEVELS[checkpoint],
        "engine": CHECKPOINT_ENGINES[checkpoint],
        "metrics": {
            metric: _mean(float(record["metrics"][metric]) for record in selected)
            for metric in METRIC_NAMES
        },
        "runtime_seconds_total": _rounded(sum(float(record["runtime_seconds"]) for record in selected)),
    }


def aggregate_results(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    checkpoints = {checkpoint: _checkpoint_summary(records, checkpoint) for checkpoint in CHECKPOINTS}
    regime_matrix = []
    for regime in REGIMES:
        row: dict[str, Any] = {"regime": regime, "seeds": len(SEEDS), "sharpe": {}}
        for checkpoint in CHECKPOINTS:
            selected = [
                record for record in records
                if record["regime"] == regime and record["checkpoint"] == checkpoint
            ]
            row["sharpe"][checkpoint] = _mean(float(record["metrics"]["sharpe"]) for record in selected)
        screening = row["sharpe"]["L1_VECTORBT"]
        final = row["sharpe"]["L4_COUNTERFACTUAL_STRESS"]
        row["alpha_survival_ratio"] = _rounded(final / screening) if screening else None
        regime_matrix.append(row)

    sharpes = {name: float(summary["metrics"]["sharpe"]) for name, summary in checkpoints.items()}
    screening = sharpes["L1_VECTORBT"]
    if screening == 0.0:
        raise ValueError("screening Sharpe is zero; alpha survival is undefined")
    decomposition = {
        "idealization_gap": _rounded(sharpes["L1_VECTORBT"] - sharpes["L0_ANALYTICAL"]),
        "model_semantic_decay": _rounded(sharpes["L2_NAUTILUS"] - sharpes["L1_VECTORBT"]),
        "fee_decay": _rounded(sharpes["L3_FEES_SLIPPAGE"] - sharpes["L2_NAUTILUS"]),
        "latency_decay": _rounded(sharpes["L3_LATENCY"] - sharpes["L3_FEES_SLIPPAGE"]),
        "stress_decay": _rounded(sharpes["L4_COUNTERFACTUAL_STRESS"] - sharpes["L3_LATENCY"]),
    }
    survival = _rounded(sharpes["L4_COUNTERFACTUAL_STRESS"] / screening)
    causal_sum = sum(decomposition[key] for key in (
        "model_semantic_decay", "fee_decay", "latency_decay", "stress_decay"
    ))
    if abs((sharpes["L4_COUNTERFACTUAL_STRESS"] - screening) - causal_sum) > 1e-9:
        raise ValueError("causal decay decomposition does not reconcile")
    causal_labels = {
        "model_semantic_decay": "model and semantic translation",
        "fee_decay": "fees and deterministic quoted-spread slippage",
        "latency_decay": "latency",
        "stress_decay": "counterfactual market stress",
    }
    largest = min(causal_labels, key=lambda key: decomposition[key])
    return {
        "checkpoints": [checkpoints[name] for name in CHECKPOINTS],
        "regime_matrix": regime_matrix,
        "alpha_survival_ratio": survival,
        "decomposition": decomposition,
        "decomposition_convention": "signed Sharpe change; negative values are decay; fee_decay includes deterministic fee and quoted-spread slippage",
        "largest_degradation": {"component": largest, "label": causal_labels[largest], "sharpe_change": decomposition[largest]},
        "finding": (
            f"The strategy retained {survival * 100:.1f}% of its screened risk-adjusted performance; "
            f"the largest degradation came from {causal_labels[largest]}."
        ),
    }
