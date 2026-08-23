"""Deterministic protocol-conformance worker used by tests, never as market truth."""

from __future__ import annotations

import platform
from collections import defaultdict
from typing import Any

from src.eval.canonical import canonical_sha256
from src.execution.contracts import (
    CANONICAL_METRICS,
    AccountState,
    CanonicalFill,
    CanonicalOrder,
    EngineProvenance,
    EpistemicValue,
    MeasurementState,
    SimulationOutcome,
    SimulationRequest,
    SimulationResult,
)
from src.execution.workers.protocol import serve


ENGINE_ID = "conformance-reference"
LICENSE = "LicenseRef-FinSight-Project"
WORKER_HASH = canonical_sha256({"worker": ENGINE_ID, "protocol": 1})


def _numeric_assumption(request: SimulationRequest, name: str, default: float) -> float:
    value = getattr(request.execution, name)
    if value.state is MeasurementState.MEASURED and type(value.value) in {int, float}:
        return float(value.value)
    return default


def _absence(state: MeasurementState, reason: str) -> EpistemicValue:
    return EpistemicValue.absent(state, reason)


def run_reference(request: SimulationRequest) -> SimulationOutcome:
    """Run a deliberately small book-crossing model for contract conformance."""

    inputs = dict(request.inputs)
    raw_orders = inputs.get("orders", [])
    events = sorted(inputs.get("market_events", []), key=lambda item: int(item["event_ns"]))
    initial_cash = float(inputs.get("initial_cash", 100_000.0))
    fee_bps = _numeric_assumption(request, "fees", 0.0)
    latency_ms = _numeric_assumption(request, "latency_model", 0.0)
    slippage_bps = _numeric_assumption(request, "slippage_model", 0.0)
    queue_model = request.execution.queue_model

    orders = tuple(CanonicalOrder.from_dict(item) for item in raw_orders)
    fills: list[CanonicalFill] = []
    cash = initial_cash
    positions: dict[str, float] = defaultdict(float)
    turnover = fees = slippage = 0.0

    for order in orders:
        eligible_ns = order.submitted_ns + int(latency_ms * 1_000_000)
        event = next(
            (
                item for item in events
                if item.get("symbol") == order.symbol and int(item["event_ns"]) >= eligible_ns
            ),
            None,
        )
        if event is None:
            continue
        is_buy = order.side == "BUY"
        base_price = float(event["ask"] if is_buy else event["bid"])
        book_quantity = float(event["ask_size"] if is_buy else event["bid_size"])
        queue_ahead = float(event.get("queue_ahead", 0.0))
        if queue_model.state is MeasurementState.MEASURED:
            executable = max(0.0, book_quantity - queue_ahead)
            queue_observation = EpistemicValue.measured(queue_ahead, "quantity")
        else:
            executable = book_quantity
            queue_observation = _absence(queue_model.state, queue_model.reason or "queue model absent")
        quantity = min(order.quantity, executable)
        if quantity <= 0:
            continue
        price = base_price * (1.0 + slippage_bps / 10_000.0 * (1 if is_buy else -1))
        if order.limit_price is not None:
            if (is_buy and price > order.limit_price) or (not is_buy and price < order.limit_price):
                continue
        notional = price * quantity
        fee = notional * fee_bps / 10_000.0
        cash += (-notional if is_buy else notional) - fee
        positions[order.symbol] += quantity if is_buy else -quantity
        turnover += notional
        fees += fee
        slippage += abs(price - base_price) * quantity
        fills.append(
            CanonicalFill(
                fill_id=f"fill-{order.order_id}", order_id=order.order_id,
                symbol=order.symbol, side=order.side, quantity=quantity,
                price=price, fee=fee, event_ns=int(event["event_ns"]),
                latency_ns=EpistemicValue.measured(int(event["event_ns"]) - order.submitted_ns, "ns"),
                queue_ahead_quantity=queue_observation,
                available_quantity=EpistemicValue.measured(book_quantity, "quantity"),
            )
        )

    marks: dict[str, float] = {}
    for event in events:
        marks[str(event["symbol"])] = float(event.get("mark_price", (float(event["bid"]) + float(event["ask"])) / 2.0))
    equity = cash + sum(quantity * marks.get(symbol, 0.0) for symbol, quantity in positions.items())
    requested_quantity = sum(order.quantity for order in orders)
    filled_quantity = sum(fill.quantity for fill in fills)
    strategy_metrics = dict(inputs.get("strategy_metrics", {}))
    metrics = {
        "pnl": EpistemicValue.measured(equity - initial_cash, "currency"),
        "turnover": EpistemicValue.measured(turnover, "currency"),
        "fees": EpistemicValue.measured(fees, "currency"),
        "slippage": EpistemicValue.measured(slippage, "currency"),
        "max_drawdown": (
            EpistemicValue.measured(float(strategy_metrics["max_drawdown"]), "ratio")
            if "max_drawdown" in strategy_metrics
            else _absence(MeasurementState.NOT_MEASURED, "reference worker does not derive an equity curve")
        ),
        "fill_rate": EpistemicValue.measured(filled_quantity / requested_quantity if requested_quantity else 0.0, "ratio"),
        "queue_position": (
            EpistemicValue.measured(
                sum(float(fill.queue_ahead_quantity.value) for fill in fills) / len(fills), "quantity"
            )
            if fills and all(fill.queue_ahead_quantity.state is MeasurementState.MEASURED for fill in fills)
            else _absence(MeasurementState.UNSUPPORTED, "queue position was not measured for every fill")
        ),
        "latency_ms": EpistemicValue.measured(latency_ms, "ms"),
        "sharpe": (
            EpistemicValue.measured(float(strategy_metrics["sharpe"]), "ratio")
            if "sharpe" in strategy_metrics
            else _absence(MeasurementState.NOT_MEASURED, "reference worker does not estimate Sharpe")
        ),
    }
    assert set(metrics) == set(CANONICAL_METRICS)
    provenance = EngineProvenance(
        engine_id=ENGINE_ID, engine_version="1.0.0", engine_commit=WORKER_HASH,
        adapter_version="0.2.3", runtime=f"Python {platform.python_version()}",
        rust_version=_absence(MeasurementState.UNSUPPORTED, "reference worker is Python-only"),
        dependency_lock_hash=request.core_lock_hash, worker_hash=WORKER_HASH,
        license_spdx=LICENSE,
    )
    result = SimulationResult(
        provenance=provenance, request_hash=request.request_hash,
        world_hash=request.world_hash, strategy_hash=request.strategy_hash,
        dataset_hash=request.dataset_hash, assumptions_hash=request.execution.assumptions_hash,
        seed=request.seed, orders=orders, fills=tuple(fills),
        account=AccountState(initial_cash, cash, dict(positions)), metrics=metrics,
        runtime_ms=0.0,
    )
    return SimulationOutcome(ENGINE_ID, request.request_hash, MeasurementState.MEASURED, result=result)


def main() -> int:
    return serve(ENGINE_ID, run_reference)


if __name__ == "__main__":
    raise SystemExit(main())
