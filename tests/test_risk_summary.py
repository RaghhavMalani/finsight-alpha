"""Unit tests for src.analytics.risk_summary.

Offline tests using small hardcoded frames - no internet required.

Run with::

    pytest -q
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.analytics import risk_summary


def test_classify_volatility_risk_buckets() -> None:
    # Below 0.15 -> Low.
    assert risk_summary.classify_volatility_risk(0.10) == "Low Risk"
    # Boundary 0.15 is inclusive of Medium (not < 0.15).
    assert risk_summary.classify_volatility_risk(0.15) == "Medium Risk"
    assert risk_summary.classify_volatility_risk(0.25) == "Medium Risk"
    # Boundary 0.30 stays Medium; above is High.
    assert risk_summary.classify_volatility_risk(0.30) == "Medium Risk"
    assert risk_summary.classify_volatility_risk(0.45) == "High Risk"


def test_classify_volatility_risk_nan() -> None:
    assert risk_summary.classify_volatility_risk(float("nan")) == "Unknown"


def test_downside_deviation_only_uses_negatives() -> None:
    # Two negative returns: -0.02 and -0.04 ; positives are ignored.
    returns = pd.Series([0.03, -0.02, 0.01, -0.04])
    expected_daily = np.sqrt(np.mean(np.square([-0.02, -0.04])))
    result = risk_summary.calculate_downside_deviation(returns, annualize=False)
    assert result == pytest.approx(expected_daily)


def test_downside_deviation_no_negatives_is_zero() -> None:
    returns = pd.Series([0.01, 0.02, 0.03])
    assert np.isnan(risk_summary.calculate_downside_deviation(returns))


def test_downside_deviation_annualized_scales() -> None:
    returns = pd.Series([-0.01, -0.02])
    daily = risk_summary.calculate_downside_deviation(returns, annualize=False)
    annual = risk_summary.calculate_downside_deviation(returns, annualize=True, trading_days=252)
    assert annual == pytest.approx(daily * np.sqrt(252))


def test_calculate_risk_summary_structure() -> None:
    df = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"] * 2),
            "Close": [100.0, 102.0, 101.0, 50.0, 60.0, 40.0],
            "Ticker": ["LOWVOL", "LOWVOL", "LOWVOL", "HIGHVOL", "HIGHVOL", "HIGHVOL"],
        }
    )
    summary = risk_summary.calculate_risk_summary(df)

    expected_cols = {
        "Ticker", "Annualized Volatility", "Downside Deviation",
        "Max Drawdown", "Risk Classification", "VaR (95%)", "CVaR (95%)",
    }
    assert expected_cols.issubset(summary.columns)

    # VaR/CVaR are placeholders for Phase 4.
    assert (summary["VaR (95%)"] == "Coming in Phase 4").all()
    assert (summary["CVaR (95%)"] == "Coming in Phase 4").all()

    # Sorted riskiest first: the volatile ticker should be on top.
    assert summary.iloc[0]["Ticker"] == "HIGHVOL"


def test_calculate_risk_summary_empty() -> None:
    assert risk_summary.calculate_risk_summary(pd.DataFrame()).empty
