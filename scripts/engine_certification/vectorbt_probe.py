"""Deterministic native VectorBT bars/signals/accounting probe."""

import json

import pandas as pd
import vectorbt as vbt


close = pd.Series([100.0, 101.0, 102.0, 101.0], index=pd.date_range("2026-01-01", periods=4, freq="min", tz="UTC"))
entries = pd.Series([True, False, False, False], index=close.index)
exits = pd.Series([False, False, True, False], index=close.index)
portfolio = vbt.Portfolio.from_signals(close, entries, exits, size=2.0, init_cash=10_000.0, fees=0.0025, freq="min")
orders = portfolio.orders.records_readable
print(json.dumps({
    "engine": "vectorbt", "version": vbt.__version__,
    "order_count": int(portfolio.orders.count()),
    "ending_cash": round(float(portfolio.cash().iloc[-1]), 10),
    "ending_value": round(float(portfolio.value().iloc[-1]), 10),
    "fees": round(float(orders["Fees"].sum()), 10),
}, sort_keys=True, separators=(",", ":")))
