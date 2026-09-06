"""Native hftbacktest L2/queue/latency worker; no Forge oracle imports."""
import json
import platform
import sys

import numpy as np
import hftbacktest as h
from hftbacktest import BacktestAsset, HashMapMarketDepthBacktest
from hftbacktest.order import GTC, IOC, LIMIT


def execute(tape):
    rows = []
    previous = {"bids": {}, "asks": {}}
    for event in tape["events"]:
        ts = event["event_ns"]
        if event["type"] == "book":
            for side, flag in (("bids", h.BUY_EVENT), ("asks", h.SELL_EVENT)):
                levels = dict(event[side])
                for price in sorted(set(previous[side]) - set(levels)):
                    rows.append((h.DEPTH_EVENT | flag | h.EXCH_EVENT | h.LOCAL_EVENT, ts, ts, price, 0.0, 0, 0, 0.0))
                for price, quantity in event[side]:
                    rows.append((h.DEPTH_EVENT | flag | h.EXCH_EVENT | h.LOCAL_EVENT, ts, ts, price, quantity, 0, 0, 0.0))
                previous[side] = levels
        else:
            flag = h.BUY_EVENT if event["side"] == "BUY" else h.SELL_EVENT
            rows.append((h.TRADE_EVENT | flag | h.EXCH_EVENT | h.LOCAL_EVENT, ts, ts, event["price"], event["quantity"], 0, 0, 0.0))
    # Native data must extend beyond the last strategy command/response.
    price, quantity = next(iter(previous["asks"].items()))
    rows.append((h.DEPTH_EVENT | h.SELL_EVENT | h.EXCH_EVENT | h.LOCAL_EVENT, tape["end_ns"], tape["end_ns"], price, quantity, 0, 0, 0.0))
    events = np.array(rows, dtype=h.event_dtype)
    asset = (BacktestAsset().data(events).linear_asset(1.0)
        .constant_order_latency(tape["latency_ns"], 0).risk_adverse_queue_model()
        .partial_fill_exchange().trading_value_fee_model(tape["fee_bps"] / 10_000, tape["fee_bps"] / 10_000)
        .tick_size(1.0).lot_size(1.0))
    backtest = HashMapMarketDepthBacktest([asset])
    orders = {i + 1: order for i, order in enumerate(tape["orders"])}
    observed, fills, snapshots = {}, [], []

    def snapshot():
        native_orders = []
        for oid, order in orders.items():
            native = backtest.orders(0).get(oid)
            if native is None:
                continue
            item = {"order_id": oid, "status": int(native.status), "quantity": float(native.qty), "leaves_qty": float(native.leaves_qty),
                "exec_qty": float(native.exec_qty), "exec_price": float(native.exec_price), "exch_timestamp": int(native.exch_timestamp)}
            native_orders.append(item)
            cumulative = item["quantity"] - item["leaves_qty"]
            delta = cumulative - observed.get(oid, 0.0)
            if delta > 1e-9:
                fills.append({"fill_id": f"{oid}-{len(fills)+1}", "order_id": order["order_id"], "side": order["side"],
                    "quantity": delta, "price": item["exec_price"], "fee": delta * item["exec_price"] * tape["fee_bps"] / 10_000,
                    "event_ns": item["exch_timestamp"]})
                observed[oid] = cumulative
        state = backtest.state_values(0)
        snapshots.append({"timestamp": int(backtest.current_timestamp), "orders": native_orders,
            "state": {"position": float(state.position), "balance": float(state.balance), "fee": float(state.fee), "num_trades": int(state.num_trades), "trading_value": float(state.trading_value)}})

    try:
        backtest.elapse(0)
        actions = []
        for oid, order in orders.items():
            actions.append((order["submitted_ns"], "submit", oid))
            if order["cancel_ns"] is not None:
                actions.append((order["cancel_ns"], "cancel", oid))
        times = sorted({e["event_ns"] for e in tape["events"]} | {t for t, _, _ in actions} | {t + tape["latency_ns"] for t, _, _ in actions} | {tape["end_ns"]})
        for ts in times:
            backtest.elapse(max(0, ts - int(backtest.current_timestamp)))
            snapshot()
            for _, kind, oid in (a for a in actions if a[0] == ts):
                order = orders[oid]
                if kind == "submit":
                    submit = backtest.submit_buy_order if order["side"] == "BUY" else backtest.submit_sell_order
                    submit(0, oid, order["limit_price"], order["quantity"], IOC if order["time_in_force"] == "IOC" else GTC, LIMIT, False)
                else:
                    native = backtest.orders(0).get(oid)
                    if native is not None and native.cancellable:
                        backtest.cancel(0, oid, False)
                backtest.elapse(0)
                snapshot()
        state = backtest.state_values(0)
        cash = tape["initial_cash"] + float(state.balance) - float(state.fee)
        position = float(state.position)
        return {"tape_id": tape["tape_id"], "tape_hash": tape["tape_hash"], "state": "SUPPORTED", "fills": fills,
            "account": {"ending_cash": cash, "position": position, "total_fees": float(state.fee), "equity": cash + position * tape["mark_price"]},
            "unsupported_metrics": {"realized_pnl": "Native StateValues has no realized PnL field", "unrealized_pnl": "Native StateValues has no unrealized PnL field"},
            "native_evidence": {"api": "HashMapMarketDepthBacktest", "queue_model": "RiskAdverseQueueModel", "exchange_model": "PartialFillExchange", "snapshots": snapshots,
                "cash_normalization": "initial_cash + native.balance - native.fee", "equity_normalization": "native cash + native position * requested mark"}}
    finally:
        backtest.close()


def main():
    request = json.load(sys.stdin)
    print(json.dumps({"engine": "hftbacktest", "version": h.__version__, "request_hash": request["request_hash"],
        "runtime": {"python_version": platform.python_version(), "platform": platform.platform()},
        "results": [execute(tape) for tape in request["tapes"]]}, sort_keys=True, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
