"""Selection-aware cointegration-to-OU research pipeline for Dynamics D0.2.1."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from itertools import combinations
from typing import Any, Mapping, Sequence

import numpy as np

from src.dynamics.contracts import DiscoveryLedger, HypothesisLedger, ScientificVerdict, TimeWindow
from src.dynamics.ou_theory import certify_ou, generate_exact_ou
from src.dynamics.world import elapsed_in_unit


class StatArbInputError(ValueError):
    """Raised when a universe cannot support a selection-aware experiment."""


def _window(
    timestamps: Sequence[datetime], start: int, end: int, time_unit: str
) -> TimeWindow:
    return TimeWindow(
        start=timestamps[start],
        end=timestamps[end - 1],
        start_index=start,
        end_index=end,
        observations=end - start,
        elapsed_time=elapsed_in_unit(timestamps[start], timestamps[end - 1], time_unit),
        time_unit=time_unit,
    )


def _ols(dependent: np.ndarray, independent: np.ndarray) -> tuple[float, float]:
    centered = independent - float(np.mean(independent))
    denominator = float(np.dot(centered, centered))
    if denominator <= np.finfo(float).eps:
        raise StatArbInputError("a candidate security has no inferable variation")
    beta = float(
        np.dot(centered, dependent - float(np.mean(dependent))) / denominator
    )
    intercept = float(np.mean(dependent) - beta * np.mean(independent))
    return intercept, beta


def _adf_zero_lag_t_statistic(residual: np.ndarray) -> float:
    lagged = residual[:-1]
    change = np.diff(residual)
    centered = lagged - float(np.mean(lagged))
    denominator = float(np.dot(centered, centered))
    if denominator <= np.finfo(float).eps:
        return 0.0
    gamma = float(np.dot(centered, change - float(np.mean(change))) / denominator)
    intercept = float(np.mean(change) - gamma * np.mean(lagged))
    errors = change - (intercept + gamma * lagged)
    degrees = max(1, len(change) - 2)
    residual_variance = float(np.dot(errors, errors) / degrees)
    standard_error = math.sqrt(max(residual_variance / denominator, np.finfo(float).eps))
    return gamma / standard_error


@lru_cache(maxsize=16)
def _engle_granger_null(sample_size: int, simulations: int = 4_095) -> np.ndarray:
    """Finite-sample residual-ADF null from independent random-walk regressions."""

    rng = np.random.default_rng(91_000 + sample_size)
    left = np.cumsum(rng.normal(size=(simulations, sample_size)), axis=1)
    right = np.cumsum(rng.normal(size=(simulations, sample_size)), axis=1)
    left_centered = left - np.mean(left, axis=1, keepdims=True)
    right_centered = right - np.mean(right, axis=1, keepdims=True)
    beta = np.sum(right_centered * left_centered, axis=1) / np.maximum(
        np.sum(np.square(right_centered), axis=1), np.finfo(float).eps
    )
    intercept = np.mean(left, axis=1) - beta * np.mean(right, axis=1)
    residual = left - intercept[:, None] - beta[:, None] * right
    lagged = residual[:, :-1]
    change = np.diff(residual, axis=1)
    lagged_centered = lagged - np.mean(lagged, axis=1, keepdims=True)
    change_centered = change - np.mean(change, axis=1, keepdims=True)
    denominator = np.maximum(
        np.sum(np.square(lagged_centered), axis=1), np.finfo(float).eps
    )
    gamma = np.sum(lagged_centered * change_centered, axis=1) / denominator
    adf_intercept = np.mean(change, axis=1) - gamma * np.mean(lagged, axis=1)
    errors = change - adf_intercept[:, None] - gamma[:, None] * lagged
    residual_variance = np.sum(np.square(errors), axis=1) / max(1, sample_size - 3)
    standard_error = np.sqrt(
        np.maximum(residual_variance / denominator, np.finfo(float).eps)
    )
    return np.sort(gamma / standard_error)


def _cointegration_screen(
    dependent: np.ndarray, independent: np.ndarray
) -> tuple[float, float, float, float]:
    intercept, beta = _ols(dependent, independent)
    residual = dependent - intercept - beta * independent
    statistic = _adf_zero_lag_t_statistic(residual)
    null = _engle_granger_null(len(residual))
    rank = int(np.searchsorted(null, statistic, side="right"))
    tail_count = max(32, int(len(null) * 0.05))
    tail_cutoff = float(null[tail_count - 1])
    if statistic >= tail_cutoff:
        pvalue = float((1 + rank) / (len(null) + 1))
    else:
        excess = tail_cutoff - null[:tail_count]
        tail_scale = max(float(np.mean(excess[excess > 0])), 1e-6)
        pvalue = max(
            1e-12,
            float(tail_count / (len(null) + 1))
            * math.exp(-(tail_cutoff - statistic) / tail_scale),
        )
    return intercept, beta, statistic, pvalue


def _benjamini_hochberg(pvalues: Sequence[float]) -> list[float]:
    count = len(pvalues)
    order = np.argsort(np.asarray(pvalues, dtype=float))
    adjusted = np.ones(count, dtype=float)
    running = 1.0
    for reverse_index in range(count - 1, -1, -1):
        original_index = int(order[reverse_index])
        rank = reverse_index + 1
        running = min(running, float(pvalues[original_index]) * count / rank)
        adjusted[original_index] = min(running, 1.0)
    return [float(value) for value in adjusted]


def _serialize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, tuple):
        return [_serialize(item) for item in value]
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, Mapping):
        return {str(key): _serialize(item) for key, item in value.items()}
    return value


def _hash(payload: Mapping[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(_serialize(payload), sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _execution_ladder(
    certified: bool, evidence: Mapping[str, Any] | None
) -> tuple[bool | None, list[dict[str, Any]]]:
    stages: list[dict[str, Any]] = [
        {"stage": "sealed signal", "status": "PASS" if certified else "FAIL"}
    ]
    if evidence is None:
        stages.extend(
            {"stage": stage, "status": "NOT_MEASURED"}
            for stage in (
                "cost model",
                "realized net economics",
                "fills and latency",
                "borrow and capacity",
            )
        )
        return None, stages
    independently_measured = bool(evidence.get("independently_measured", False))
    cost = float(evidence.get("round_trip_cost_bps", math.nan))
    net_return = float(evidence.get("net_return_bps", math.nan))
    trades = int(evidence.get("trades", 0))
    latency_modelled = bool(evidence.get("latency_modelled", False))
    borrow_confirmed = bool(evidence.get("borrow_confirmed", False))
    capacity = float(evidence.get("capacity_usd", math.nan))
    checks = (
        ("cost model", independently_measured and math.isfinite(cost) and cost >= 0),
        (
            "realized net economics",
            independently_measured
            and math.isfinite(net_return)
            and net_return > 0
            and trades >= 30,
        ),
        ("fills and latency", independently_measured and latency_modelled),
        (
            "borrow and capacity",
            independently_measured
            and borrow_confirmed
            and math.isfinite(capacity)
            and capacity > 0,
        ),
    )
    stages.extend(
        {"stage": stage, "status": "PASS" if passed else "FAIL"}
        for stage, passed in checks
    )
    return certified and all(passed for _, passed in checks), stages


def selection_aware_pair_search(
    prices: Mapping[str, Sequence[float]],
    *,
    observed_at: Sequence[datetime] | None = None,
    available_at: Sequence[datetime] | None = None,
    as_of: datetime | None = None,
    time_unit: str = "day",
    price_transform: str = "log",
    discovery_fraction: float = 0.40,
    train_fraction: float = 0.72,
    correction_level: float = 0.05,
    max_ou_fits: int = 64,
    source: str = "source-supplied",
    revision: str = "unversioned",
    execution_evidence: Mapping[str, Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Screen a full pair family, correct selection, then certify residuals.

    Discovery uses only the prefix window. Hedge ratios use the subsequent OU
    training window and are frozen before the future holdout begins.
    """

    normalized_prices: dict[str, Sequence[float]] = {}
    for symbol, values in prices.items():
        normalized_symbol = str(symbol).upper()
        if normalized_symbol in normalized_prices:
            raise StatArbInputError("security symbols must be unique after normalization")
        normalized_prices[normalized_symbol] = values
    symbols = tuple(sorted(normalized_prices))
    if len(symbols) < 2:
        raise StatArbInputError("at least two securities are required")
    if len(symbols) > 200:
        raise StatArbInputError("at most 200 securities may enter one discovery run")
    if price_transform not in {"log", "level"}:
        raise StatArbInputError("price_transform must be 'log' or 'level'")
    if time_unit not in {"minute", "hour", "day"}:
        raise StatArbInputError("time_unit must be minute, hour, or day")
    if not 0.30 <= discovery_fraction <= 0.55:
        raise StatArbInputError("discovery_fraction must be between 0.30 and 0.55")
    if not 0.60 <= train_fraction <= 0.85:
        raise StatArbInputError("train_fraction must be between 0.60 and 0.85")
    if not 0 < correction_level <= 0.20:
        raise StatArbInputError("correction_level must be in (0, 0.20]")
    if not 1 <= max_ou_fits <= 256:
        raise StatArbInputError("max_ou_fits must be between 1 and 256")

    lengths = {len(normalized_prices[symbol]) for symbol in symbols}
    if len(lengths) != 1:
        raise StatArbInputError("every security must share one aligned observation count")
    observations = lengths.pop()
    if observations < 160:
        raise StatArbInputError("at least 160 aligned observations are required")
    if observations > 5_000:
        raise StatArbInputError("at most 5,000 aligned observations are supported")

    if observed_at is None:
        origin = datetime(2000, 1, 1, tzinfo=timezone.utc)
        timestamps = tuple(origin + timedelta(days=index) for index in range(observations))
    else:
        timestamps = tuple(observed_at)
    if len(timestamps) != observations:
        raise StatArbInputError("observed_at must match the aligned observation count")
    if any(timestamp.tzinfo is None for timestamp in timestamps):
        raise StatArbInputError("observed_at timestamps must include a timezone")
    if any(right <= left for left, right in zip(timestamps, timestamps[1:])):
        raise StatArbInputError("observed_at timestamps must be strictly increasing")
    availability = tuple(available_at) if available_at is not None else timestamps
    if len(availability) != observations:
        raise StatArbInputError("available_at must match the aligned observation count")
    if any(timestamp.tzinfo is None for timestamp in availability):
        raise StatArbInputError("available_at timestamps must include a timezone")
    if any(available < observed for observed, available in zip(timestamps, availability)):
        raise StatArbInputError("available_at cannot precede observed_at")
    resolved_as_of = as_of or availability[-1]
    if resolved_as_of.tzinfo is None:
        raise StatArbInputError("as_of must include a timezone")
    if any(available > resolved_as_of for available in availability):
        raise StatArbInputError("the universe contains data unavailable in the as-of world")

    arrays: dict[str, np.ndarray] = {}
    for symbol in symbols:
        values = np.asarray(normalized_prices[symbol], dtype=float)
        if not np.all(np.isfinite(values)):
            raise StatArbInputError(f"{symbol} contains non-finite observations")
        if price_transform == "log":
            if np.any(values <= 0):
                raise StatArbInputError(f"{symbol} must be positive for the log transform")
            values = np.log(values)
        arrays[symbol] = values

    discovery_end = int(observations * discovery_fraction)
    model_observations = observations - discovery_end
    model_split = max(48, int(model_observations * train_fraction))
    model_split = min(model_split, model_observations - 16)
    holdout_start = discovery_end + model_split
    if discovery_end < 64 or model_observations < 64:
        raise StatArbInputError("the requested windows do not leave enough data for discovery and OU")

    world_manifest = {
        "symbols": symbols,
        "as_of": resolved_as_of,
        "time_unit": time_unit,
        "source": source,
        "revision": revision,
        "price_transform": price_transform,
        "observed_at": timestamps,
        "available_at": availability,
        "values": {symbol: arrays[symbol].tolist() for symbol in symbols},
    }
    world_hash = _hash(world_manifest)
    selection_timestamp = availability[discovery_end - 1]

    screens: list[dict[str, Any]] = []
    for dependent_symbol, independent_symbol in combinations(symbols, 2):
        screen_intercept, screen_beta, statistic, pvalue = _cointegration_screen(
            arrays[dependent_symbol][:discovery_end],
            arrays[independent_symbol][:discovery_end],
        )
        screens.append(
            {
                "pair_id": f"{dependent_symbol}~{independent_symbol}",
                "dependent": dependent_symbol,
                "independent": independent_symbol,
                "cointegration_test": (
                    "Engle-Granger residual ADF(0), finite-sample null with exponential lower-tail extrapolation"
                ),
                "engle_granger_statistic": statistic,
                "adf_statistic": statistic,
                "p_value": pvalue,
                "screen_hedge_intercept": screen_intercept,
                "screen_hedge_ratio": screen_beta,
            }
        )
    adjusted = _benjamini_hochberg([float(screen["p_value"]) for screen in screens])
    for screen, adjusted_pvalue in zip(screens, adjusted):
        screen["adjusted_p_value"] = adjusted_pvalue
        screen["selected"] = adjusted_pvalue <= correction_level

    selected = sorted(
        (screen for screen in screens if bool(screen["selected"])),
        key=lambda item: (float(item["adjusted_p_value"]), float(item["p_value"]), str(item["pair_id"])),
    )
    fitted_screens = selected[:max_ou_fits]
    correction_name = f"Benjamini-Hochberg FDR q={correction_level:.3f}"
    pair_artifacts: list[dict[str, Any]] = []
    for screen in fitted_screens:
        dependent_symbol = str(screen["dependent"])
        independent_symbol = str(screen["independent"])
        hedge_intercept, hedge_ratio = _ols(
            arrays[dependent_symbol][discovery_end:holdout_start],
            arrays[independent_symbol][discovery_end:holdout_start],
        )
        residual = (
            arrays[dependent_symbol][discovery_end:]
            - hedge_intercept
            - hedge_ratio * arrays[independent_symbol][discovery_end:]
        )
        pair_execution = (execution_evidence or {}).get(str(screen["pair_id"]))
        sealed_values = residual[model_split:]
        sealed_holdout = {
            "window": _serialize(
                asdict(_window(timestamps, holdout_start, observations, time_unit))
            ),
            "values": sealed_values.tolist(),
            "observed_at": _serialize(timestamps[holdout_start:]),
            "available_at": _serialize(availability[holdout_start:]),
            "untouched_during_estimation": True,
        }
        sealed_holdout["commitment_hash"] = _hash(
            {
                "pair_id": screen["pair_id"],
                "world_hash": world_hash,
                "sealed_holdout": sealed_holdout,
            }
        )
        execution_survival, execution_reality = _execution_ladder(True, pair_execution)
        artifact = certify_ou(
            residual.tolist(),
            observable=f"{dependent_symbol} - ({hedge_intercept:.6f} + {hedge_ratio:.6f} × {independent_symbol})",
            observed_at=timestamps[discovery_end:],
            available_at=availability[discovery_end:],
            as_of=resolved_as_of,
            time_unit=time_unit,
            train_fraction=train_fraction,
            hypothesis_ledger=HypothesisLedger(
                hypotheses_considered=len(screens),
                selection_procedure=(
                    "full pair-family Engle-Granger screen followed by Benjamini-Hochberg correction"
                ),
                selection_timestamp=selection_timestamp,
                selection_metric="adjusted cointegration p-value, then sealed OU holdout NLL",
                holdout_untouched=True,
                multiplicity_adjustment=correction_name,
            ),
            source=source,
            revision=revision,
            execution_survival=execution_survival,
        )
        certified = bool(
            artifact.scientific_verdict is ScientificVerdict.ACCEPT
            and artifact.predictive_verdict is ScientificVerdict.ACCEPT
        )
        execution_reality[0]["status"] = "PASS" if certified else "FAIL"
        pair_artifacts.append(
            {
                "pair_id": screen["pair_id"],
                "dependent": dependent_symbol,
                "independent": independent_symbol,
                "cointegration": {
                    "test": screen["cointegration_test"],
                    "statistic": screen["adf_statistic"],
                    "p_value": screen["p_value"],
                    "adjusted_p_value": screen["adjusted_p_value"],
                    "correction": correction_name,
                },
                "hedge_ratio": {
                    "intercept": hedge_intercept,
                    "beta": hedge_ratio,
                    "fit_window": _serialize(asdict(_window(timestamps, discovery_end, holdout_start, time_unit))),
                    "frozen_before_holdout": True,
                },
                "sealed_holdout": sealed_holdout,
                "certified": certified,
                "execution_evidence": _serialize(pair_execution),
                "execution_reality": execution_reality,
                "ou_artifact": artifact.to_dict(),
            }
        )

    certified_count = sum(bool(item["certified"]) for item in pair_artifacts)
    economic_survivors = sum(
        bool(item["ou_artifact"]["market_claim_eligible"]) for item in pair_artifacts
    )
    run_id = f"discovery-{_hash({'world_hash': world_hash, 'selection': selection_timestamp, 'alpha': correction_level})[:16]}"
    ledger = DiscoveryLedger(
        discovery_run_id=run_id,
        world_hash=world_hash,
        as_of=resolved_as_of,
        search_universe=symbols,
        eligible_securities=len(symbols),
        candidate_pairs=len(screens),
        pairs_screened=len(screens),
        cointegrated_candidates=len(selected),
        ou_candidates=len(selected),
        ou_fits_completed=len(pair_artifacts),
        certified=certified_count,
        economic_survivors=economic_survivors,
        selection_timestamp=selection_timestamp,
        selection_metric="adjusted cointegration p-value, then sealed OU holdout NLL",
        cointegration_test=(
            "Engle-Granger residual ADF(0), finite-sample null with exponential lower-tail extrapolation"
        ),
        correction_method=correction_name,
        correction_level=correction_level,
        screen_window=_window(timestamps, 0, discovery_end, time_unit),
        hedge_ratio_window=_window(timestamps, discovery_end, holdout_start, time_unit),
        holdout_window=_window(timestamps, holdout_start, observations, time_unit),
    )
    candidate_compression = {
        "hypotheses_screened": len(screens),
        "multiple_testing_survivors": len(selected),
        "scientific_predictive_survivors": certified_count,
        "economic_survivors": economic_survivors,
        "notation": (
            f"{len(screens)} → {len(selected)} → "
            f"{certified_count} → {economic_survivors}"
        ),
    }
    search_survival_rate = {
        "economically_certified_hypotheses": economic_survivors,
        "hypotheses_screened": len(screens),
        "value": economic_survivors / len(screens),
        "fraction": f"{economic_survivors}/{len(screens)}",
    }
    payload: dict[str, Any] = {
        "schema_version": "dynamics-stat-arb/0.2.1",
        "freeze": {
            "milestone": "D0.2.1",
            "frozen": True,
            "content_addressing": (
                "SHA-256 over canonical JSON excluding artifact_hash"
            ),
            "discovery_run_id": run_id,
            "pit_world_hash": world_hash,
        },
        "world": {
            "world_hash": world_hash,
            "as_of": resolved_as_of.isoformat(),
            "point_in_time_enforced": True,
            "time_unit": time_unit,
            "source": source,
            "revision": revision,
            "price_transform": price_transform,
        },
        "discovery_ledger": _serialize(asdict(ledger)),
        "screening_ledger": _serialize(screens),
        "pair_artifacts": pair_artifacts,
        "candidate_compression": candidate_compression,
        "search_survival_rate": search_survival_rate,
        "selection_verdict": "ACCEPT" if certified_count else "REJECT",
        "economic_verdict": (
            "ACCEPT"
            if economic_survivors
            else "ABSTAIN"
            if not execution_evidence
            else "REJECT"
        ),
        "decision_summary": (
            f"Screened all {len(screens)} pairs, corrected the full family, and found "
            f"{certified_count} sealed-holdout OU survivor(s) and {economic_survivors} "
            f"economically certified survivor(s); search survival is "
            f"{search_survival_rate['fraction']}."
        ),
    }
    payload["artifact_hash"] = _hash(payload)
    return payload


