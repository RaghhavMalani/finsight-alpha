"""PIT descriptive analytics and disclosed research-policy landscapes.

All arithmetic lives server-side. Heuristic scores are NOT calibrated
probabilities. Neither a fitted event process nor an in-sample optimum certifies
causality, future performance, exact graphs, or deployable HFT alpha.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from functools import lru_cache
import math
from zoneinfo import ZoneInfo

import numpy as np

from src.dynamics.market_regime_inputs import (
    FACTORS,
    RegimeInputError,
    RegimeWorld,
    digest,
    known,
    utc,
    vintage,
)

POLICY = {
    "version": "market-regime/0.4.2",
    "vol_windows": [5, 20, 60],
    "ewma_lambda": 0.94,
    "factor_window": 120,
    "factor_minimum": 60,
    "factor_hac_lags": 3,
    "neutrality_tolerance": 0.10,
    "condition_limit": 1e8,
    "momentum_horizons": [1, 5, 20, 60],
    "momentum_weights": [0.1, 0.2, 0.3, 0.4],
    "regime_minimum": 30,
    "landscape_window": 120,
    "landscape_minimum": 60,
    "temperature_grid": [round(0.2 + i * 0.18, 2) for i in range(11)],
    "sensitivity_grid": [round(i * 0.2, 2) for i in range(11)],
    "objective_weights": {
        "research_return": 1.0,
        "drawdown": -1.2,
        "slippage": -1.0,
        "conflict": -0.02,
        "turnover": -0.005,
        "tail": -1.0,
    },
    "fracture_weights": {
        k: 1 / 6
        for k in ("volatility", "correlation", "liquidity", "event", "factor", "macro")
    },
    "hawkes_training_sessions": 30,
}
CLAIMS = {
    "market_claim_eligible": False,
    "causal_claim_eligible": False,
    "validated_alpha": False,
    "trusted_graph": False,
    "precise_edge_confidence": False,
}
REGIMES = (
    "BULL_TREND",
    "BEAR_TREND",
    "CHOP_LOW_VOL",
    "CHOP_HIGH_VOL",
    "LIQUIDITY_STRESS",
    "MACRO_SHOCK",
    "EVENT_DRIVEN",
    "UNRESOLVED",
)


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, np.ndarray)):
        return [clean(v) for v in value]
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return round(float(value), 10) if math.isfinite(value) else None
    return value


def robust_z(value: float | None, history: list | np.ndarray) -> float | None:
    values = np.asarray([x for x in history if x is not None], dtype=float)
    if value is None or len(values) < 10:
        return None
    center = float(np.median(values))
    scale = float(1.4826 * np.median(np.abs(values - center)))
    if scale < 1e-12:
        scale = float(np.std(values, ddof=1))
    return (
        (value - center) / scale
        if scale >= 1e-12
        else (0.0 if abs(value - center) < 1e-12 else None)
    )


def autocorrelation(values: np.ndarray) -> float | None:
    if len(values) < 20 or np.std(values[:-1]) < 1e-12 or np.std(values[1:]) < 1e-12:
        return None
    return float(np.corrcoef(values[:-1], values[1:])[0, 1])


def volatility_path(returns: list[float | None], annual: int) -> list[dict]:
    output, variance = [], None
    for i, value in enumerate(returns):
        if value is None:
            output.append({"state": "UNRESOLVED", "components": {}, "confidence": 0.0})
            continue
        variance = value**2 if variance is None else 0.94 * variance + 0.06 * value**2
        history = np.asarray(
            [x for x in returns[max(0, i - 59) : i + 1] if x is not None]
        )
        realized = {
            str(w): (
                float(np.sqrt(np.mean(history[-w:] ** 2) * annual))
                if len(history) >= w
                else None
            )
            for w in (5, 20, 60)
        }
        prior = [r["components"].get("realized_vol") for r in output[-120:]]
        z = robust_z(realized["20"], prior)
        previous_returns = [x for x in returns[max(0, i - 20) : i] if x is not None]
        denominator = (
            float(np.sqrt(np.mean(np.square(previous_returns))))
            if len(previous_returns) >= 20
            else None
        )
        shock = (
            abs(value) / denominator if denominator and denominator > 1e-12 else None
        )
        ac_abs, ac_sq = autocorrelation(np.abs(history)), autocorrelation(history**2)
        five = [r["components"].get("rv_5") for r in output[-20:]]
        baseline = [r["components"].get("rv_5") for r in output[-120:-20]]
        baseline = [x for x in baseline if x is not None]
        usable = [x for x in five if x is not None]
        persistence = (
            sum(x > np.median(baseline) for x in usable) / len(usable)
            if len(baseline) >= 20 and len(usable) >= 10
            else None
        )
        parts = {
            "absolute_dependence": 0.3 * max(0.0, ac_abs or 0.0),
            "squared_dependence": 0.3 * max(0.0, ac_sq or 0.0),
            "vol_level": 0.2 * np.clip((z or 0.0) / 4, 0, 1),
            "persistence": 0.2 * (persistence or 0.0),
        }
        ready = (
            len(history) >= 60
            and z is not None
            and persistence is not None
            and ac_abs is not None
            and ac_sq is not None
        )
        cluster = sum(parts.values()) if ready else None
        ratio = (
            realized["5"] / realized["20"] if realized["20"] and realized["5"] else None
        )
        state = "UNRESOLVED"
        if ready:
            if shock is not None and shock >= 4:
                state = "VOL_SHOCK"
            elif ratio is not None and ratio >= 1.7 and (z or 0) >= 1:
                state = "VOL_BREAK"
            elif (
                ac_abs >= 0.15
                and ac_sq >= 0.15
                and persistence >= 0.4
                and cluster >= 0.3
            ):
                state = "VOL_CLUSTER"
            elif z <= -1:
                state = "LOW_VOL"
            elif z >= 1:
                state = "HIGH_VOL"
            else:
                state = "NORMAL"
        output.append(
            {
                "state": state,
                "confidence": min(1.0, len(history) / 60) if ready else 0.0,
                "confidence_meaning": "Window sufficiency, not calibrated probability",
                "cluster_score": cluster,
                "cluster_contributions": parts if ready else {},
                "components": {
                    "realized_vol": realized["20"],
                    "rv_5": realized["5"],
                    "rv_20": realized["20"],
                    "rv_60": realized["60"],
                    "ewma_vol": np.sqrt(variance * annual),
                    "rolling_variance": (
                        float(np.var(history[-20:], ddof=1))
                        if len(history) >= 20
                        else None
                    ),
                    "abs_return_ac": ac_abs,
                    "squared_return_ac": ac_sq,
                    "vol_of_vol": (
                        float(np.std(usable, ddof=1)) if len(usable) >= 10 else None
                    ),
                    "vol_z": z,
                    "persistence": persistence,
                    "shock_score": shock,
                    "break_ratio": ratio,
                    "observations": len(history),
                },
            }
        )
    return clean(output)


@lru_cache(maxsize=16)
def _event_fit(times: tuple[float, ...], horizon: float) -> dict:
    from src.dynamics.hawkes_identifiability import fit_exponential_hawkes

    fit = fit_exponential_hawkes([times], horizon=horizon)
    good = bool(fit["optimizer"]["success"]) and math.isfinite(fit["spectral_radius"])
    return clean(
        {
            "status": "AVAILABLE" if good else "UNAVAILABLE",
            "mu": fit["baseline"][0] if good else None,
            "alpha": fit["alpha"][0, 0] if good else None,
            "beta": fit["beta"] if good else None,
            "fitted_rho": fit["spectral_radius"] if good else None,
            "optimizer_success": good,
        }
    )


def event_path(world: RegimeWorld, bars: list) -> list[dict]:
    available_events = known(world.events, bars[-1].available_at) if bars else []
    model, start, training_cutoff = None, None, None
    if len(bars) >= 30:
        training_cutoff = bars[29].available_at
        train = known(available_events, training_cutoff)
        if len(train) >= 30:
            start = bars[0].observed_at.replace(hour=0, minute=0)
            times = tuple(
                (r.observed_at - start).total_seconds() / 3600
                for r in train
                if r.observed_at >= start
            )
            horizon = (bars[29].observed_at - start).total_seconds() / 3600
            model = _event_fit(times, horizon)
    output, counts = [], []
    for bar in bars:
        events = [
            e
            for e in available_events
            if e.observed_at <= bar.observed_at and e.available_at <= bar.available_at
        ]
        day = bar.observed_at.astimezone(ZoneInfo(world.timezone)).date()
        count = sum(
            e.observed_at.astimezone(ZoneInfo(world.timezone)).date() == day
            for e in events
        )
        burst = robust_z(float(count), counts[-60:]) if events else None
        pressure, intensity = None, None
        if (
            model
            and model["status"] == "AVAILABLE"
            and bar.available_at >= training_cutoff
        ):
            # Strict left-limit predictable intensity: no same-time event jump.
            excitation = sum(
                model["alpha"]
                * math.exp(
                    -model["beta"]
                    * (bar.observed_at - e.observed_at).total_seconds()
                    / 3600
                )
                for e in events
                if e.observed_at < bar.observed_at
            )
            intensity = model["mu"] + excitation
            pressure = excitation / intensity if intensity > 0 else None
        output.append(
            {
                "status": "AVAILABLE" if pressure is not None else "UNAVAILABLE",
                "pressure": pressure,
                "intensity_per_calendar_hour": intensity,
                "event_count": count if events else None,
                "burst_z": burst,
                "fitted_rho": model["fitted_rho"] if pressure is not None else None,
                "training_as_of": (
                    training_cutoff.isoformat()
                    if training_cutoff and pressure is not None
                    else None
                ),
                "training_sessions": 30,
                "time_basis": "Calendar hours, including market closures",
                "criticality_status": "UNRESOLVED",
                "graph_status": "NOT_TRUSTED",
                "edge_confidence_status": "NOT_TRUSTED",
                "causal_status": "NOT_ESTABLISHED",
                "method": "Unchanged D0.4.1 univariate fit on first 30 published sessions; fixed thereafter",
            }
        )
        counts.append(float(count))
    return clean(output)


def macro_state(world: RegimeWorld, cutoff: datetime) -> dict:
    groups = defaultdict(list)
    for row in vintage(world.macro, cutoff):
        groups[row.series].append(row)
    rows = []
    for name, samples in sorted(groups.items()):
        current, previous = samples[-1], samples[-61:-1]
        z = robust_z(current.value, [r.value for r in previous])
        signed = (
            z
            if current.direction == "HIGH_IS_STRESS"
            else (-z if z is not None else None)
        )
        rows.append(
            {
                "series": name,
                "value": current.value,
                "z": z,
                "stress": (
                    float(np.clip((signed or 0) / 4, 0, 1))
                    if signed is not None
                    else None
                ),
                "observations": len(previous),
                "observed_at": current.observed_at.isoformat(),
                "available_at": current.available_at.isoformat(),
                "revision": current.revision,
                "direction": current.direction,
            }
        )
    stresses = [r["stress"] for r in rows if r["stress"] is not None]
    return clean(
        {
            "status": "AVAILABLE" if stresses else "UNAVAILABLE",
            "score": float(np.mean(stresses)) if stresses else None,
            "series": rows,
        }
    )


def seasonality(world: RegimeWorld, cutoff: datetime) -> dict:
    bars = known(world.intraday, cutoff)
    events = known(world.events, cutoff)
    event_times = np.array([e.observed_at.timestamp() for e in events])
    publication = np.array([e.available_at.timestamp() for e in events])
    groups, previous_by_day = defaultdict(list), {}
    for bar in bars:
        local = bar.observed_at.astimezone(ZoneInfo(world.timezone))
        day, bucket = local.date(), local.strftime("%H:%M")
        previous = previous_by_day.get(day)
        r = bar.close / previous.close - 1 if previous else None
        end, begin = (
            bar.observed_at.timestamp(),
            bar.observed_at.timestamp() - world.bucket_minutes * 60,
        )
        left, right = np.searchsorted(event_times, [begin, end], side="right")
        count = (
            int(np.sum(publication[left:right] <= bar.available_at.timestamp()))
            if events
            else None
        )
        values = {
            "volume": bar.volume,
            "realized_vol": (
                abs(r) * math.sqrt(world.session_minutes / world.bucket_minutes)
                if r is not None
                else None
            ),
            "return_magnitude": abs(r) if r is not None else None,
            "spread": bar.spread_bps,
            "liquidity": bar.liquidity,
            "event_intensity": (
                count / world.bucket_minutes if count is not None else None
            ),
            "trade_intensity": (
                bar.trade_count / world.bucket_minutes
                if bar.trade_count is not None
                else None
            ),
            "order_imbalance": bar.order_imbalance,
        }
        groups[(local.weekday(), bucket)].append((bar, values))
        previous_by_day[day] = bar
    cells = []
    for (weekday, bucket), samples in sorted(groups.items()):
        current, values = samples[-1]
        current_day = current.observed_at.astimezone(ZoneInfo(world.timezone)).date()
        history = [
            (bar, v)
            for bar, v in samples[:-1]
            if bar.observed_at.astimezone(ZoneInfo(world.timezone)).date() < current_day
            and bar.available_at <= current.available_at
        ][-120:]
        metrics = {}
        for name, value in values.items():
            data = [v[name] for _, v in history if v[name] is not None]
            sufficient = len(data) >= 5 and value is not None
            metrics[name] = {
                "status": "AVAILABLE" if sufficient else "UNAVAILABLE",
                "observations": len(data),
                "current": value,
                "mean": float(np.mean(data)) if data else None,
                "median": float(np.median(data)) if data else None,
                "mad": (
                    float(np.median(np.abs(np.array(data) - np.median(data))))
                    if data
                    else None
                ),
                "percentile": (
                    (sum(x < value for x in data) + 0.5 * sum(x == value for x in data))
                    / len(data)
                    if sufficient
                    else None
                ),
                "z": robust_z(value, data) if sufficient else None,
            }
        cells.append(
            {
                "weekday": weekday,
                "bucket": bucket,
                "current_at": current.observed_at.isoformat(),
                "baseline_end": (
                    history[-1][0].observed_at.isoformat() if history else None
                ),
                "metrics": metrics,
            }
        )
    return clean(
        {
            "status": "AVAILABLE" if cells else "UNAVAILABLE",
            "timezone": world.timezone,
            "bucket_minutes": world.bucket_minutes,
            "cells": cells,
            "metrics": [
                "realized_vol",
                "volume",
                "spread",
                "liquidity",
                "event_intensity",
                "return_magnitude",
                "trade_intensity",
                "order_imbalance",
            ],
            "baseline_rule": "Same weekday/bucket; only prior sessions known by that cell's current publication; min 5 observations; robust z requires 10",
            "vol_unit": "Session-equivalent close-to-close bucket magnitude; first bucket unavailable",
            "event_unit": "Aggregate events per minute; NOT necessarily trades",
        }
    )


def momentum_stats(
    states: list[dict], returns: list[float | None], annual: int
) -> list[dict]:
    groups = defaultdict(list)
    previous_position = 0.0
    for i in range(1, len(states)):
        previous = states[i - 1]
        signal, outcome = previous["momentum"]["signal"], returns[i]
        if signal is not None and outcome is not None:
            position = float(np.tanh(signal * 10))
            turnover = abs(position - previous_position)
            groups[previous["regime"]].append((signal, position, outcome, turnover))
            previous_position = position
        else:
            previous_position = 0.0
    result = []
    for name in REGIMES:
        samples = groups[name]
        n = len(samples)
        signals = np.array([r[0] for r in samples])
        positions = np.array([r[1] for r in samples])
        outcomes = np.array([r[2] for r in samples])
        research = positions * outcomes
        sufficient = n >= 30
        scale = np.std(research, ddof=1) if n > 1 else 0
        hit = np.mean(np.sign(signals) == np.sign(outcomes)) if sufficient else None
        wealth = np.cumprod(1 + research) if n else np.array([])
        dd = (
            float(np.max(1 - wealth / np.maximum.accumulate(np.r_[1.0, wealth])[1:]))
            if n
            else None
        )
        result.append(
            {
                "regime": name,
                "n": n,
                "status": "DESCRIPTIVE" if sufficient else "UNRESOLVED",
                "mean_signal": float(np.mean(signals)) if n else None,
                "mean_return": float(np.mean(outcomes)) if n else None,
                "hit_rate": hit,
                "sharpe": (
                    float(np.mean(research) / scale * math.sqrt(annual))
                    if sufficient and scale > 1e-12
                    else None
                ),
                "turnover": (
                    float(np.mean([r[3] for r in samples])) if sufficient else None
                ),
                "drawdown": dd if sufficient else None,
                "confidence": min(1.0, n / 120) if sufficient else 0.0,
                "note": "One-session lagged signal; descriptive gross subset path, no OOS claim. Turnover uses chronological positions including regime switches. Sample support is not a probability.",
            }
        )
    return clean(result)


def fracture(current: dict, previous: dict | None) -> dict:
    keys = {
        "volatility": "V",
        "correlation": "C",
        "liquidity": "L",
        "event": "H",
        "factor": "F",
        "macro": "S",
    }
    parts = {}
    for name, key in keys.items():
        a, b = current.get(key), previous.get(key) if previous else None
        parts[name] = (
            abs(a - b) * POLICY["fracture_weights"][name]
            if a is not None and b is not None
            else None
        )
    complete = all(v is not None for v in parts.values())
    score = sum(parts.values()) if complete else None
    return clean(
        {
            "status": "COMPLETE" if complete else "UNRESOLVED",
            "score": score,
            "available_contribution_sum": sum(
                v for v in parts.values() if v is not None
            ),
            "contributions": parts,
            "coverage": sum(v is not None for v in parts.values()) / 6,
            "state": (
                "SEVERE_TRANSITION"
                if score is not None and score >= 0.25
                else (
                    "TRANSITION"
                    if score is not None and score >= 0.10
                    else ("STABLE" if complete else "UNRESOLVED")
                )
            ),
            "weights": POLICY["fracture_weights"],
        }
    )


def hac_regression(y: np.ndarray, factors: np.ndarray) -> dict:
    """OLS with Bartlett Newey-West lag-3 covariance, n/(n-k) correction."""
    x = np.column_stack([np.ones(len(y)), factors])
    n, k = x.shape
    if n < max(60, 5 * k) or np.linalg.matrix_rank(x) < k:
        return {
            "status": "UNIDENTIFIABLE",
            "reason": "Insufficient observations or deficient rank",
            "n": n,
        }
    condition = float(np.linalg.cond(x))
    if condition > 1e8:
        return {
            "status": "UNIDENTIFIABLE",
            "reason": "Ill-conditioned factor design",
            "n": n,
            "condition": condition,
        }
    beta = np.linalg.lstsq(x, y, rcond=None)[0]
    residual = y - x @ beta
    xu = x * residual[:, None]
    meat = xu.T @ xu
    for lag in range(1, min(3, n - 1) + 1):
        cross = xu[lag:].T @ xu[:-lag]
        meat += (1 - lag / 4) * (cross + cross.T)
    bread = np.linalg.inv(x.T @ x)
    covariance = bread @ meat @ bread * n / (n - k)
    se = np.sqrt(np.maximum(np.diag(covariance), 0))
    return {
        "status": "AVAILABLE",
        "n": n,
        "condition": condition,
        "beta": beta,
        "se": se,
        "covariance": covariance,
    }


def landscape(
    states: list[dict], bars: list, annual: int, previous_gradient=None
) -> dict:
    valid = []
    for i in range(max(1, len(states) - 120), len(states)):
        lag = states[i - 1]
        vector = lag["vector"]
        r = states[i]["asset_return"]
        spread = bars[i - 1].spread_bps
        # Current day's spread, regime or close MUST NOT select its position.
        if (
            all(vector.get(k) is not None for k in ("V", "L", "M", "H", "F", "S"))
            and r is not None
            and spread is not None
        ):
            valid.append((lag, r, spread))
        else:
            # Do not bridge evidence gaps or silently fill missing costs/states.
            valid = []
    if len(valid) < 60:
        return {
            "status": "UNAVAILABLE",
            "reason": "Need 60 contiguous fully observed lagged-state/cost pairs in the last 120 sessions",
            "n": len(valid),
            "cells": [],
            "optimum": None,
            "gradient_change": None,
            "gradient": None,
        }
    r = np.array([v[1] for v in valid])
    spread = np.array([v[2] for v in valid])
    m = np.array([v[0]["vector"]["M"] for v in valid])
    v = np.array([v[0]["vector"]["V"] for v in valid])
    l = np.array([v[0]["vector"]["L"] for v in valid])
    h = np.array([v[0]["vector"]["H"] for v in valid])
    f = np.array([v[0]["vector"]["F"] for v in valid])
    s = np.array([v[0]["vector"]["S"] for v in valid])
    agents = np.stack([m, np.tanh(m * 1.5), -m * (1 - v)], axis=1)
    strength = np.abs(agents)
    cells, grids = [], []
    for gamma in POLICY["sensitivity_grid"]:
        row = []
        for tau in POLICY["temperature_grid"]:
            logits = strength / tau
            weights = np.exp(logits - logits.max(axis=1, keepdims=True))
            weights /= weights.sum(axis=1, keepdims=True)
            position = (
                (weights * agents).sum(axis=1)
                * np.exp(-gamma * s)
                * (1 - 0.5 * v)
                * (1 - 0.5 * l)
                * (1 - 0.25 * h)
                * (1 - 0.25 * f)
            )
            turnover = np.abs(np.diff(np.r_[0.0, position]))
            slippage = turnover * (spread * 0.00005 + l * 0.0001)
            gross = position * r
            net = gross - slippage
            wealth = np.cumprod(1 + net)
            dd = np.max(1 - wealth / np.maximum.accumulate(np.r_[1.0, wealth])[1:])
            conflict = np.mean(
                (
                    weights
                    * np.abs(agents - (weights * agents).sum(axis=1, keepdims=True))
                ).sum(axis=1)
            )
            tail = max(0.0, -float(np.quantile(net, 0.05))) * math.sqrt(annual)
            components = {
                "research_return": float(np.mean(gross) * annual),
                "drawdown": float(dd),
                "slippage": float(np.mean(slippage) * annual),
                "conflict": float(conflict),
                "turnover": float(np.mean(turnover)),
                "tail": tail,
            }
            contributions = {
                k: value * POLICY["objective_weights"][k]
                for k, value in components.items()
            }
            objective = sum(contributions.values())
            cells.append(
                {
                    "temperature": tau,
                    "sensitivity": gamma,
                    "objective": objective,
                    "stress": min(1.0, dd + tail + conflict),
                    "components": components,
                    "contributions": contributions,
                    "n": len(valid),
                }
            )
            row.append(objective)
        grids.append(row)
    gradient = np.array(np.gradient(np.array(grids), 0.2, 0.18))
    gradient_change = (
        float(np.sqrt(np.mean((gradient - previous_gradient) ** 2)))
        if previous_gradient is not None
        else None
    )
    optimum = max(cells, key=lambda c: c["objective"])
    return clean(
        {
            "status": "ILLUSTRATIVE_RESEARCH",
            "reason": None,
            "n": len(valid),
            "cells": cells,
            "optimum": optimum,
            "gradient_change": gradient_change,
            "gradient": gradient,
            "policy": "Three disclosed heuristic agents; softmax temperature; lagged stress attenuation. NOT deployed MacroHFT agents.",
            "evaluation": "Rolling in-sample descriptive policy replay; no walk-forward profit claim",
            "cost_model": "Prior-session half-spread plus liquidity-stress proxy, no measured fills/impact/fees",
            "objective_weights": POLICY["objective_weights"],
            "fit_end": states[-1]["observed_at"],
            "return_unit": "Decimal simple returns; annualized arithmetic mean, not CAGR",
        }
    )


def compile_world(world: RegimeWorld, *, as_of: datetime | str) -> dict:
    cutoff = utc(as_of)
    bars = known(world.daily, cutoff)
    if len(bars) < 2:
        raise RegimeInputError("At least two published daily bars are required")
    returns = [None] + [
        bars[i].close / bars[i - 1].close - 1 for i in range(1, len(bars))
    ]
    if any(r is not None and (r <= -1 or r > 5) for r in returns):
        raise RegimeInputError(
            "Implausible daily return; check units/corporate actions"
        )
    vol, factors, events = (
        volatility_path(returns, world.annual_sessions),
        factor_path(world, bars),
        event_path(world, bars),
    )
    states, paths, gradients = [], [], None
    previous_vector, current_landscape = None, None
    for i, bar in enumerate(bars):
        macro = macro_state(world, bar.available_at)
        horizons = {
            str(w): bar.close / bars[i - w].close - 1 if i >= w else None
            for w in (1, 5, 20, 60)
        }
        signal = (
            sum(
                horizons[str(w)] * weight
                for w, weight in zip((1, 5, 20, 60), (0.1, 0.2, 0.3, 0.4))
            )
            if i >= 60
            else None
        )
        liquidity_z = robust_z(
            bar.liquidity, [b.liquidity for b in bars[max(0, i - 120) : i]]
        )
        liquidity_stress = (
            float(np.clip(-liquidity_z / 4, 0, 1)) if liquidity_z is not None else None
        )
        vr = vol[i]["components"].get("vol_z")
        stress = float(np.clip((vr + 2) / 6, 0, 1)) if vr is not None else None
        factor_strength = (
            float(np.clip(np.mean([abs(r["beta"]) for r in factors[i]["rows"]]), 0, 1))
            if factors[i]["status"] != "UNIDENTIFIABLE"
            else None
        )
        fac = {r.observed_at: r for r in vintage(world.factors, bar.available_at)}
        pair = [
            (returns[j], fac[bars[j].observed_at].values.get("MKT"))
            for j in range(max(1, i - 29), i + 1)
            if bars[j].observed_at in fac
        ]
        pair = [p for p in pair if p[0] is not None and p[1] is not None]
        correlation = (
            abs(float(np.corrcoef(np.array(pair).T)[0, 1]))
            if len(pair) >= 20
            and all(np.std(np.array(pair)[:, j]) > 1e-12 for j in (0, 1))
            else None
        )
        vector = {
            "V": stress,
            "L": liquidity_stress,
            "M": float(np.tanh(signal * 10)) if signal is not None else None,
            "H": events[i]["pressure"],
            "F": factor_strength,
            "S": macro["score"],
            "C": correlation,
        }
        regime = "UNRESOLVED"
        if signal is not None and stress is not None:
            if liquidity_stress is not None and liquidity_stress >= 0.6:
                regime = "LIQUIDITY_STRESS"
            elif macro["score"] is not None and macro["score"] >= 0.6:
                regime = "MACRO_SHOCK"
            elif events[i]["pressure"] is not None and events[i]["pressure"] >= 0.75:
                regime = "EVENT_DRIVEN"
            elif signal >= 0.01:
                regime = "BULL_TREND"
            elif signal <= -0.01:
                regime = "BEAR_TREND"
            else:
                regime = "CHOP_HIGH_VOL" if stress >= 0.5 else "CHOP_LOW_VOL"
        states.append(
            {
                "observed_at": bar.observed_at.isoformat(),
                "available_at": bar.available_at.isoformat(),
                "asset_return": returns[i],
                "regime": regime,
                "vector": vector,
                "vector_complete": all(v is not None for v in vector.values()),
                "volatility": vol[i],
                "momentum": {
                    "signal": signal,
                    "horizons": horizons,
                    "weights": POLICY["momentum_weights"],
                },
                "factors": factors[i],
                "events": events[i],
                "macro": macro,
                "liquidity": {
                    "value": bar.liquidity,
                    "z": liquidity_z,
                    "stress": liquidity_stress,
                    "spread_bps": bar.spread_bps,
                },
                "fracture": fracture(vector, previous_vector),
            }
        )
        previous_vector = vector
        current_landscape = landscape(
            states, bars[: i + 1], world.annual_sessions, gradients
        )
        if current_landscape["optimum"]:
            paths.append(
                {
                    "as_of": bar.available_at.isoformat(),
                    "observed_at": bar.observed_at.isoformat(),
                    **{
                        k: current_landscape["optimum"][k]
                        for k in (
                            "temperature",
                            "sensitivity",
                            "objective",
                            "stress",
                            "n",
                        )
                    },
                    "gradient_change": current_landscape["gradient_change"],
                }
            )
            gradients = np.array(current_landscape["gradient"])
        else:
            gradients = None
    current_landscape.pop("gradient", None)
    factor_pnl, raw, explained, residual = [], 0.0, 0.0, 0.0
    for state in states:
        f = state["factors"]
        if f["explained_return"] is not None:
            raw += f["raw_return"]
            explained += f["explained_return"]
            residual += f["residual_return"]
            factor_pnl.append(
                {
                    "observed_at": state["observed_at"],
                    "raw": raw,
                    "explained": explained,
                    "residual": residual,
                }
            )
    visible = {
        name: [r.model_dump(mode="json") for r in known(getattr(world, name), cutoff)]
        for name in ("daily", "intraday", "factors", "macro", "events")
    }
    payload = clean(
        {
            "schema_version": "market-regime-lab/0.4.2",
            "world": {
                "id": world.id,
                "ticker": world.ticker,
                "scope": world.evidence_scope,
                "source": world.source,
                "revision": world.revision,
                "price_basis": world.price_basis,
                "calendar_note": world.calendar_note,
                "as_of": cutoff.isoformat(),
                "input_hash": digest(visible),
                "observations": len(bars),
                "timezone": world.timezone,
            },
            "claims": CLAIMS,
            "policy": POLICY,
            "current": states[-1],
            "timeline": [
                {
                    "observed_at": s["observed_at"],
                    "available_at": s["available_at"],
                    "regime": s["regime"],
                    "vector": s["vector"],
                    "fracture": s["fracture"]["score"],
                    "vol": s["volatility"]["components"].get("realized_vol"),
                    "cluster": s["volatility"].get("cluster_score"),
                    "momentum": s["momentum"]["signal"],
                }
                for s in states
            ],
            "volatility_history": [
                {"observed_at": s["observed_at"], **s["volatility"]}
                for s in states[-120:]
            ],
            "seasonality": seasonality(world, cutoff),
            "factor_pnl": factor_pnl,
            "factor_pnl_note": "Additive cumulative returns over aligned decomposition rows, unit notional; raw = explained + residual. Not compound equity or executable cash P&L.",
            "momentum_regimes": momentum_stats(states, returns, world.annual_sessions),
            "landscape": current_landscape,
            "optimizer_path": paths,
            "limitations": [
                "Experimental composites and thresholds are descriptive heuristics, not calibrated probability or profitability.",
                "No automatic provider download: explicit publication/vintage timestamps are mandatory.",
                "Hawkes boundary/criticality limitations remain; no graph or precise edge intervals enter state.",
                "Factor loadings and landscape optima are historical estimates; no out-of-sample validation.",
                "Missing components remain null; a partial fracture is not promoted to a complete score.",
            ],
        }
    )
    payload["artifact_hash"] = digest(payload)
    return payload


def factor_path(world: RegimeWorld, bars: list) -> list[dict]:
    output, rolling = [], defaultdict(list)
    for i, current in enumerate(bars):
        available = vintage(world.factors, current.available_at)
        table = {r.observed_at: r for r in available}
        current_factors = table.get(current.observed_at)
        names = [
            name for name in FACTORS if any(name in row.values for row in available)
        ]
        training = [
            b
            for b in bars[max(0, i - 120) : i]
            if b.strategy_return is not None
            and b.observed_at in table
            and all(name in table[b.observed_at].values for name in names)
        ]
        fit = (
            hac_regression(
                np.array([b.strategy_return for b in training]),
                np.array(
                    [
                        [table[b.observed_at].values[name] for name in names]
                        for b in training
                    ]
                ),
            )
            if names and training
            else {
                "status": "UNIDENTIFIABLE",
                "reason": "No aligned strategy/factor history",
                "n": 0,
            }
        )
        rows, explained, residual = [], None, None
        for name in FACTORS:
            if name not in names or fit["status"] != "AVAILABLE":
                rows.append(
                    {
                        "factor": name,
                        "status": "UNIDENTIFIABLE",
                        "reason": "Missing factor or insufficient full-rank history",
                        "beta": None,
                        "standard_error": None,
                        "t_stat": None,
                        "exposure_z": None,
                        "stability": None,
                        "rolling_beta": [],
                    }
                )
                continue
            j = names.index(name) + 1
            beta, se = float(fit["beta"][j]), float(fit["se"][j])
            lower, upper = beta - 1.96 * se, beta + 1.96 * se
            state = (
                "NEUTRAL"
                if lower >= -0.1 and upper <= 0.1
                else ("EXPOSED" if lower > 0.1 or upper < -0.1 else "WATCH")
            )
            previous = rolling[name][-20:]
            rows.append(
                {
                    "factor": name,
                    "status": state,
                    "reason": None,
                    "beta": beta,
                    "standard_error": se,
                    "t_stat": beta / se if se > 1e-12 else None,
                    "exposure_z": robust_z(beta, previous),
                    "stability": (
                        1 / (1 + np.std(previous, ddof=1))
                        if len(previous) >= 10
                        else None
                    ),
                    "rolling_beta": previous[-12:] + [beta],
                    "lower": lower,
                    "upper": upper,
                }
            )
            rolling[name].append(beta)
        if (
            fit["status"] == "AVAILABLE"
            and current.strategy_return is not None
            and current_factors
            and all(name in current_factors.values for name in names)
        ):
            explained = float(
                fit["beta"][0]
                + sum(
                    fit["beta"][j + 1] * current_factors.values[name]
                    for j, name in enumerate(names)
                )
            )
            residual = current.strategy_return - explained
        statuses = [r["status"] for r in rows]
        overall = (
            "UNIDENTIFIABLE"
            if "UNIDENTIFIABLE" in statuses
            else (
                "EXPOSED"
                if "EXPOSED" in statuses
                else ("WATCH" if "WATCH" in statuses else "NEUTRAL")
            )
        )
        output.append(
            {
                "status": overall,
                "rows": rows,
                "n": fit["n"],
                "condition": fit.get("condition"),
                "reason": fit.get("reason"),
                "alpha": (
                    float(fit["beta"][0]) if fit["status"] == "AVAILABLE" else None
                ),
                "raw_return": current.strategy_return,
                "explained_return": explained,
                "residual_return": residual,
                "fit_end": training[-1].observed_at.isoformat() if training else None,
                "fit_available_as_of": current.available_at.isoformat(),
                "covariance_method": "Newey-West/Bartlett lag 3; normal-approximation intervals",
                "complete_factor_universe": len(names) == len(FACTORS),
            }
        )
    return clean(output)
