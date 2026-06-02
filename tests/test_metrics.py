"""Unit tests for src.analytics.metrics.

These tests pin down the *math* of each metric with small, hand-verifiable
examples so refactors cannot silently change the financial logic.

Run with::

    pytest -q
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.analytics import metrics


# A tiny, deterministic price series we can reason about by hand.
# 100 -> 110 (+10%) -> 99 (-10%) -> 99 (0%)
@pytest.fixture
def sample_prices() -> pd.Series:
    return pd.Series([100.0, 110.0, 99.0, 99.0])


def test_simple_returns(sample_prices: pd.Series) -> None:
    returns = metrics.calculate_simple_returns(sample_prices)

    # First value has no prior price -> NaN.
    assert np.isnan(returns.iloc[0])
    # 110/100 - 1 = 0.10
    assert returns.iloc[1] == pytest.approx(0.10)
    # 99/110 - 1 = -0.10
    assert returns.iloc[2] == pytest.approx(-0.10)
    # 99/99 - 1 = 0.0
    assert returns.iloc[3] == pytest.approx(0.0)


def test_log_returns(sample_prices: pd.Series) -> None:
    log_returns = metrics.calculate_log_returns(sample_prices)

    assert np.isnan(log_returns.iloc[0])
    # ln(110/100) = ln(1.1)
    assert log_returns.iloc[1] == pytest.approx(np.log(1.1))
    # ln(99/110)
    assert log_returns.iloc[2] == pytest.approx(np.log(99 / 110))


def test_log_returns_rejects_non_positive_prices() -> None:
    bad = pd.Series([100.0, 0.0, 50.0])
    with pytest.raises(ValueError):
        metrics.calculate_log_returns(bad)


def test_cumulative_returns(sample_prices: pd.Series) -> None:
    simple = metrics.calculate_simple_returns(sample_prices)
    cumulative = metrics.calculate_cumulative_returns(simple)

    # Leading NaN treated as 0% -> first cumulative return is 0.
    assert cumulative.iloc[0] == pytest.approx(0.0)
    # After +10%: (1.10) - 1 = 0.10
    assert cumulative.iloc[1] == pytest.approx(0.10)
    # After +10% then -10%: 1.10 * 0.90 - 1 = -0.01
    assert cumulative.iloc[2] == pytest.approx(-0.01)
    # Final period flat -> unchanged at -0.01
    assert cumulative.iloc[3] == pytest.approx(-0.01)


def test_cumulative_matches_total_price_growth(sample_prices: pd.Series) -> None:
    # The final cumulative return must equal end/start - 1 regardless of path.
    simple = metrics.calculate_simple_returns(sample_prices)
    cumulative = metrics.calculate_cumulative_returns(simple)
    expected = sample_prices.iloc[-1] / sample_prices.iloc[0] - 1.0
    assert cumulative.iloc[-1] == pytest.approx(expected)


def test_drawdown(sample_prices: pd.Series) -> None:
    drawdown = metrics.calculate_drawdown(sample_prices)

    # Prices: 100, 110, 99, 99 ; running peak: 100, 110, 110, 110
    assert drawdown.iloc[0] == pytest.approx(0.0)   # at a new peak
    assert drawdown.iloc[1] == pytest.approx(0.0)   # new peak again
    # 99 vs peak 110 -> (99 - 110)/110 = -0.10
    assert drawdown.iloc[2] == pytest.approx(-0.10)
    assert drawdown.iloc[3] == pytest.approx(-0.10)

    # Drawdown must never be positive.
    assert (drawdown <= 1e-12).all()


def test_max_drawdown(sample_prices: pd.Series) -> None:
    max_dd = metrics.calculate_max_drawdown(sample_prices)
    # Deepest trough is -10%.
    assert max_dd == pytest.approx(-0.10)


def test_max_drawdown_monotonic_increase() -> None:
    rising = pd.Series([1.0, 2.0, 3.0, 4.0])
    # A series that only rises has zero drawdown.
    assert metrics.calculate_max_drawdown(rising) == pytest.approx(0.0)


def test_rolling_volatility_shape_and_annualization() -> None:
    returns = pd.Series([0.01, -0.02, 0.015, -0.005, 0.02, -0.01])
    window = 3

    daily = metrics.calculate_rolling_volatility(
        returns, window=window, annualize=False
    )
    annual = metrics.calculate_rolling_volatility(
        returns, window=window, annualize=True, trading_days=252
    )

    # First (window - 1) entries are NaN.
    assert daily.iloc[: window - 1].isna().all()
    # Annualised = daily * sqrt(252).
    valid = daily.dropna().index
    assert np.allclose(
        annual.loc[valid].values, daily.loc[valid].values * np.sqrt(252)
    )


def test_summary_statistics_keys_and_total_return(sample_prices: pd.Series) -> None:
    stats = metrics.calculate_summary_statistics(sample_prices)

    expected_keys = {
        "observations",
        "start_price",
        "end_price",
        "total_return",
        "annualized_return",
        "annualized_volatility",
        "sharpe_ratio",
        "max_drawdown",
    }
    assert expected_keys.issubset(stats.keys())
    # end/start - 1 = 99/100 - 1 = -0.01
    assert stats["total_return"] == pytest.approx(-0.01)
    assert stats["max_drawdown"] == pytest.approx(-0.10)


def test_type_validation() -> None:
    with pytest.raises(TypeError):
        metrics.calculate_simple_returns([1, 2, 3])  # not a Series
