"""Deterministic v0.2.4.1 Reality Ladder construction and verification."""

from __future__ import annotations

import json
import math
import platform
import random
import statistics
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from src.eval.canonical import canonical_json_bytes, canonical_sha256, sha256_bytes
from src.execution.benchmark import ExecutionBenchmarkTask, load_execution_task
from src.execution.trust import BoundEngineTrust, CertificationIndex


SCHEMA_VERSION = "forge-reality-ladder/0.2.4.1"
FREEZE_TAG = "FORGE_REALITY_LADDER_V0_2_4_1"
REGIMES = ("TRENDING", "MEAN_REVERTING", "HIGH_VOLATILITY")
SEEDS = (101, 211, 307, 401, 503)
CHECKPOINTS = (
    "L0_ANALYTICAL",
    "L1_VECTORBT",
    "L2_NAUTILUS",
    "L3_FEES_SLIPPAGE",
    "L3_LATENCY",
    "L4_COUNTERFACTUAL_STRESS",
)
METRIC_NAMES = (
    "gross_return",
    "net_return",
    "sharpe",
    "max_drawdown",
    "turnover",
    "orders",
    "fills",
    "fill_ratio",
    "fees",
    "slippage",
    "latency_cost",
)
INITIAL_CASH = 100_000.0
POINTS = 240
STEP_NS = 1_000_000_000
BASE_NS = 1_767_225_600_000_000_000
STRATEGY = {
    "strategy_id": "dual_moving_average_long_flat_v1",
    "fast_window": 5,
    "slow_window": 20,
    "position_quantity": 100,
    "signal_rule": "long when trailing fast mean is strictly greater than trailing slow mean; otherwise flat",
    "execution_rule": "signals use observations through t and submit at t+1; force flat at final observation",
    "machine_learning": False,
}
STAGE_ASSUMPTIONS = {
    "L0_ANALYTICAL": {"fee_bps": 0.0, "spread_bps": 0.0, "latency_ns": 0},
    "L1_VECTORBT": {"fee_bps": 0.0, "spread_bps": 0.0, "latency_ns": 0},
    "L2_NAUTILUS": {"fee_bps": 0.0, "spread_bps": 0.0, "latency_ns": 0},
    "L3_FEES_SLIPPAGE": {"fee_bps": 5.0, "spread_bps": 6.0, "latency_ns": 0},
    "L3_LATENCY": {"fee_bps": 5.0, "spread_bps": 6.0, "latency_ns": 2_500_000_000},
    "L4_COUNTERFACTUAL_STRESS": {"fee_bps": 5.0, "spread_bps": 20.0, "latency_ns": 2_500_000_000},
}
CHECKPOINT_LEVELS = {
    "L0_ANALYTICAL": "L0_MATHEMATICAL",
    "L1_VECTORBT": "L1_VECTORIZED",
    "L2_NAUTILUS": "L2_EVENT_REPLAY",
    "L3_FEES_SLIPPAGE": "L3_MICROSTRUCTURE",
    "L3_LATENCY": "L3_MICROSTRUCTURE",
    "L4_COUNTERFACTUAL_STRESS": "L4_COUNTERFACTUAL_STRESS",
}
CHECKPOINT_ENGINES = {
    "L0_ANALYTICAL": "analytical",
    "L1_VECTORBT": "vectorbt",
    "L2_NAUTILUS": "nautilus",
    "L3_FEES_SLIPPAGE": "nautilus",
    "L3_LATENCY": "nautilus",
    "L4_COUNTERFACTUAL_STRESS": "nautilus",
}


def _rounded(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("reality ladder metrics must be finite")
    return round(float(value), 12)


def _source_sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes().replace(b"\r\n", b"\n"))


def _mean(values: Iterable[float]) -> float:
    sequence = list(values)
    if not sequence:
        raise ValueError("cannot aggregate an empty metric sequence")
    return _rounded(statistics.fmean(sequence))


def deterministic_aggregate(value: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "checkpoint_metrics": [
            {"checkpoint": item["checkpoint"], "metrics": item["metrics"]}
            for item in value["checkpoints"]
        ],
        "regime_matrix": value["regime_matrix"],
        "alpha_survival_ratio": value["alpha_survival_ratio"],
        "decomposition": value["decomposition"],
    }


