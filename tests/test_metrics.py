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


def test_total_return(sample_prices: pd.Series) -> None:
    # 99/100 - 1 = -0.01
    assert metrics.calculate_total_return(sample_prices) == pytest.approx(-0.01)


def test_annualized_volatility() -> None:
    # Returns 0.10, -0.10, 0.00 -> sample std 0.10 ; annualised = 0.10 * sqrt(252)
    returns = pd.Series([0.10, -0.10, 0.0])
    expected = 0.10 * np.sqrt(252)
    assert metrics.calculate_annualized_volatility(returns) == pytest.approx(expected)


def test_annualized_volatility_too_few_points() -> None:
    assert metrics.calculate_annualized_volatility(pd.Series([0.01])) == 0.0


def test_correlation_pivot_and_matrix() -> None:
    from src.analytics import build_returns_pivot, calculate_correlation_matrix

    # Two tickers; B is a scaled copy of A, so their (varying) returns are
    # identical -> correlation ~ 1.
    df = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"] * 2),
            "Close": [100.0, 110.0, 99.0, 50.0, 55.0, 49.5],
            "Ticker": ["A", "A", "A", "B", "B", "B"],
        }
    )
    pivot = build_returns_pivot(df)
    assert set(pivot.columns) == {"A", "B"}

    corr = calculate_correlation_matrix(pivot)
    assert corr.loc["A", "B"] == pytest.approx(1.0, abs=1e-6)


def test_average_best_worst_day() -> None:
    returns = pd.Series([0.02, -0.03, 0.01, float("nan")])
    # Mean of [0.02, -0.03, 0.01] = 0.0 ; best = 0.02 ; worst = -0.03
    assert metrics.calculate_average_daily_return(returns) == pytest.approx(0.0)
    assert metrics.calculate_best_day(returns) == pytest.approx(0.02)
    assert metrics.calculate_worst_day(returns) == pytest.approx(-0.03)


def test_average_best_worst_day_empty() -> None:
    empty = pd.Series([float("nan")])
    assert metrics.calculate_average_daily_return(empty) == 0.0
    assert metrics.calculate_best_day(empty) == 0.0
    assert metrics.calculate_worst_day(empty) == 0.0


def test_summary_statistics_includes_new_keys(sample_prices: pd.Series) -> None:
    stats = metrics.calculate_summary_statistics(sample_prices)
    for key in ("average_daily_return", "best_day", "worst_day"):
        assert key in stats


def test_correlation_pair_helpers() -> None:
    from src.analytics import (
        calculate_correlation_matrix,
        create_returns_pivot,
        find_highest_correlation_pair,
        find_lowest_correlation_pair,
    )

    # A and B move together (corr ~ +1); C moves opposite to A (corr ~ -1).
    df = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"] * 3),
            "Close": [
                100.0, 110.0, 99.0,   # A
                50.0, 55.0, 49.5,     # B (scaled copy of A)
                100.0, 90.0, 100.0,   # C (opposite direction)
            ],
            "Ticker": ["A", "A", "A", "B", "B", "B", "C", "C", "C"],
        }
    )
    corr = calculate_correlation_matrix(create_returns_pivot(df))

    highest = find_highest_correlation_pair(corr)
    lowest = find_lowest_correlation_pair(corr)
    assert highest is not None and lowest is not None
    # A & B are the most correlated pair (~1.0).
    assert {highest[0], highest[1]} == {"A", "B"}
    assert highest[2] == pytest.approx(1.0, abs=1e-6)
    # The lowest pair correlation should be below the highest.
    assert lowest[2] < highest[2]


def test_correlation_pair_handles_single_ticker() -> None:
    from src.analytics import calculate_correlation_matrix, create_returns_pivot, find_highest_correlation_pair

    df = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2024-01-01", "2024-01-02"]),
            "Close": [100.0, 110.0],
            "Ticker": ["A", "A"],
        }
    )
    corr = calculate_correlation_matrix(create_returns_pivot(df))
    # Only one ticker -> no pair to return.
    assert find_highest_correlation_pair(corr) is None


