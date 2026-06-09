import pytest
import pandas as pd
import numpy as np
from src.risk import portfolio_optimization

@pytest.fixture
def sample_prices():
    dates = pd.date_range("2024-01-01", periods=5)
    return pd.DataFrame({
        "AAPL": [100, 102, 101, 104, 106],
        "MSFT": [200, 202, 204, 203, 207],
        "SPY":  [400, 402, 401, 405, 408],
    }, index=dates)

@pytest.fixture
def expected_returns():
    return pd.Series({"AAPL": 0.10, "MSFT": 0.12, "SPY": 0.08})

@pytest.fixture
def covariance_matrix():
    return pd.DataFrame({
        "AAPL": [0.04, 0.02, 0.01],
        "MSFT": [0.02, 0.05, 0.015],
        "SPY":  [0.01, 0.015, 0.02]
    }, index=["AAPL", "MSFT", "SPY"])

def test_calculate_asset_returns(sample_prices):
    returns = portfolio_optimization.calculate_asset_returns(sample_prices, method="simple")
    assert not returns.empty
    assert len(returns.columns) == 3
    assert len(returns) == 4  # one row lost to pct_change

def test_expected_returns(sample_prices):
    returns = portfolio_optimization.calculate_asset_returns(sample_prices, method="simple")
    exp_returns = portfolio_optimization.calculate_expected_returns(returns)
    assert len(exp_returns) == 3
    assert not exp_returns.isna().any()

def test_covariance_matrix_shape(sample_prices):
    returns = portfolio_optimization.calculate_asset_returns(sample_prices, method="simple")
    cov = portfolio_optimization.calculate_covariance_matrix(returns)
    assert cov.shape == (3, 3)
    assert list(cov.index) == list(cov.columns)

def test_portfolio_return(expected_returns):
    weights = np.array([1/3, 1/3, 1/3])
    ret = portfolio_optimization.calculate_portfolio_return(weights, expected_returns)
    assert isinstance(ret, float)
    assert np.isclose(ret, 0.10)

def test_portfolio_volatility(covariance_matrix):
    weights = np.array([1/3, 1/3, 1/3])
    vol = portfolio_optimization.calculate_portfolio_volatility(weights, covariance_matrix)
    assert vol > 0
    assert isinstance(vol, float)

def test_portfolio_sharpe_ratio(expected_returns, covariance_matrix):
    weights = np.array([1/3, 1/3, 1/3])
    sr = portfolio_optimization.calculate_portfolio_sharpe_ratio(weights, expected_returns, covariance_matrix, risk_free_rate=0.0)
    assert isinstance(sr, float)
    assert sr > 0

def test_equal_weight_portfolio():
    weights = portfolio_optimization.equal_weight_portfolio(["AAPL", "MSFT", "SPY"])
    assert len(weights) == 3
    assert np.isclose(weights.sum(), 1.0)
    assert np.allclose(weights, 1/3)

def test_minimum_variance_portfolio(expected_returns, covariance_matrix):
    res = portfolio_optimization.minimum_variance_portfolio(expected_returns, covariance_matrix)
    assert res["success"]
    assert np.isclose(res["weights"].sum(), 1.0)
    assert all(res["weights"] >= -1e-4)

def test_maximum_sharpe_portfolio(expected_returns, covariance_matrix):
    res = portfolio_optimization.maximum_sharpe_portfolio(expected_returns, covariance_matrix, risk_free_rate=0.02)
    assert res["success"]
    assert np.isclose(res["weights"].sum(), 1.0)
    assert all(res["weights"] >= -1e-4)

def test_risk_contribution(covariance_matrix):
    weights = np.array([0.4, 0.4, 0.2])
    rc = portfolio_optimization.calculate_risk_contribution(weights, covariance_matrix)
    assert "percentage_risk_contribution" in rc.columns
    assert np.isclose(rc["percentage_risk_contribution"].sum(), 1.0)

def test_risk_parity_portfolio(covariance_matrix):
    res = portfolio_optimization.risk_parity_portfolio(covariance_matrix)
    assert res["success"]
    assert np.isclose(res["weights"].sum(), 1.0)
    # Check if risk contributions are roughly equal
    rc = res["risk_contribution"]
    assert np.allclose(rc["percentage_risk_contribution"], 1/3, atol=1e-2)

def test_compare_portfolios(expected_returns, covariance_matrix):
    comp = portfolio_optimization.compare_portfolios(expected_returns, covariance_matrix, risk_free_rate=0.02)
    assert len(comp) == 4
    portfolios = comp["portfolio"].tolist()
    assert "Equal Weight" in portfolios
    assert "Minimum Variance" in portfolios
    assert "Maximum Sharpe" in portfolios
    assert "Risk Parity" in portfolios
