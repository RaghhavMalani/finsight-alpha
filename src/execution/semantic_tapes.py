"""Forge-owned semantic fixtures and independent accounting; never imported by workers.

Expected executions are authored as fixture data, not learned from simulator output.
The wire representation deliberately omits them. Host grading reconstructs cash,
position, fees, equity, and average-cost realized/unrealized PnL from native fills.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isclose, isfinite
from typing import Any, Mapping, Sequence

from src.eval.canonical import canonical_sha256

NS = 1_000_000_000
ACCOUNT_FIELDS = ("ending_cash", "position", "total_fees", "equity")


@dataclass(frozen=True)
class SemanticTape:
    tape_id: str
    name: str
    capabilities: tuple[str, ...]
    orders: tuple[Mapping[str, Any], ...]
    events: tuple[Mapping[str, Any], ...]
    expected_executions: tuple[tuple[str, str, float, float, int], ...]
    mark_price: float = 100.5
    initial_cash: float = 10_000.0
    fee_bps: float = 0.0
    latency_ns: int = 0
    end_ns: int = 10 * NS

    def to_dict(self) -> dict[str, Any]:
        return {"tape_id": self.tape_id, "name": self.name,
                "capabilities": list(self.capabilities),
                "orders": [dict(x) for x in self.orders],
                "events": [dict(x) for x in self.events],
                "mark_price": self.mark_price, "initial_cash": self.initial_cash,
                "fee_bps": self.fee_bps, "latency_ns": self.latency_ns, "end_ns": self.end_ns}

    @property
    def tape_hash(self) -> str:
        return canonical_sha256(self.to_dict())


def _order(side="BUY", quantity=2.0, price=101.0, time=2, cancel=None, oid="o1", tif="GTC"):
    return {"order_id": oid, "side": side, "quantity": float(quantity),
            "limit_price": float(price), "submitted_ns": time * NS,
            "cancel_ns": None if cancel is None else cancel * NS, "time_in_force": tif}


def _book(time=1, bid=100.0, ask=101.0, bid_qty=5.0, ask_qty=5.0):
    return {"type": "book", "event_ns": time * NS,
            "bids": [[float(bid), float(bid_qty)]], "asks": [[float(ask), float(ask_qty)]]}


def _trade(time, quantity):
    return {"type": "trade", "event_ns": time * NS, "side": "SELL", "price": 100.0, "quantity": float(quantity)}


SEMANTIC_TAPES = (
    SemanticTape("T01", "immediate limit fill", ("immediate_limit",), (_order(),), (_book(),), (("o1", "BUY", 2.0, 101.0, 2 * NS),)),
    SemanticTape("T02", "no-cross no-fill", ("immediate_limit",), (_order(price=100),), (_book(),), ()),
    SemanticTape("T03", "IOC liquidity constrained partial fill", ("l2_partial",), (_order(quantity=3, tif="IOC"),), (_book(ask_qty=1),), (("o1", "BUY", 1.0, 101.0, 2 * NS),)),
    SemanticTape("T04", "multi-level sweep", ("l2_sweep",), (_order(quantity=3, price=102),), ({"type": "book", "event_ns": NS, "bids": [[100.0, 5.0]], "asks": [[101.0, 1.0], [102.0, 2.0]]},), (("o1", "BUY", 1.0, 101.0, 2 * NS), ("o1", "BUY", 2.0, 102.0, 2 * NS))),
    SemanticTape("T05", "cancellation before trade", ("cancel",), (_order(price=100, cancel=3),), (_book(), _trade(4, 10)), ()),
    SemanticTape("T06", "cancellation after fill race", ("cancel",), (_order(cancel=3),), (_book(),), (("o1", "BUY", 2.0, 101.0, 2 * NS),)),
    SemanticTape("T07", "deterministic fee accounting", ("immediate_limit", "fees"), (_order(quantity=4, price=100),), (_book(bid=99, ask=100, ask_qty=10),), (("o1", "BUY", 4.0, 100.0, 2 * NS),), mark_price=99.5, fee_bps=25.0),
    SemanticTape("T08", "realized and unrealized PnL reconciliation", ("immediate_limit", "accounting"), (_order(quantity=2, price=100), _order("SELL", 1, 110, 4, oid="o2")), (_book(bid=99, ask=100), _book(3, 110, 111), _book(6, 111, 113)), (("o1", "BUY", 2.0, 100.0, 2 * NS), ("o2", "SELL", 1.0, 110.0, 4 * NS)), mark_price=112.0),
    SemanticTape("T09", "position reversal", ("immediate_limit", "shorting", "accounting"), (_order(quantity=2, price=100), _order("SELL", 3, 110, 4, oid="o2")), (_book(bid=99, ask=100), _book(3, 110, 111), _book(6, 107, 109)), (("o1", "BUY", 2.0, 100.0, 2 * NS), ("o2", "SELL", 3.0, 110.0, 4 * NS)), mark_price=108.0),
    SemanticTape("T10", "latency miss", ("latency",), (_order(quantity=1),), (_book(), _book(3, 102, 103)), (), mark_price=102.5, latency_ns=2 * NS),
    SemanticTape("T11", "queue-ahead no-fill", ("queue",), (_order(quantity=3, price=100),), (_book(), _trade(3, 4)), ()),
    SemanticTape("T12", "queue depletion partial and full fill", ("queue", "passive_partial"), (_order(quantity=3, price=100),), (_book(), _trade(3, 6), _trade(4, 2)), (("o1", "BUY", 1.0, 100.0, 3 * NS), ("o1", "BUY", 2.0, 100.0, 4 * NS))),
)

# This manifest is a product capability claim, not something workers may select
# after seeing whether a tape passes. Engine bugs remain supported-case failures.
ENGINE_SUPPORTED_TAPES = {
    "vectorbt": ("T01", "T02", "T07", "T08", "T09"),
    "nautilus": tuple(f"T{i:02}" for i in range(1, 11)),
    "hftbacktest": tuple(f"T{i:02}" for i in range(1, 13)),
    "legacy-hft": ("T02", "T11", "T12"),
}


def semantic_request(tapes: Sequence[SemanticTape] = SEMANTIC_TAPES) -> dict[str, Any]:
    request = {"schema_version": "forge-semantic-request/0.2.4", "tapes": [dict(t.to_dict(), tape_hash=t.tape_hash) for t in tapes]}
    return dict(request, request_hash=canonical_sha256(request))


def accounting_from_fills(tape: SemanticTape, fills: Sequence[Mapping[str, Any]]) -> dict[str, float]:
    cash, position, fees, average, realized = tape.initial_cash, 0.0, 0.0, 0.0, 0.0
    for fill in fills:
        quantity, price, fee = float(fill["quantity"]), float(fill["price"]), float(fill["fee"])
        delta = quantity if fill["side"] == "BUY" else -quantity
        cash -= delta * price + fee
        fees += fee
        if position == 0 or position * delta > 0:
            average = (abs(position) * average + quantity * price) / (abs(position) + quantity)
        else:
            closed = min(abs(position), quantity)
            realized += closed * (price - average) * (1 if position > 0 else -1)
            if quantity > abs(position):
                average = price
            elif quantity == abs(position):
                average = 0.0
        position += delta
    unrealized = position * (tape.mark_price - average)
    return {"ending_cash": cash, "position": position, "total_fees": fees,
            "equity": cash + position * tape.mark_price,
            "realized_pnl": realized, "unrealized_pnl": unrealized,
            "net_pnl": realized + unrealized - fees}


def independent_semantic_oracle(tape: SemanticTape) -> dict[str, Any]:
    fills = [{"fill_id": f"oracle-{i+1}", "order_id": oid, "side": side,
              "quantity": quantity, "price": price, "event_ns": ns,
              "fee": quantity * price * tape.fee_bps / 10_000.0}
             for i, (oid, side, quantity, price, ns) in enumerate(tape.expected_executions)]
    return {"fills": fills, "account": accounting_from_fills(tape, fills)}


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value)


def evaluate_semantic_result(tape: SemanticTape, result: Mapping[str, Any], *, engine: str | None = None) -> list[str]:
    """Fail closed on schema, causality, accounting, and the independent oracle.

    Return stable taxonomy codes so stress cases can assert the exact failure.
    Unsupported results have no fabricated fills or zero-valued accounts.
    """
    errors: list[str] = []
    if not isinstance(result, Mapping):
        return ["SCHEMA_INVALID"]
    if result.get("tape_id") != tape.tape_id or result.get("tape_hash") != tape.tape_hash:
        errors.append("REPLAY_MISMATCH")
    state = result.get("state")
    declared = engine is None or tape.tape_id in ENGINE_SUPPORTED_TAPES.get(engine, ())
    if state == "UNSUPPORTED":
        if (set(result) != {"tape_id", "tape_hash", "state", "reason"}
                or not isinstance(result.get("reason"), str)
                or not result["reason"].strip()):
            errors.append("SCHEMA_INVALID")
        if engine is not None and declared:
            errors.append("CAPABILITY_FALSE_CLAIM")
        return list(dict.fromkeys(errors))
    if state != "SUPPORTED":
        return list(dict.fromkeys(errors + ["SCHEMA_INVALID"]))
    required = {"tape_id", "tape_hash", "state", "fills", "account", "native_evidence"}
    if not required.issubset(result) or set(result) - required - {"unsupported_metrics"}:
        errors.append("SCHEMA_INVALID")
    if not declared:
        errors.append("CAPABILITY_FALSE_CLAIM")
    if not isinstance(result.get("native_evidence"), Mapping) or not result["native_evidence"]:
        errors.append("PROVENANCE_MISSING")
    fills, account = result.get("fills"), result.get("account")
    if not isinstance(fills, list) or not isinstance(account, Mapping):
        return list(dict.fromkeys(errors + ["SCHEMA_INVALID"]))
    if any(not _number(account.get(k)) for k in ACCOUNT_FIELDS):
        errors.append("SCHEMA_INVALID")
    for key in ("realized_pnl", "unrealized_pnl", "net_pnl"):
        if key in account and not _number(account[key]):
            errors.append("SCHEMA_INVALID")
    orders = {str(o["order_id"]): o for o in tape.orders}
    seen, totals, previous = set(), {}, -1
    valid = True
    for fill in fills:
        if not isinstance(fill, Mapping) or any(not _number(fill.get(k)) for k in ("quantity", "price", "fee", "event_ns")) or not isinstance(fill.get("fill_id"), str) or not fill["fill_id"] or fill.get("side") not in ("BUY", "SELL"):
            errors.append("SCHEMA_INVALID")
            valid = False
            continue
        oid = fill.get("order_id")
        if oid not in orders or fill["fill_id"] in seen or fill["quantity"] <= 0 or fill["price"] <= 0:
            errors.append("FILL_IMPOSSIBLE")
        seen.add(fill["fill_id"])
        if fill["fee"] < 0:
            errors.append("ACCOUNTING_MISMATCH")
        if fill["event_ns"] < previous or int(fill["event_ns"]) != fill["event_ns"]:
            errors.append("TIMESTAMP_CAUSALITY_FAILURE")
        previous = fill["event_ns"]
        if oid in orders:
            order = orders[oid]
            totals[oid] = totals.get(oid, 0.0) + fill["quantity"]
            if totals[oid] > order["quantity"] + 1e-9 or fill["side"] != order["side"] or (fill["side"] == "BUY" and fill["price"] > order["limit_price"] + 1e-9) or (fill["side"] == "SELL" and fill["price"] < order["limit_price"] - 1e-9):
                errors.append("FILL_IMPOSSIBLE")
            cancel = order["cancel_ns"]
            if fill["event_ns"] < order["submitted_ns"] + tape.latency_ns or fill["event_ns"] > tape.end_ns or (cancel is not None and fill["event_ns"] > cancel + tape.latency_ns):
                errors.append("TIMESTAMP_CAUSALITY_FAILURE")
        if not isclose(fill["fee"], fill["price"] * fill["quantity"] * tape.fee_bps / 10_000, abs_tol=1e-8, rel_tol=1e-9):
            errors.append("ACCOUNTING_MISMATCH")
    if valid:
        reconstructed = accounting_from_fills(tape, fills)
        expected = independent_semantic_oracle(tape)
        for key in ACCOUNT_FIELDS + ("realized_pnl", "unrealized_pnl", "net_pnl"):
            if key in account and _number(account[key]) and not isclose(float(account[key]), reconstructed[key], abs_tol=1e-7, rel_tol=1e-9):
                errors.append("ACCOUNTING_MISMATCH")
        # Coalesce same-order/price/time fills only: engine split IDs have no semantics.
        def grouped(items):
            groups = {}
            for fill in items:
                key = (fill["order_id"], fill["side"], fill["price"], fill["event_ns"])
                groups[key] = groups.get(key, 0.0) + fill["quantity"]
            return groups
        actual_groups, expected_groups = grouped(fills), grouped(expected["fills"])
        if actual_groups.keys() != expected_groups.keys() or any(not isclose(actual_groups[k], expected_groups[k], abs_tol=1e-8) for k in actual_groups.keys() & expected_groups.keys()):
            errors.append("FILL_IMPOSSIBLE")
        for key in ACCOUNT_FIELDS:
            if _number(account.get(key)) and not isclose(float(account[key]), expected["account"][key], abs_tol=1e-7, rel_tol=1e-9):
                errors.append("ACCOUNTING_MISMATCH")
    return list(dict.fromkeys(errors))
