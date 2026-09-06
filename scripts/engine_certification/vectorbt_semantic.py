"""Native VectorBT bar-order engine; no host expected-value imports.

The order function is the adapter's explicitly declared immediate-limit rule.
L2 liquidity, resting queue, event cancellation and latency are unsupported.
"""
import hashlib
import json
import platform
import sys

import numpy as np
import pandas as pd
from numba import njit
import vectorbt as vbt
from vectorbt.portfolio import nb

SUPPORTED = {"T01", "T02", "T07", "T08", "T09"}


@njit
def order_function(c, quantities, limits, bids, asks, fee):
    size = quantities[c.i]
    price = asks[c.i] if size > 0 else bids[c.i]
    crosses = (size > 0 and price <= limits[c.i]) or (size < 0 and price >= limits[c.i])
    if size == 0 or not crosses:
        return nb.order_nothing_nb()
    return nb.order_nb(size=size, price=price, fees=fee)


def execute(tape):
    base = {"tape_id": tape["tape_id"], "tape_hash": tape["tape_hash"]}
    if tape["tape_id"] not in SUPPORTED:
        return dict(base, state="UNSUPPORTED", reason="VectorBT bar-order simulation has no native L2 liquidity, resting-order cancellation, latency, or queue model for this tape")
    timestamps = sorted({e["event_ns"] for e in tape["events"]} | {o["submitted_ns"] for o in tape["orders"]} | {tape["end_ns"]})
    orders = {o["submitted_ns"]: o for o in tape["orders"]}
    books = {e["event_ns"]: e for e in tape["events"] if e["type"] == "book"}
    quantities, limits, bids, asks, closes = [], [], [], [], []
    index_orders = {}
    book = None
    for index, ts in enumerate(timestamps):
        book = books.get(ts, book)
        bid, ask = book["bids"][0][0], book["asks"][0][0]
        bids.append(bid)
        asks.append(ask)
        closes.append((bid + ask) / 2)
        order = orders.get(ts)
        quantities.append(0.0 if order is None else order["quantity"] * (1 if order["side"] == "BUY" else -1))
        limits.append(0.0 if order is None else order["limit_price"])
        if order:
            index_orders[index] = order
    closes[-1] = tape["mark_price"]
    close = pd.Series(closes, index=pd.to_datetime(timestamps, unit="ns", utc=True))
    portfolio = vbt.Portfolio.from_order_func(close, order_function,
        np.array(quantities), np.array(limits), np.array(bids), np.array(asks), tape["fee_bps"] / 10_000,
        init_cash=tape["initial_cash"], freq="s")
    records = portfolio.orders.records.to_dict("records")
    fills = []
    for record in records:
        i = int(record["idx"])
        order = index_orders[i]
        fills.append({"fill_id": str(int(record["id"])), "order_id": order["order_id"], "side": "BUY" if int(record["side"]) == 0 else "SELL",
            "quantity": float(record["size"]), "price": float(record["price"]), "fee": float(record["fees"]), "event_ns": timestamps[i]})
    trades = portfolio.exit_trades.records.to_dict("records")
    realized = sum(float(t["pnl"]) + float(t["entry_fees"]) + float(t["exit_fees"]) for t in trades if int(t["status"]) == 1)
    unrealized = sum(float(t["pnl"]) + float(t["entry_fees"]) + float(t["exit_fees"]) for t in trades if int(t["status"]) == 0)
    account = {"ending_cash": float(portfolio.cash().iloc[-1]), "position": float(portfolio.assets().iloc[-1]),
        "total_fees": float(portfolio.orders.records["fees"].sum()), "equity": float(portfolio.value().iloc[-1]),
        "realized_pnl": realized, "unrealized_pnl": unrealized,
        "net_pnl": float(portfolio.total_profit())}
    return dict(base, state="SUPPORTED", fills=fills, account=account,
        native_evidence={"api": "Portfolio.from_order_func", "semantics": "immediate_limit_bar_order", "order_records": records, "exit_trade_records": trades,
            "cash": [float(x) for x in portfolio.cash()], "assets": [float(x) for x in portfolio.assets()], "value": [float(x) for x in portfolio.value()]})


def main():
    request = json.load(sys.stdin)
    print(json.dumps({"engine": "vectorbt", "version": vbt.__version__, "request_hash": request["request_hash"],
        "runtime": {"python_version": platform.python_version(), "platform": platform.platform()},
        "results": [execute(tape) for tape in request["tapes"]]}, sort_keys=True, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
