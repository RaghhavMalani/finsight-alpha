"""Deterministic native hftbacktest L2/latency/queue/exchange probe."""

import json

import numpy as np
import hftbacktest
from hftbacktest import BacktestAsset, HashMapMarketDepthBacktest
from hftbacktest import BUY_EVENT, DEPTH_EVENT, EXCH_EVENT, LOCAL_EVENT, SELL_EVENT, event_dtype


events = np.zeros(4, dtype=event_dtype)
events[0] = (DEPTH_EVENT | BUY_EVENT | EXCH_EVENT | LOCAL_EVENT, 1, 1, 100.0, 5.0, 0, 0, 0.0)
events[1] = (DEPTH_EVENT | SELL_EVENT | EXCH_EVENT | LOCAL_EVENT, 1, 1, 101.0, 4.0, 0, 0, 0.0)
events[2] = (DEPTH_EVENT | BUY_EVENT | EXCH_EVENT | LOCAL_EVENT, 2, 2, 100.0, 6.0, 0, 0, 0.0)
events[3] = (DEPTH_EVENT | SELL_EVENT | EXCH_EVENT | LOCAL_EVENT, 2, 2, 101.0, 3.0, 0, 0, 0.0)
asset = (BacktestAsset().data(events).linear_asset(1.0).constant_latency(0, 0)
         .risk_adverse_queue_model().partial_fill_exchange()
         .trading_value_fee_model(0.0, 0.0).tick_size(1.0).lot_size(1.0))
backtest = HashMapMarketDepthBacktest([asset])
status = int(backtest._goto_end())
depth = backtest.depth(0)
print(json.dumps({
    "engine": "hftbacktest", "version": hftbacktest.__version__, "status": status,
    "best_bid": float(depth.best_bid), "best_ask": float(depth.best_ask),
}, sort_keys=True, separators=(",", ":")))
backtest.close()