def generate_stat_arb_reference(*, spread_seed: int = 808) -> dict[str, Any]:
    """Generate a PIT-valid universe with one deliberately cointegrated pair."""

    observations = 260
    timestamps = [datetime(2024, 1, 2, 21, 0, tzinfo=timezone.utc)]
    while len(timestamps) < observations:
        candidate = timestamps[-1] + timedelta(days=1)
        while candidate.weekday() >= 5:
            candidate += timedelta(days=1)
        timestamps.append(candidate)
    deltas = [
        elapsed_in_unit(left, right, "day") for left, right in zip(timestamps, timestamps[1:])
    ]
    rng = np.random.default_rng(802)
    anchor_log = math.log(100.0) + np.concatenate(
        [[0.0], np.cumsum(rng.normal(0.0002, 0.011, observations - 1))]
    )
    spread = np.asarray(
        generate_exact_ou(
            deltas,
            theta=0.70,
            mu=0.0,
            sigma=0.025,
            seed=spread_seed,
            initial_value=0.03,
        )
    )
    universe: dict[str, list[float]] = {
        "ANCHOR": [float(value) for value in np.exp(anchor_log)],
        "PAIRED": [float(value) for value in np.exp(0.35 + 1.12 * anchor_log + spread)],
    }
    for index, symbol in enumerate(("ALPHA", "BRAVO", "DELTA", "ECHO", "KAPPA", "SIGMA")):
        path = math.log(55.0 + index * 9.0) + np.concatenate(
            [[0.0], np.cumsum(rng.normal(0.0001, 0.013 + index * 0.0007, observations - 1))]
        )
        universe[symbol] = [float(value) for value in np.exp(path)]
    available_at = [timestamp + timedelta(minutes=20) for timestamp in timestamps]
    return selection_aware_pair_search(
        universe,
        observed_at=timestamps,
        available_at=available_at,
        as_of=available_at[-1],
        source="controlled-synthetic-stat-arb",
        revision="d0.2.1-reference-1",
    )