# ---------------------------------------------------------------------------
# Phase 2: Financial Math Engine
# ---------------------------------------------------------------------------
def test_clean_returns_strips_inf_and_nan() -> None:
    raw = pd.Series([0.01, np.inf, np.nan, -0.02, -np.inf])
    cleaned = metrics.clean_returns(raw)
    assert cleaned.tolist() == pytest.approx([0.01, -0.02])


def test_clean_returns_type_validation() -> None:
    with pytest.raises(TypeError):
        metrics.clean_returns([0.01, 0.02])  # not a Series


def test_daily_volatility() -> None:
    returns = pd.Series([0.01, -0.01, 0.01, -0.01])
    assert metrics.calculate_daily_volatility(returns) == pytest.approx(
        float(returns.std(ddof=1))
    )


def test_daily_volatility_too_few_points() -> None:
    assert metrics.calculate_daily_volatility(pd.Series([0.01])) == 0.0


def test_cagr_one_year_growth() -> None:
    # ~1 year apart: 100 -> 110 should be ~10% CAGR.
    df = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2021-01-01", "2022-01-01"]),
            "Close": [100.0, 110.0],
        }
    )
    assert metrics.calculate_cagr(df) == pytest.approx(0.10, abs=1e-2)


def test_cagr_handles_bad_input() -> None:
    # Too few rows -> NaN.
    one = pd.DataFrame({"Date": pd.to_datetime(["2021-01-01"]), "Close": [100.0]})
    assert np.isnan(metrics.calculate_cagr(one))
    # Missing columns -> NaN.
    assert np.isnan(metrics.calculate_cagr(pd.DataFrame({"x": [1, 2]})))
    # Non-positive starting price -> NaN.
    bad = pd.DataFrame(
        {"Date": pd.to_datetime(["2021-01-01", "2022-01-01"]), "Close": [0.0, 110.0]}
    )
    assert np.isnan(metrics.calculate_cagr(bad))


def test_sharpe_ratio_formula() -> None:
    returns = pd.Series([0.01, 0.02, 0.03])
    # mean=0.02, std(ddof=1)=0.01 ; with rf=0:
    # sharpe = (0.02*252) / (0.01*sqrt(252)) = 2 * sqrt(252)
    expected = 2.0 * np.sqrt(252)
    assert metrics.calculate_sharpe_ratio(returns, risk_free_rate=0.0) == pytest.approx(expected)


def test_sharpe_ratio_zero_volatility_is_nan() -> None:
    flat = pd.Series([0.01, 0.01, 0.01])
    assert np.isnan(metrics.calculate_sharpe_ratio(flat))


def test_sharpe_ratio_too_few_points_is_nan() -> None:
    assert np.isnan(metrics.calculate_sharpe_ratio(pd.Series([0.01])))


def test_downside_deviation_target_and_annualize() -> None:
    returns = pd.Series([0.03, -0.02, 0.01, -0.04])
    # target=0, daily: only -0.02 and -0.04 count.
    expected_daily = np.sqrt(np.mean(np.square([-0.02, -0.04])))
    assert metrics.calculate_downside_deviation(
        returns, target_return=0.0, annualize=False
    ) == pytest.approx(expected_daily)
    # Annualizing scales by sqrt(252).
    assert metrics.calculate_downside_deviation(
        returns, target_return=0.0, annualize=True, trading_days=252
    ) == pytest.approx(expected_daily * np.sqrt(252))


def test_downside_deviation_higher_target_increases_downside() -> None:
    returns = pd.Series([0.03, -0.02, 0.01, -0.04])
    low = metrics.calculate_downside_deviation(returns, target_return=0.0, annualize=False)
    high = metrics.calculate_downside_deviation(returns, target_return=0.02, annualize=False)
    # A higher minimum-acceptable return pulls more days into the "downside".
    assert high > low


