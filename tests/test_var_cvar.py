"""Unit tests for VaR and CVaR calculations."""

import pandas as pd

from src.risk import var_cvar


def test_historical_var_positive() -> None:
    returns = pd.Series([0.01, -0.02, 0.015, -0.04, 0.03, -0.01, -0.06, 0.02])
    var = var_cvar.calculate_historical_var(returns, confidence_level=0.95)
    assert var > 0


def test_historical_cvar_positive() -> None:
    returns = pd.Series([0.01, -0.02, 0.015, -0.04, 0.03, -0.01, -0.06, 0.02])
    cvar = var_cvar.calculate_historical_cvar(returns, confidence_level=0.95)
    assert cvar > 0


def test_parametric_var_positive() -> None:
    returns = pd.Series([0.01, -0.02, 0.015, -0.04, 0.03, -0.01, -0.06, 0.02])
    var = var_cvar.calculate_parametric_var(returns, confidence_level=0.95)
    assert var > 0


def test_parametric_cvar_positive() -> None:
    returns = pd.Series([0.01, -0.02, 0.015, -0.04, 0.03, -0.01, -0.06, 0.02])
    cvar = var_cvar.calculate_parametric_cvar(returns, confidence_level=0.95)
    assert cvar > 0


def test_monte_carlo_var_positive() -> None:
    sim_returns = pd.Series([0.01, -0.02, 0.015, -0.04, 0.03, -0.01, -0.06, 0.02])
    var = var_cvar.calculate_monte_carlo_var(sim_returns, confidence_level=0.95)
    assert var > 0


def test_monte_carlo_cvar_positive() -> None:
    sim_returns = pd.Series([0.01, -0.02, 0.015, -0.04, 0.03, -0.01, -0.06, 0.02])
    cvar = var_cvar.calculate_monte_carlo_cvar(sim_returns, confidence_level=0.95)
    assert cvar > 0


def test_cvar_greater_than_or_equal_var() -> None:
    returns = pd.Series([0.01, -0.02, 0.015, -0.04, 0.03, -0.01, -0.06, 0.02])
    var = var_cvar.calculate_historical_var(returns, confidence_level=0.95)
    cvar = var_cvar.calculate_historical_cvar(returns, confidence_level=0.95)
    
    assert cvar >= var
