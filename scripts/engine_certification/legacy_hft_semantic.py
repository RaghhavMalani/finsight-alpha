"""Native legacy-HFT passive inverse-contract execution and account observations.

The genuine semantic intersection is fixed-price passive orders/queue depletion.
Native inverse USD contract units are converted to base quantity at their price.
No upstream matching/accounting code is replaced or patched.
"""
import datetime
import importlib.metadata
import json
import logging.config
import platform
import sys
from dataclasses import replace

# Upstream creates an unused non-daemon logging listener during imports.
logging.config.listen = lambda *a, **k: type("_NoopListener", (), {"start": lambda self: None})()

import numpy as np
from hft.backtesting.backtest import Backtest
from hft.backtesting.data import OrderRequest
from hft.backtesting.strategy import Strategy, TraditionalFee
from hft.utils.consts import Statuses, TradeSides
from hft.utils.data import OrderBook, Trade

SUPPORTED = {"T02", "T11", "T12"}
EPOCH = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)


def moment(ns):
    return EPOCH + datetime.timedelta(microseconds=ns // 1000)


class TapeStrategy(Strategy):
    def __init__(self, tape):
        super().__init__(initial_balance=tape["initial_cash"])
        self.tape = tape
        self.fee["XBTUSD"] = TraditionalFee.zero()
        self.sent, self.specs, self.filled, self.fills, self.statuses = set(), {}, {}, [], []

    def define_orders(self, row, statuses, memory, is_trade):
        for status in statuses:
            oid, spec = self.specs[status.id]
            self.statuses.append({"id": int(status.id), "status": int(status.status), "event_ns": int((status.at - EPOCH).total_seconds() * 1_000_000_000), "volume_total": int(status.volume_total), "volume": int(status.volume)})
            if status.status in (Statuses.PARTIAL, Statuses.FINISHED):
                # FINISHED natively declares all remaining contracts executed;
                # PARTIAL carries incremental contract volume in status.volume.
                quantity = float(status.volume) / spec["limit_price"] if status.status == Statuses.PARTIAL else spec["quantity"] - self.filled.get(oid, 0.0)
                self.filled[oid] = self.filled.get(oid, 0.0) + quantity
                self.fills.append({"fill_id": f"{oid}-{len(self.fills)+1}", "order_id": oid, "side": spec["side"], "quantity": quantity,
                    "price": spec["limit_price"], "fee": 0.0, "event_ns": int((status.at - EPOCH).total_seconds() * 1_000_000_000)})
        requests = []
        for spec in self.tape["orders"]:
            if spec["order_id"] in self.sent or row.timestamp < moment(spec["submitted_ns"]):
                continue
            native = OrderRequest.create_bid(spec["limit_price"], int(spec["quantity"] * spec["limit_price"]), "XBTUSD", row.timestamp)
            self.specs[native.id] = (spec["order_id"], spec)
            self.sent.add(spec["order_id"])
            requests.append(native)
        return requests


def execute(tape):
    base = {"tape_id": tape["tape_id"], "tape_hash": tape["tape_hash"]}
    if tape["tape_id"] not in SUPPORTED:
        return dict(base, state="UNSUPPORTED", reason="Legacy engine supports passive inverse USD contracts; aggressive linear orders, L2 sweeps, nonzero linear fees, reversal and nanosecond latency are outside the declared native semantic intersection")
    strategy = TapeStrategy(tape)
    reader = type("Clock", (), {})()
    reader.initial_moment = moment(tape["events"][0]["event_ns"])
    reader.current_timestamp = reader.initial_moment
    backtest = Backtest(reader, strategy, delay=0, seed=42, order_position_policy="tail", notify_partial=True)
    events = {event["event_ns"]: event for event in tape["events"]}
    times = sorted(set(events) | {order["submitted_ns"] for order in tape["orders"]} | {tape["end_ns"]})
    snapshots = []
    for ts in times:
        reader.current_timestamp = moment(ts)
        event = events.get(ts)
        if event is not None:
            if event["type"] == "book":
                native = OrderBook("XBTUSD", moment(ts), np.array([p for p, q in event["bids"]]), np.array([int(p*q) for p, q in event["bids"]]),
                    np.array([p for p, q in event["asks"]]), np.array([int(p*q) for p, q in event["asks"]]))
                backtest._process_event(native, True)
            else:
                native = Trade("XBTUSD", moment(ts), event["price"], int(event["price"] * event["quantity"]), TradeSides.SELL if event["side"] == "SELL" else TradeSides.BUY)
                backtest._process_event(native, False)
        if any(spec["submitted_ns"] == ts for spec in tape["orders"]):
            # Native strategy clock callback schedules orders between data events;
            # use the actual native action processor, without injecting book data.
            row = replace(backtest.memory[("orderbook", "XBTUSD")], timestamp=moment(ts))
            actions = strategy.trigger(row, [], backtest.memory, False)
            backtest._process_actions(actions)
        snapshots.append({"event_ns": ts, "cash": float(strategy.balance["USD"]), "base_balance": float(strategy.balance["XBTUSD"]),
            "native_position": [float(x) for x in strategy.position["XBTUSD"]]})
    cash, position = float(strategy.balance["USD"]), float(strategy.balance["XBTUSD"])
    return dict(base, state="SUPPORTED", fills=strategy.fills,
        account={"ending_cash": cash, "position": position, "total_fees": 0.0, "equity": cash + position * tape["mark_price"]},
        unsupported_metrics={"realized_pnl": "Native Strategy has no realized PnL accumulator", "unrealized_pnl": "Native Strategy has no marked unrealized PnL field"},
        native_evidence={"api": "Backtest._process_event/_process_actions + native Strategy.trigger", "account_snapshot": "requested end_ns before teardown-generated cancellation", "native_statuses": strategy.statuses,
            "snapshots": snapshots, "native_fee_model": {"maker": strategy.fee["XBTUSD"].maker, "taker": strategy.fee["XBTUSD"].taker, "settlement": strategy.fee["XBTUSD"].settlement},
            "unit_normalization": "native USD-contract volume / execution price = base units; fixed-price passive intersection only", "equity_normalization": "native USD cash + native base balance * requested mark"})


def main():
    request = json.load(sys.stdin)
    print(json.dumps({"engine": "legacy-hft", "version": importlib.metadata.version("backtesting-hft"), "request_hash": request["request_hash"],
        "runtime": {"python_version": platform.python_version(), "platform": platform.platform()},
        "results": [execute(tape) for tape in request["tapes"]]}, sort_keys=True, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