def generate_prices(regime: str, seed: int, *, stressed: bool = False) -> tuple[float, ...]:
    """Create a deterministic synthetic close series with no external data."""

    if regime not in REGIMES:
        raise ValueError(f"unknown regime {regime!r}")
    if seed not in SEEDS:
        raise ValueError(f"seed {seed} is outside the frozen grid")
    rng = random.Random(seed + REGIMES.index(regime) * 10_000)
    prices = [100.0]
    level = 100.0
    for index in range(1, POINTS):
        if regime == "TRENDING":
            drift = 0.0015 if index < 90 else (-0.0011 if index < 135 else 0.00135)
            level = prices[-1] * math.exp(drift + rng.gauss(0.0, 0.0014))
        elif regime == "MEAN_REVERTING":
            target = 100.0 + 4.5 * math.sin(index * 2.0 * math.pi / 64.0)
            level = prices[-1] + 0.24 * (target - prices[-1]) + rng.gauss(0.0, 0.22)
        else:
            block = (index // 36) % 4
            drift = (0.0021, -0.0017, 0.0016, -0.0012)[block]
            level = prices[-1] * math.exp(drift + rng.gauss(0.0, 0.0085))
        prices.append(max(5.0, level))

    if stressed:
        stress_rng = random.Random(seed + REGIMES.index(regime) * 10_000 + 900_001)
        stressed_prices = [prices[0]]
        shock_points = {58 + seed % 7, 119 + seed % 11, 181 + seed % 5}
        for index in range(1, POINTS):
            base_return = math.log(prices[index] / prices[index - 1])
            shock = -0.035 if index in shock_points else 0.0
            whipsaw = 0.018 * (-1 if (index // 18) % 2 else 1) if index % 18 == 0 else 0.0
            stressed_return = 1.55 * base_return + shock + whipsaw + stress_rng.gauss(0.0, 0.0025)
            stressed_prices.append(max(5.0, stressed_prices[-1] * math.exp(stressed_return)))
        prices = stressed_prices
    return tuple(round(value, 2) for value in prices)


def world_document(regime: str, seed: int, *, stressed: bool = False) -> dict[str, Any]:
    prices = generate_prices(regime, seed, stressed=stressed)
    timestamps = [BASE_NS + index * STEP_NS for index in range(len(prices))]
    payload = {
        "schema_version": "forge-deterministic-world/0.2.4.1",
        "regime": regime,
        "seed": seed,
        "counterfactual_stress": stressed,
        "timestamps_ns": timestamps,
        "prices": list(prices),
    }
    return {**payload, "world_hash": canonical_sha256(payload)}


def strategy_orders(world: Mapping[str, Any]) -> list[dict[str, Any]]:
    prices = [float(value) for value in world["prices"]]
    timestamps = [int(value) for value in world["timestamps_ns"]]
    fast = int(STRATEGY["fast_window"])
    slow = int(STRATEGY["slow_window"])
    quantity = int(STRATEGY["position_quantity"])
    target = 0
    orders: list[dict[str, Any]] = []
    for decision_index in range(slow - 1, len(prices) - 2):
        fast_mean = statistics.fmean(prices[decision_index - fast + 1 : decision_index + 1])
        slow_mean = statistics.fmean(prices[decision_index - slow + 1 : decision_index + 1])
        next_target = 1 if fast_mean > slow_mean else 0
        if next_target == target:
            continue
        submit_index = decision_index + 1
        side = "BUY" if next_target > target else "SELL"
        orders.append({
            "order_id": f"order-{len(orders) + 1:03d}",
            "side": side,
            "quantity": quantity,
            "signal_ns": timestamps[decision_index],
            "submitted_ns": timestamps[submit_index],
            "decision_index": decision_index,
            "submit_index": submit_index,
            "decision_price": prices[decision_index],
            "submission_mid": prices[submit_index],
            "time_in_force": "GTC",
        })
        target = next_target
    if target:
        decision_index = len(prices) - 2
        submit_index = len(prices) - 1
        orders.append({
            "order_id": f"order-{len(orders) + 1:03d}",
            "side": "SELL",
            "quantity": quantity,
            "signal_ns": timestamps[decision_index],
            "submitted_ns": timestamps[submit_index],
            "decision_index": decision_index,
            "submit_index": submit_index,
            "decision_price": prices[decision_index],
            "submission_mid": prices[submit_index],
            "time_in_force": "GTC",
        })
    return orders


def _book_prices(mid: float, spread_bps: float) -> tuple[float, float]:
    half = mid * spread_bps / 20_000.0
    bid = round(mid - half, 2)
    ask = round(mid + half, 2)
    if bid > ask:
        raise ValueError("invalid deterministic book")
    return bid, ask


def semantic_tape(world: Mapping[str, Any], orders: Sequence[Mapping[str, Any]], assumptions: Mapping[str, Any]) -> dict[str, Any]:
    spread_bps = float(assumptions["spread_bps"])
    prices = [float(value) for value in world["prices"]]
    timestamps = [int(value) for value in world["timestamps_ns"]]
    events = []
    for timestamp, mid in zip(timestamps, prices):
        bid, ask = _book_prices(mid, spread_bps)
        events.append({
            "type": "book",
            "event_ns": timestamp,
            "bids": [[bid, 1_000_000]],
            "asks": [[ask, 1_000_000]],
        })
    tape_orders = []
    for order in orders:
        if order["side"] == "BUY":
            limit = round(max(prices) * 2.0, 2)
        else:
            limit = 0.01
        tape_orders.append({
            "order_id": order["order_id"],
            "side": order["side"],
            "quantity": order["quantity"],
            "submitted_ns": order["submitted_ns"],
            "cancel_ns": None,
            "limit_price": limit,
            "time_in_force": order["time_in_force"],
        })
    tape = {
        "tape_id": "T01",
        "world_hash": world["world_hash"],
        "initial_cash": INITIAL_CASH,
        "fee_bps": float(assumptions["fee_bps"]),
        "latency_ns": int(assumptions["latency_ns"]),
        "orders": tape_orders,
        "events": events,
        "mark_price": prices[-1],
        "end_ns": timestamps[-1] + 10 * STEP_NS,
    }
    return {**tape, "tape_hash": canonical_sha256(tape)}


def analytical_fills(world: Mapping[str, Any], orders: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    prices = [float(value) for value in world["prices"]]
    return [
        {
            "fill_id": f"analytical-{order['order_id']}",
            "order_id": order["order_id"],
            "side": order["side"],
            "quantity": float(order["quantity"]),
            "price": prices[int(order["submit_index"])],
            "fee": 0.0,
            "event_ns": int(order["submitted_ns"]),
        }
        for order in orders
    ]


def calculate_metrics(
    world: Mapping[str, Any],
    orders: Sequence[Mapping[str, Any]],
    fills: Sequence[Mapping[str, Any]],
    *,
    assumptions: Mapping[str, Any],
) -> dict[str, float | int]:
    timestamps = [int(value) for value in world["timestamps_ns"]]
    prices = [float(value) for value in world["prices"]]
    pending = sorted((dict(fill) for fill in fills), key=lambda item: (int(item["event_ns"]), str(item["fill_id"])))
    cash_gross = INITIAL_CASH
    cash_net = INITIAL_CASH
    position = 0.0
    gross_equity: list[float] = []
    net_equity: list[float] = []
    cursor = 0
    for timestamp, mid in zip(timestamps, prices):
        while cursor < len(pending) and int(pending[cursor]["event_ns"]) <= timestamp:
            fill = pending[cursor]
            direction = 1.0 if fill["side"] == "BUY" else -1.0
            quantity = float(fill["quantity"])
            notional = float(fill["price"]) * quantity
            position += direction * quantity
            cash_gross -= direction * notional
            cash_net -= direction * notional + float(fill["fee"])
            cursor += 1
        gross_equity.append(cash_gross + position * mid)
        net_equity.append(cash_net + position * mid)
    while cursor < len(pending):
        fill = pending[cursor]
        direction = 1.0 if fill["side"] == "BUY" else -1.0
        quantity = float(fill["quantity"])
        notional = float(fill["price"]) * quantity
        position += direction * quantity
        cash_gross -= direction * notional
        cash_net -= direction * notional + float(fill["fee"])
        cursor += 1
    gross_equity[-1] = cash_gross + position * prices[-1]
    net_equity[-1] = cash_net + position * prices[-1]

    returns = [net_equity[index] / net_equity[index - 1] - 1.0 for index in range(1, len(net_equity))]
    volatility = statistics.pstdev(returns)
    sharpe = 0.0 if math.isclose(volatility, 0.0, abs_tol=1e-18) else statistics.fmean(returns) / volatility * math.sqrt(252.0)
    peak = net_equity[0]
    max_drawdown = 0.0
    for value in net_equity:
        peak = max(peak, value)
        max_drawdown = max(max_drawdown, 1.0 - value / peak)

    order_by_id = {str(order["order_id"]): order for order in orders}
    fees = sum(float(fill["fee"]) for fill in fills)
    slippage = 0.0
    latency_cost = 0.0
    filled_orders: set[str] = set()
    for fill in fills:
        order = order_by_id[str(fill["order_id"])]
        sign = 1.0 if fill["side"] == "BUY" else -1.0
        quantity = float(fill["quantity"])
        fill_price = float(fill["price"])
        submission_mid = float(order["submission_mid"])
        slippage += sign * (fill_price - submission_mid) * quantity
        bid, ask = _book_prices(submission_mid, float(assumptions["spread_bps"]))
        immediate_price = ask if sign > 0 else bid
        latency_cost += sign * (fill_price - immediate_price) * quantity
        filled_orders.add(str(fill["order_id"]))
    turnover = sum(abs(float(fill["quantity"]) * float(fill["price"])) for fill in fills) / INITIAL_CASH
    order_count = len(orders)
    return {
        "gross_return": _rounded((gross_equity[-1] - INITIAL_CASH) / INITIAL_CASH),
        "net_return": _rounded((net_equity[-1] - INITIAL_CASH) / INITIAL_CASH),
        "sharpe": _rounded(sharpe),
        "max_drawdown": _rounded(max_drawdown),
        "turnover": _rounded(turnover),
        "orders": order_count,
        "fills": len(fills),
        "fill_ratio": _rounded(len(filled_orders) / order_count if order_count else 1.0),
        "fees": _rounded(fees),
        "slippage": _rounded(slippage),
        "latency_cost": _rounded(latency_cost),
    }
