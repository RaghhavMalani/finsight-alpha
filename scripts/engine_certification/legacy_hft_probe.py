"""Deterministic native legacy-HFT delay/book event-loop probe."""

import datetime
import json
import logging.config

# Upstream starts an unused non-daemon logging socket on every logger creation.
logging.config.listen = lambda *args, **kwargs: type("_NoopListener", (), {"start": lambda self: None})()

import numpy as np
from hft.backtesting.backtest import Backtest
from hft.backtesting.strategy import CalmStrategy
from hft.utils.data import OrderBook


class TapeReader:
    def __init__(self, items):
        self.items = items
        self.initial_moment = items[0].timestamp
        self.current_timestamp = self.initial_moment

    def __iter__(self):
        for item in self.items:
            self.current_timestamp = item.timestamp
            yield item, True

    def try_reset(self):
        return False


start = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
books = [
    OrderBook("XBTUSD", start, np.array([100.0]), np.array([5]), np.array([101.0]), np.array([4])),
    OrderBook("XBTUSD", start + datetime.timedelta(milliseconds=1), np.array([100.0]), np.array([6]), np.array([101.0]), np.array([3])),
]
strategy = CalmStrategy()
backtest = Backtest(TapeReader(books), strategy, delay=250, seed=42)
backtest.run()
book = backtest.memory[("orderbook", "XBTUSD")]
print(json.dumps({
    "engine": "legacy-hft", "version": "0.5.0", "delay_us": backtest.delay,
    "best_bid": float(book.bid_prices[0]), "best_ask": float(book.ask_prices[0]),
}, sort_keys=True, separators=(",", ":")))