def test_sortino_ratio_no_downside_is_nan() -> None:
    only_gains = pd.Series([0.01, 0.02, 0.03])
    assert np.isnan(metrics.calculate_sortino_ratio(only_gains))


def test_sortino_ratio_positive_for_net_gains() -> None:
    returns = pd.Series([0.02, -0.01, 0.03, -0.02])
    sortino = metrics.calculate_sortino_ratio(returns, risk_free_rate=0.0)
    assert np.isfinite(sortino)
    assert sortino > 0


def test_beta_scaled_asset_is_two() -> None:
    benchmark = pd.Series([0.01, -0.02, 0.03, -0.01])
    asset = benchmark * 2.0  # perfectly amplifies the market by 2x
    assert metrics.calculate_beta(asset, benchmark) == pytest.approx(2.0)


def test_beta_zero_variance_benchmark_is_nan() -> None:
    asset = pd.Series([0.01, -0.02, 0.03])
    flat_benchmark = pd.Series([0.01, 0.01, 0.01])
    assert np.isnan(metrics.calculate_beta(asset, flat_benchmark))


def test_beta_aligns_on_shared_index() -> None:
    benchmark = pd.Series([0.01, -0.02, 0.03, -0.01], index=[0, 1, 2, 3])
    # Asset overlaps benchmark on indices 1..3 only; still 2x on the overlap.
    asset = pd.Series([-0.04, 0.06, -0.02], index=[1, 2, 3])
    assert metrics.calculate_beta(asset, benchmark) == pytest.approx(2.0)


def test_capm_expected_return() -> None:
    # rf=0.05, market=0.10, beta=1 -> 0.10 ; beta=2 -> 0.15
    assert metrics.calculate_capm_expected_return(1.0, 0.10, 0.05) == pytest.approx(0.10)
    assert metrics.calculate_capm_expected_return(2.0, 0.10, 0.05) == pytest.approx(0.15)


def test_capm_nan_inputs() -> None:
    assert np.isnan(metrics.calculate_capm_expected_return(float("nan"), 0.10))
    assert np.isnan(metrics.calculate_capm_expected_return(1.0, float("nan")))


def test_default_benchmark_for_ticker() -> None:
    from src import config

    assert config.get_default_benchmark_for_ticker("RELIANCE.NS") == config.BENCHMARK_INDIA
    assert config.get_default_benchmark_for_ticker("AAPL") == config.BENCHMARK_US


def test_summary_statistics_with_benchmark() -> None:
    dates = pd.date_range("2022-01-01", periods=6, freq="D")
    asset = pd.Series([100.0, 101.0, 102.0, 101.0, 103.0, 104.0], index=dates)
    benchmark = pd.Series([50.0, 50.5, 51.0, 50.5, 51.5, 52.0], index=dates)

    stats = metrics.calculate_summary_statistics(asset, benchmark_prices=benchmark)
    for key in ("cagr", "sortino_ratio", "beta", "capm_expected_return", "latest_close"):
        assert key in stats
    # With a benchmark provided, beta should be a real number.
    assert np.isfinite(stats["beta"])


def test_summary_statistics_without_benchmark_has_nan_beta() -> None:
    dates = pd.date_range("2022-01-01", periods=4, freq="D")
    asset = pd.Series([100.0, 101.0, 102.0, 103.0], index=dates)
    stats = metrics.calculate_summary_statistics(asset)
    assert np.isnan(stats["beta"])
    assert np.isnan(stats["capm_expected_return"])


def test_sector_summary() -> None:
    from src.analytics import calculate_sector_summary

    df = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2024-01-01", "2024-01-02"] * 2),
            "Close": [100.0, 110.0, 200.0, 180.0],
            "Ticker": ["AAPL", "AAPL", "JPM", "JPM"],
        }
    )
    summary = calculate_sector_summary(df)
    # AAPL -> Information Technology, JPM -> Financials.
    assert "Information Technology" in summary.index
    assert "Financials" in summary.index
    assert summary.loc["Information Technology", "num_tickers"] == 1
