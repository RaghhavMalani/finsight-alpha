"""Deterministic native Nautilus event-clock/lifecycle probe."""

import json

import nautilus_trader
from nautilus_trader.test_kit.providers import TestInstrumentProvider
from nautilus_trader.test_kit.stubs.component import TestComponentStubs
from nautilus_trader.test_kit.stubs.data import TestDataStubs


instrument = TestInstrumentProvider.default_fx_ccy("AUD/USD")
ticks = [
    TestDataStubs.quote_tick(instrument, bid_price=1.0000, ask_price=1.0002, ts_event=1_000, ts_init=1_000),
    TestDataStubs.quote_tick(instrument, bid_price=1.0001, ask_price=1.0003, ts_event=2_000, ts_init=2_000),
]
engine = TestComponentStubs.backtest_engine(instrument=instrument, ticks=ticks)
engine.run()
result = engine.get_result()
print(json.dumps({
    "engine": "nautilus", "version": nautilus_trader.__version__,
    "backtest_start_ns": int(result.backtest_start), "backtest_end_ns": int(result.backtest_end),
    "iterations": int(result.iterations), "total_orders": int(result.total_orders),
}, sort_keys=True, separators=(",", ":")))
engine.dispose()

