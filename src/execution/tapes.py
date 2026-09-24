"""Seven tiny deterministic tapes and an engine-independent expected-value oracle."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from src.eval.canonical import canonical_sha256


@dataclass(frozen=True)
class SyntheticTape:
    tape_id: str
    capabilities: frozenset[str]
    order: Mapping[str, Any]
    events: tuple[Mapping[str, Any], ...]
    initial_cash: float = 10_000.0
    fee_bps: float = 0.0
    latency_ns: int = 0

    @property
    def tape_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    def to_dict(self) -> dict[str, Any]:
        return {"tape_id": self.tape_id, "capabilities": sorted(self.capabilities), "order": dict(self.order), "events": [dict(event) for event in self.events], "initial_cash": self.initial_cash, "fee_bps": self.fee_bps, "latency_ns": self.latency_ns}


@dataclass(frozen=True)
class OracleFill:
    event_ns: int
    quantity: float
    price: float
    fee: float


@dataclass(frozen=True)
class OracleResult:
    fills: tuple[OracleFill, ...]
    ending_cash: float
    position: float
    total_fees: float

    @property
    def oracle_hash(self) -> str:
        return canonical_sha256({"fills": [fill.__dict__ for fill in self.fills], "ending_cash": self.ending_cash, "position": self.position, "total_fees": self.total_fees})


def independent_oracle(tape: SyntheticTape) -> OracleResult:
    """Simple price-time oracle that shares no adapter or engine implementation."""
    order = dict(tape.order)
    side = str(order["side"]).upper()
    remaining = float(order["quantity"])
    eligible = int(order["submitted_ns"]) + tape.latency_ns
    canceled = False
    fills: list[OracleFill] = []
    for event in sorted(enumerate(tape.events), key=lambda pair: (int(pair[1]["event_ns"]), pair[0])):
        item = event[1]
        if int(item["event_ns"]) < eligible:
            continue
        if item["type"] == "cancel":
            canceled = True
            continue
        if item["type"] != "book" or canceled or remaining <= 0:
            continue
        price = float(item["ask"] if side == "BUY" else item["bid"])
        limit = order.get("limit_price")
        if limit is not None and ((side == "BUY" and price > float(limit)) or (side == "SELL" and price < float(limit))):
            continue
        available = float(item["ask_size"] if side == "BUY" else item["bid_size"])
        executable = max(0.0, available - float(item.get("queue_ahead", 0.0)))
        quantity = min(remaining, executable)
        if quantity <= 0:
            continue
        fee = price * quantity * tape.fee_bps / 10_000.0
        fills.append(OracleFill(int(item["event_ns"]), quantity, price, fee))
        remaining -= quantity
    signed_notional = sum(fill.price * fill.quantity for fill in fills) * (1 if side == "BUY" else -1)
    position = sum(fill.quantity for fill in fills) * (1 if side == "BUY" else -1)
    fees = sum(fill.fee for fill in fills)
    return OracleResult(tuple(fills), tape.initial_cash - signed_notional - fees, position, fees)


def _order(quantity: float, *, submitted_ns: int = 10, limit_price: float | None = None) -> dict[str, Any]:
    return {"order_id": "o1", "symbol": "SYN", "side": "BUY", "order_type": "LIMIT" if limit_price is not None else "MARKET", "quantity": quantity, "signal_ns": 5, "submitted_ns": submitted_ns, "limit_price": limit_price}


SYNTHETIC_TAPES = (
    SyntheticTape("immediate_fill", frozenset({"market_order", "l2"}), _order(2), ({"type": "book", "event_ns": 10, "bid": 100, "ask": 101, "bid_size": 2, "ask_size": 2},)),
    SyntheticTape("partial_fill_101_102", frozenset({"partial_fills", "l2"}), _order(3), ({"type": "book", "event_ns": 11, "bid": 100, "ask": 101, "bid_size": 1, "ask_size": 1}, {"type": "book", "event_ns": 12, "bid": 101, "ask": 102, "bid_size": 2, "ask_size": 2})),
    SyntheticTape("latency_miss", frozenset({"latency", "limit_order"}), _order(1, limit_price=101), ({"type": "book", "event_ns": 12, "bid": 100, "ask": 101, "bid_size": 1, "ask_size": 1}, {"type": "book", "event_ns": 20, "bid": 102, "ask": 103, "bid_size": 1, "ask_size": 1}), latency_ns=5),
    SyntheticTape("queue_no_fill", frozenset({"queue", "l2"}), _order(1, limit_price=101), ({"type": "book", "event_ns": 11, "bid": 100, "ask": 101, "bid_size": 5, "ask_size": 5, "queue_ahead": 5},)),
    SyntheticTape("queue_exhausted_fill", frozenset({"queue", "l2"}), _order(1, limit_price=101), ({"type": "book", "event_ns": 11, "bid": 100, "ask": 101, "bid_size": 5, "ask_size": 5, "queue_ahead": 5}, {"type": "book", "event_ns": 12, "bid": 100, "ask": 101, "bid_size": 1, "ask_size": 1, "queue_ahead": 0})),
    SyntheticTape("cancel_race_fill_survives", frozenset({"cancel", "event_ordering"}), _order(1), ({"type": "book", "event_ns": 11, "bid": 100, "ask": 101, "bid_size": 1, "ask_size": 1}, {"type": "cancel", "event_ns": 11})),
    SyntheticTape("exact_fee_accounting", frozenset({"fixed_fees", "accounting"}), _order(4), ({"type": "book", "event_ns": 11, "bid": 99, "ask": 100, "bid_size": 4, "ask_size": 4},), fee_bps=25.0),
)


def tape_by_id(tape_id: str) -> SyntheticTape:
    try:
        return next(tape for tape in SYNTHETIC_TAPES if tape.tape_id == tape_id)
    except StopIteration as exc:
        raise KeyError(tape_id) from exc
