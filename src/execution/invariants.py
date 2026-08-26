"""Independent accounting and temporal invariants for normalized results."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from src.execution.events import CanonicalEventType


@dataclass(frozen=True)
class InvariantCheck:
    code: str
    passed: bool
    message: str


def verify_execution_invariants(result: object, *, tolerance: float = 1e-9) -> tuple[InvariantCheck, ...]:
    orders = {order.order_id: order for order in result.orders}
    quantities: dict[str, float] = defaultdict(float)
    positions: dict[str, float] = defaultdict(float)
    cash = float(result.account.initial_cash)
    checks: list[InvariantCheck] = []
    for fill in result.fills:
        order = orders.get(fill.order_id)
        valid_order = order is not None
        checks.append(InvariantCheck("fill.order_exists", valid_order, fill.fill_id))
        if not valid_order:
            continue
        quantities[fill.order_id] += fill.quantity
        checks.append(InvariantCheck("fill.not_before_submit", fill.event_ns >= order.submitted_ns, fill.fill_id))
        signed = fill.quantity if fill.side == "BUY" else -fill.quantity
        positions[fill.symbol] += signed
        cash += (-fill.price * fill.quantity if fill.side == "BUY" else fill.price * fill.quantity) - fill.fee
    for order_id, filled in quantities.items():
        checks.append(InvariantCheck("fill.quantity_bounded", filled <= orders[order_id].quantity + tolerance, order_id))
    symbols = set(positions) | set(result.account.positions)
    checks.append(InvariantCheck("account.positions_from_fills", all(abs(positions[s] - float(result.account.positions.get(s, 0.0))) <= tolerance for s in symbols), "position reconciliation"))
    checks.append(InvariantCheck("account.cash_from_fills", abs(cash - result.account.ending_cash) <= tolerance, "cash reconciliation"))
    event_by_order: dict[str, list[object]] = defaultdict(list)
    for event in result.canonical_events:
        if event.order_id:
            event_by_order[event.order_id].append(event)
    for order_id, events in event_by_order.items():
        submitted = [event.event_ns for event in events if event.event_type is CanonicalEventType.ORDER_SUBMITTED]
        accepted = [event.event_ns for event in events if event.event_type is CanonicalEventType.ORDER_ACCEPTED]
        checks.append(InvariantCheck("order.accept_not_before_submit", not accepted or (submitted and min(accepted) >= min(submitted)), order_id))
        canceled = [event.event_ns for event in events if event.event_type is CanonicalEventType.ORDER_CANCELED]
        fills = [event for event in events if event.event_type in {CanonicalEventType.PARTIAL_FILL, CanonicalEventType.FULL_FILL}]
        checks.append(InvariantCheck("cancel.preserves_prior_fill", not canceled or all(event.event_ns >= min(submitted or [0]) for event in fills), order_id))
    return tuple(checks)

