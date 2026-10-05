"""Deterministic illustrative worlds, not downloaded market or macro history."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import numpy as np

from src.dynamics.market_regime_inputs import FACTORS, RegimeWorld


def demo_world(*, sparse: bool = False, sessions: int = 420) -> RegimeWorld:
    rng = np.random.default_rng(642011)
    days, day = [], datetime(2024, 1, 2, tzinfo=ZoneInfo("America/New_York"))
    while len(days) < sessions:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)
    daily, intraday, factors, macro, events = [], [], [], [], []
    price, sigma, last = 100.0, 0.007, 0.0
    for i, day in enumerate(days):
        stress = 0.25 + 0.5 * (90 <= i % 210 < 140)
        sigma = float(np.sqrt(0.000004 + 0.10 * last**2 + 0.85 * sigma**2))
        f = rng.normal(0, [0.009, 0.004, 0.004, 0.006, 0.004, 0.004, 0.003])
        r = float(
            np.clip(
                0.25 * f[0]
                + 0.003 * np.sin(i / 19)
                + rng.normal(0, sigma * (1 + stress)),
                -0.2,
                0.2,
            )
        )
        if i in (112, 310):
            r -= 0.065
        last = r
        strategy = float(0.15 * f[0] + 0.7 * f[3] + rng.normal(0, 0.001))
        close_at = day.replace(hour=16)
        available = close_at + timedelta(minutes=3)
        price *= 1 + r
        spread = float(3 + 12 * stress + 200 * sigma)
        volume = float(1e6 * (1 + stress) * rng.uniform(0.8, 1.2))
        daily.append(
            {
                "observed_at": close_at,
                "available_at": available,
                "close": price,
                "volume": volume,
                "strategy_return": None if sparse else strategy,
                "spread_bps": None if sparse else spread,
                "liquidity": None if sparse else volume / spread,
            }
        )
        factor_values = dict(zip(FACTORS, map(float, f)))
        factors.append(
            {
                "observed_at": close_at,
                "available_at": close_at + timedelta(minutes=2),
                "values": {"MKT": factor_values["MKT"]} if sparse else factor_values,
                "revision": "demo-v1",
            }
        )
        if i % 5 == 0 and not sparse:
            release = day.replace(hour=8, minute=30)
            macro.append(
                {
                    "series": "DEMO_STRESS_PROXY",
                    "observed_at": release,
                    "available_at": release + timedelta(minutes=1),
                    "value": stress
                    + 0.15 * np.sin(i / 15)
                    + float(rng.normal(0, 0.03)),
                    "direction": "HIGH_IS_STRESS",
                    "revision": "demo-v1",
                }
            )
        for bucket in range(13):
            at = day.replace(hour=9, minute=30) + timedelta(minutes=30 * (bucket + 1))
            u = 1 + 1.8 * abs(bucket - 6) / 6
            intraday.append(
                {
                    "observed_at": at,
                    "available_at": at + timedelta(minutes=1),
                    "close": price * np.exp(r * (bucket - 12) / 13),
                    "volume": volume / 25.6 * u,
                    "spread_bps": None if sparse else spread * u,
                    "liquidity": None if sparse else volume / (13 * spread * u),
                    "order_imbalance": (
                        None if sparse else float(rng.uniform(-0.5, 0.5))
                    ),
                }
            )
            if not sparse:
                for offset in sorted(
                    rng.uniform(1, 1799, int(rng.poisson(0.8 + 2 * stress * u)))
                ):
                    stamp = at - timedelta(seconds=float(offset))
                    events.append(
                        {
                            "observed_at": stamp,
                            "available_at": stamp + timedelta(seconds=1),
                        }
                    )
    events.sort(key=lambda e: e["observed_at"])
    return RegimeWorld(
        schema_version="market-regime-input/0.4.2",
        id="demo-sparse" if sparse else "demo-full",
        ticker="DEMO",
        evidence_scope="SYNTHETIC_DEMO",
        source="Seed 642011 illustrative volatility/factor/event world; no market data",
        revision="d0.4.2-demo-1",
        price_basis="SYNTHETIC",
        timezone="America/New_York",
        calendar_note="Synthetic weekdays only; NOT an exchange holiday calendar",
        daily=daily,
        intraday=intraday,
        factors=factors,
        macro=macro,
        events=events,
    )
