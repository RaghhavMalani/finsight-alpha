"""Independent accounting, event lineage, and temporal result invariants."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import math

from src.execution.events import CanonicalEventType
from src.execution.failures import FailureCode


@dataclass(frozen=True)
class InvariantCheck:
    code: str
    passed: bool
    message: str
    failure_code: FailureCode = FailureCode.SCHEMA_INVALID


def verify_execution_invariants(result: object, *, tolerance: float = 1e-9) -> tuple[InvariantCheck, ...]:
    orders = {order.order_id: order for order in result.orders}
    quantities: dict[str, float] = defaultdict(float)
    positions: dict[str, float] = defaultdict(float)
    cash = float(result.account.initial_cash)
    checks: list[InvariantCheck] = []
    temporal = FailureCode.TIMESTAMP_CAUSALITY_FAILURE
    impossible = FailureCode.FILL_IMPOSSIBLE
    accounting = FailureCode.ACCOUNTING_MISMATCH

    def check(code: str, passed: object, message: str, category: FailureCode) -> None:
        checks.append(InvariantCheck(code, bool(passed), message, category))

    for stream_name, stream in (("fill", result.fills), ("native", result.native_events), ("canonical", result.canonical_events)):
        timestamps = [item.event_ns for item in stream]
        check(f"{stream_name}.monotonic_timestamps", timestamps == sorted(timestamps), stream_name, temporal)
    for order in result.orders:
        check("order.submit_not_before_signal", order.submitted_ns >= order.signal_ns, order.order_id, temporal)
    for fill in result.fills:
        order = orders.get(fill.order_id)
        check("fill.order_exists", order is not None, fill.fill_id, impossible)
        if order is None:
            continue
        quantities[fill.order_id] += fill.quantity
        check("fill.not_before_submit", fill.event_ns >= order.submitted_ns, fill.fill_id, temporal)
        check("fill.side_symbol", fill.side == order.side and fill.symbol == order.symbol, fill.fill_id, impossible)
        check("fill.positive", math.isfinite(fill.quantity) and fill.quantity > 0 and math.isfinite(fill.price) and fill.price > 0, fill.fill_id, impossible)
        check("fill.fee_sign", math.isfinite(fill.fee) and fill.fee >= 0, fill.fill_id, accounting)
        if order.limit_price is not None:
            within_limit = fill.price <= order.limit_price + tolerance if fill.side == "BUY" else fill.price >= order.limit_price - tolerance
            check("fill.limit_price", within_limit, fill.fill_id, impossible)
        signed = fill.quantity if fill.side == "BUY" else -fill.quantity
        positions[fill.symbol] += signed
        cash -= signed * fill.price + fill.fee
    for order_id, filled in quantities.items():
        check("fill.quantity_bounded", filled <= orders[order_id].quantity + tolerance, order_id, impossible)
    symbols = set(positions) | set(result.account.positions)
    check("account.positions_from_fills", all(math.isclose(positions[s], float(result.account.positions.get(s, 0.0)), rel_tol=tolerance, abs_tol=tolerance) for s in symbols), "position reconciliation", accounting)
    check("account.cash_from_fills", math.isclose(cash, result.account.ending_cash, rel_tol=tolerance, abs_tol=tolerance), "cash reconciliation", accounting)
    check("native.engine_binding", all(event.engine == result.provenance.engine_id for event in result.native_events), "native stream belongs to the configured engine", FailureCode.ENGINE_DRIFT)
    native = {event.native_event_hash: event for event in result.native_events}
    fill_map = {fill.fill_id: fill for fill in result.fills}
    event_by_order: dict[str, list[object]] = defaultdict(list)
    seen_fill_events: set[str] = set()
    event_ids = [event.event_id for event in result.canonical_events]
    check("event.unique_ids", len(event_ids) == len(set(event_ids)), "unique event identifiers", impossible)
    for event in result.canonical_events:
        source = native.get(event.native_event_hash)
        check("event.native_lineage", source is not None and source.input_market_event_hash == event.input_market_event_hash, event.event_id, FailureCode.PROVENANCE_MISSING)
        check("event.native_engine", source is not None and source.engine == result.provenance.engine_id, event.event_id, FailureCode.ENGINE_DRIFT)
        check("event.native_time", source is not None and event.event_ns >= source.event_ns, event.event_id, temporal)
        if event.order_id:
            event_by_order[event.order_id].append(event)
        if event.event_type in {CanonicalEventType.PARTIAL_FILL, CanonicalEventType.FULL_FILL}:
            fill = fill_map.get(event.fill_id)
            check("event.fill_projection", fill is not None and event.order_id == fill.order_id and event.event_ns == fill.event_ns and event.quantity == fill.quantity and event.price == fill.price, event.event_id, impossible)
            check("event.unique_fill_projection", event.fill_id not in seen_fill_events, event.event_id, impossible)
            seen_fill_events.add(event.fill_id)
    check("event.fill_coverage", seen_fill_events == set(fill_map), "every fill has one canonical projection", FailureCode.PROVENANCE_MISSING)
    for order_id, events in event_by_order.items():
        submitted = [event.event_ns for event in events if event.event_type is CanonicalEventType.ORDER_SUBMITTED]
        accepted = [event.event_ns for event in events if event.event_type is CanonicalEventType.ORDER_ACCEPTED]
        fallback = orders[order_id].submitted_ns if order_id in orders else None
        submit_ns = min(submitted) if submitted else fallback
        check("order.accept_not_before_submit", not accepted or (submit_ns is not None and min(accepted) >= submit_ns), order_id, temporal)
        canceled = [event.event_ns for event in events if event.event_type is CanonicalEventType.ORDER_CANCELED]
        if canceled:
            check("cancel.valid_prior_order", submit_ns is not None and min(canceled) >= submit_ns, order_id, temporal)
            # A cancellation strictly earlier than a fill forbids that fill.
            # A cancellation after a fill preserves the already executed trade.
            fills = [fill for fill in result.fills if fill.order_id == order_id]
            check("cancel.no_fill_after_cancellation", all(fill.event_ns <= min(canceled) for fill in fills), order_id, temporal)
            cancellation_seen = False
            for event in events:
                if event.event_type is CanonicalEventType.ORDER_CANCELED:
                    cancellation_seen = True
                elif event.event_type in {CanonicalEventType.PARTIAL_FILL, CanonicalEventType.FULL_FILL}:
                    check("cancel.stream_order", not cancellation_seen, event.event_id, temporal)
    return tuple(checks)
