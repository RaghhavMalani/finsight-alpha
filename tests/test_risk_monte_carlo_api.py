"""Contract tests for backend-owned Monte Carlo research."""

from __future__ import annotations

import numpy as np
import pandas as pd

from backend import monte_carlo_study as study_service
from backend.routes import risk as risk_route


def _history() -> pd.DataFrame:
    steps = np.arange(320, dtype=float)
    log_returns = 0.0004 + 0.012 * np.sin(steps / 11.0)
    close = 100.0 * np.exp(np.cumsum(log_returns))
    return pd.DataFrame(
        {
            "Date": pd.date_range("2024-01-02", periods=len(close), freq="B"),
            "Close": close,
            "Provider": "TEST_HISTORY",
        }
    )


def test_monte_carlo_contract_is_calibrated_and_reproducible(monkeypatch) -> None:
    class FakeService:
        def __init__(self, provider: str) -> None:
            assert provider == "yfinance"

        def get_data(self, ticker: str) -> pd.DataFrame:
            assert ticker == "AAPL"
            return _history()

    monkeypatch.setattr(study_service, "MarketDataService", FakeService)

    first = risk_route.montecarlo(
        "AAPL",
        horizon_days=21,
        n=1_000,
        conf=0.95,
        seed=7,
        include_paths=True,
    )
    second = risk_route.montecarlo(
        "AAPL",
        horizon_days=21,
        n=1_000,
        conf=0.95,
        seed=7,
        include_paths=True,
    )

    assert first["snapshot_id"] == second["snapshot_id"]
    assert first["summary"] == second["summary"]
    assert first["model_version"] == "gbm-historical-v2"
    assert first["source"] == "TEST_HISTORY"
    assert first["observed_at"]
    assert first["available_at"] is None
    assert first["horizon_days"] == 21
    assert first["summary"]["num_steps"] == 21
    assert first["summary"]["num_simulations"] == 1_000
    assert first["fan"]["days"][0] == 0
    assert first["fan"]["days"][-1] == 21
    assert len(first["sampled_paths"]) == 400
    assert all(len(path) == 22 for path in first["sampled_paths"])
    assert first["convergence"]["terminal_mean_stderr"] > 0
    assert "NO_IMPLIED_VOLATILITY" in first["quality"]["flags"]


def test_monte_carlo_paths_are_opt_in(monkeypatch) -> None:
    class FakeService:
        def __init__(self, provider: str) -> None:
            pass

        def get_data(self, ticker: str) -> pd.DataFrame:
            return _history()

    monkeypatch.setattr(study_service, "MarketDataService", FakeService)

    payload = risk_route.montecarlo(
        "MSFT",
        horizon_days=63,
        n=500,
        conf=0.95,
        seed=11,
        include_paths=False,
    )

    assert payload["sampled_paths"] is None
    assert payload["summary"]["num_steps"] == 63
