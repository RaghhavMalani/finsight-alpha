"""Portfolio Optimization Engine.

Provides tools for Markowitz mean-variance optimization, efficient frontier
calculation, risk contribution analysis, and risk parity portfolio construction.
"""

import numpy as np
import pandas as pd
from scipy.optimize import minimize
import warnings

def create_price_pivot(
    df: pd.DataFrame,
    date_col: str = "Date",
    ticker_col: str = "Ticker",
    price_col: str = "Close"
) -> pd.DataFrame:
    """Convert long-format price DataFrame into a wide-format pivot table.

    Args:
        df: Input DataFrame containing prices in long format.
        date_col: Name of the column containing dates.
        ticker_col: Name of the column containing asset tickers.
        price_col: Name of the column containing prices.

    Returns:
        pd.DataFrame: Pivot table indexed by Date with tickers as columns.
    """
    pivot = df.pivot(index=date_col, columns=ticker_col, values=price_col)
    pivot.index = pd.to_datetime(pivot.index)
    pivot = pivot.sort_index()
    return pivot

def calculate_asset_returns(
    price_data: pd.DataFrame,
    method: str = "log"
) -> pd.DataFrame:
    """Calculate asset returns from price data.

    Args:
        price_data: Wide-format DataFrame of prices.
        method: Return calculation method, "simple" or "log".

    Returns:
        pd.DataFrame: Calculated returns, dropping rows with all missing values
            and replacing inf/-inf with NaN.
    """
    if method == "log":
        returns = np.log(price_data / price_data.shift(1))
    elif method == "simple":
        returns = price_data.pct_change()
    else:
        raise ValueError("Method must be 'simple' or 'log'.")
        
    returns = returns.replace([np.inf, -np.inf], np.nan)
    returns = returns.dropna(how="all")
    return returns

def calculate_expected_returns(
    returns: pd.DataFrame,
    trading_days: int = 252,
    method: str = "mean"
) -> pd.Series:
    """Calculate annualized expected returns from daily returns.

    Args:
        returns: Daily returns DataFrame.
        trading_days: Number of trading days in a year.
        method: Calculation method (currently only "mean" is supported).

    Returns:
        pd.Series: Annualized expected returns for each asset.
    """
    if method != "mean":
        raise ValueError("Only 'mean' method is supported currently.")
        
    expected_returns = returns.mean() * trading_days
    return expected_returns

def calculate_covariance_matrix(
    returns: pd.DataFrame,
    trading_days: int = 252
) -> pd.DataFrame:
    """Calculate annualized covariance matrix from daily returns.

    Args:
        returns: Daily returns DataFrame.
        trading_days: Number of trading days in a year.

    Returns:
        pd.DataFrame: Annualized covariance matrix.
    """
    return returns.cov() * trading_days

def validate_weights(weights: np.ndarray, n_assets: int) -> None:
    """Validate portfolio weights.

    Args:
        weights: Array of asset weights.
        n_assets: Expected number of assets.

    Raises:
        ValueError: If weights are invalid.
    """
    if len(weights) != n_assets:
        raise ValueError(f"Expected {n_assets} weights, but got {len(weights)}.")
    if np.isnan(weights).any():
        raise ValueError("Weights cannot contain NaN values.")
    if not np.isclose(np.sum(weights), 1.0, atol=1e-4):
        warnings.warn(f"Weights do not sum to 1. Sum is {np.sum(weights)}.")
    if np.any(weights < -1e-4):
        warnings.warn("Weights contain negative values (shorting).")

def calculate_portfolio_return(
    weights: np.ndarray,
    expected_returns: pd.Series
) -> float:
    """Calculate expected portfolio return.

    Args:
        weights: Array of asset weights.
        expected_returns: Series of expected asset returns.

    Returns:
        float: Expected portfolio return.
    """
    return np.dot(weights, expected_returns)

def calculate_portfolio_volatility(
    weights: np.ndarray,
    covariance_matrix: pd.DataFrame
) -> float:
    """Calculate portfolio volatility (standard deviation).

    Args:
        weights: Array of asset weights.
        covariance_matrix: Annualized covariance matrix of assets.

    Returns:
        float: Portfolio volatility.
    """
    return np.sqrt(np.dot(weights.T, np.dot(covariance_matrix, weights)))

def calculate_portfolio_sharpe_ratio(
    weights: np.ndarray,
    expected_returns: pd.Series,
    covariance_matrix: pd.DataFrame,
    risk_free_rate: float = 0.05
) -> float:
    """Calculate portfolio Sharpe Ratio.

    Args:
        weights: Array of asset weights.
        expected_returns: Series of expected asset returns.
        covariance_matrix: Annualized covariance matrix.
        risk_free_rate: Annualized risk-free rate.

    Returns:
        float: Portfolio Sharpe ratio, or NaN if volatility is zero.
    """
    p_return = calculate_portfolio_return(weights, expected_returns)
    p_volatility = calculate_portfolio_volatility(weights, covariance_matrix)
    
    if p_volatility == 0:
        return np.nan
        
    return (p_return - risk_free_rate) / p_volatility

def equal_weight_portfolio(asset_names: list[str]) -> pd.Series:
    """Create an equal-weighted portfolio.

    Args:
        asset_names: List of asset names.

    Returns:
        pd.Series: Equal weights for each asset.
    """
    n_assets = len(asset_names)
    weight = 1.0 / n_assets
    return pd.Series([weight] * n_assets, index=asset_names)

def minimum_variance_portfolio(
    expected_returns: pd.Series,
    covariance_matrix: pd.DataFrame,
    max_weight: float = 1.0,
    long_only: bool = True
) -> dict:
    """Calculate the minimum variance portfolio.

    Args:
        expected_returns: Series of expected asset returns.
        covariance_matrix: Annualized covariance matrix.
        max_weight: Maximum weight allowed per asset.
        long_only: If True, weights must be >= 0.

    Returns:
        dict: Optimization results containing weights, return, vol, sharpe, success status.
    """
    n_assets = len(expected_returns)
    initial_weights = np.array([1.0 / n_assets] * n_assets)
    
    bounds = tuple((0.0 if long_only else -1.0, max_weight) for _ in range(n_assets))
    constraints = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
    
    def objective(w):
        return calculate_portfolio_volatility(w, covariance_matrix)
        
    result = minimize(
        objective,
        initial_weights,
        method='SLSQP',
        bounds=bounds,
        constraints=constraints
    )
    
    weights_series = pd.Series(result.x, index=expected_returns.index)
    ret = calculate_portfolio_return(result.x, expected_returns)
    vol = calculate_portfolio_volatility(result.x, covariance_matrix)
    sharpe = calculate_portfolio_sharpe_ratio(result.x, expected_returns, covariance_matrix)
    
    return {
        "weights": weights_series,
        "expected_return": ret,
        "volatility": vol,
        "sharpe_ratio": sharpe,
        "success": result.success,
        "message": result.message
    }

def maximum_sharpe_portfolio(
    expected_returns: pd.Series,
    covariance_matrix: pd.DataFrame,
    risk_free_rate: float = 0.05,
    max_weight: float = 1.0,
    long_only: bool = True
) -> dict:
    """Calculate the maximum Sharpe ratio portfolio.

    Args:
        expected_returns: Series of expected asset returns.
        covariance_matrix: Annualized covariance matrix.
        risk_free_rate: Annualized risk-free rate.
        max_weight: Maximum weight allowed per asset.
        long_only: If True, weights must be >= 0.

    Returns:
        dict: Optimization results containing weights, return, vol, sharpe, success status.
    """
    n_assets = len(expected_returns)
    initial_weights = np.array([1.0 / n_assets] * n_assets)
    
    bounds = tuple((0.0 if long_only else -1.0, max_weight) for _ in range(n_assets))
    constraints = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
    
    def objective(w):
        sr = calculate_portfolio_sharpe_ratio(w, expected_returns, covariance_matrix, risk_free_rate)
        return -sr if not np.isnan(sr) else 999.0
        
    result = minimize(
        objective,
        initial_weights,
        method='SLSQP',
        bounds=bounds,
        constraints=constraints
    )
    
    weights_series = pd.Series(result.x, index=expected_returns.index)
    ret = calculate_portfolio_return(result.x, expected_returns)
    vol = calculate_portfolio_volatility(result.x, covariance_matrix)
    sharpe = calculate_portfolio_sharpe_ratio(result.x, expected_returns, covariance_matrix, risk_free_rate)
    
    return {
        "weights": weights_series,
        "expected_return": ret,
        "volatility": vol,
        "sharpe_ratio": sharpe,
        "success": result.success,
        "message": result.message
    }

def calculate_efficient_frontier(
    expected_returns: pd.Series,
    covariance_matrix: pd.DataFrame,
    n_portfolios: int = 50,
    max_weight: float = 1.0,
    long_only: bool = True
) -> pd.DataFrame:
    """Calculate points along the efficient frontier.

    Args:
        expected_returns: Series of expected asset returns.
        covariance_matrix: Annualized covariance matrix.
        n_portfolios: Number of portfolios to simulate on the frontier.
        max_weight: Maximum weight allowed per asset.
        long_only: If True, weights must be >= 0.

    Returns:
        pd.DataFrame: DataFrame containing target return, volatility, sharpe, and weights.
    """
    n_assets = len(expected_returns)
    min_ret = expected_returns.min()
    max_ret = expected_returns.max()
    
    target_returns = np.linspace(min_ret, max_ret, n_portfolios)
    frontier_results = []
    
    initial_weights = np.array([1.0 / n_assets] * n_assets)
    bounds = tuple((0.0 if long_only else -1.0, max_weight) for _ in range(n_assets))
    
    for target in target_returns:
        constraints = (
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0},
            {'type': 'eq', 'fun': lambda w: calculate_portfolio_return(w, expected_returns) - target}
        )
        
        def objective(w):
            return calculate_portfolio_volatility(w, covariance_matrix)
            
        result = minimize(
            objective,
            initial_weights,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints
        )
        
        if result.success:
            vol = calculate_portfolio_volatility(result.x, covariance_matrix)
            sr = calculate_portfolio_sharpe_ratio(result.x, expected_returns, covariance_matrix)
            frontier_results.append({
                "target_return": target,
                "volatility": vol,
                "sharpe_ratio": sr,
                "weights": result.x
            })
            
    return pd.DataFrame(frontier_results)

def calculate_risk_contribution(
    weights: np.ndarray,
    covariance_matrix: pd.DataFrame
) -> pd.DataFrame:
    """Calculate the risk contribution of each asset in the portfolio.

    Args:
        weights: Array of asset weights.
        covariance_matrix: Annualized covariance matrix.

    Returns:
        pd.DataFrame: DataFrame detailing marginal, component, and percentage risk contributions.
    """
    weights = np.array(weights)
    portfolio_volatility = calculate_portfolio_volatility(weights, covariance_matrix)
    
    marginal_contribution = np.dot(covariance_matrix, weights) / portfolio_volatility
    component_contribution = weights * marginal_contribution
    percentage_contribution = component_contribution / portfolio_volatility
    
    return pd.DataFrame({
        "asset": covariance_matrix.columns,
        "weight": weights,
        "marginal_risk_contribution": marginal_contribution,
        "component_risk_contribution": component_contribution,
        "percentage_risk_contribution": percentage_contribution
    })

def risk_parity_portfolio(
    covariance_matrix: pd.DataFrame,
    max_weight: float = 1.0,
    long_only: bool = True
) -> dict:
    """Calculate the risk parity portfolio (equal risk contribution).

    Args:
        covariance_matrix: Annualized covariance matrix.
        max_weight: Maximum weight allowed per asset.
        long_only: If True, weights must be >= 0.

    Returns:
        dict: Optimization results containing weights, vol, risk contribution, success status.
    """
    n_assets = len(covariance_matrix)
    initial_weights = np.array([1.0 / n_assets] * n_assets)
    target_risk = 1.0 / n_assets
    
    bounds = tuple((0.0 if long_only else -1.0, max_weight) for _ in range(n_assets))
    constraints = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0})
    
    def objective(w):
        rc_df = calculate_risk_contribution(w, covariance_matrix)
        pct_rc = rc_df["percentage_risk_contribution"].values
        return np.sum((pct_rc - target_risk) ** 2)
        
    result = minimize(
        objective,
        initial_weights,
        method='SLSQP',
        bounds=bounds,
        constraints=constraints
    )
    
    weights_series = pd.Series(result.x, index=covariance_matrix.columns)
    vol = calculate_portfolio_volatility(result.x, covariance_matrix)
    rc_df = calculate_risk_contribution(result.x, covariance_matrix)
    
    return {
        "weights": weights_series,
        "expected_return": np.nan,
        "volatility": vol,
        "risk_contribution": rc_df,
        "success": result.success,
        "message": result.message
    }

def calculate_portfolio_performance_summary(
    weights: pd.Series,
    expected_returns: pd.Series,
    covariance_matrix: pd.DataFrame,
    risk_free_rate: float = 0.05
) -> dict:
    """Generate a summary of portfolio performance metrics.

    Args:
        weights: Series of asset weights.
        expected_returns: Series of expected returns.
        covariance_matrix: Annualized covariance matrix.
        risk_free_rate: Annualized risk-free rate.

    Returns:
        dict: Summary containing return, vol, sharpe, number of assets, and largest/smallest holdings.
    """
    w_array = weights.values
    ret = calculate_portfolio_return(w_array, expected_returns)
    vol = calculate_portfolio_volatility(w_array, covariance_matrix)
    sharpe = calculate_portfolio_sharpe_ratio(w_array, expected_returns, covariance_matrix, risk_free_rate)
    
    largest_weight_idx = weights.argmax()
    smallest_weight_idx = weights.argmin()
    
    return {
        "expected_return": ret,
        "volatility": vol,
        "sharpe_ratio": sharpe,
        "num_assets": len(weights),
        "largest_weight_asset": weights.index[largest_weight_idx],
        "largest_weight": float(weights.iloc[largest_weight_idx]),
        "smallest_weight_asset": weights.index[smallest_weight_idx],
        "smallest_weight": float(weights.iloc[smallest_weight_idx])
    }

def compare_portfolios(
    expected_returns: pd.Series,
    covariance_matrix: pd.DataFrame,
    risk_free_rate: float = 0.05,
    max_weight: float = 1.0
) -> pd.DataFrame:
    """Compare multiple portfolio optimization strategies.

    Args:
        expected_returns: Series of expected returns.
        covariance_matrix: Annualized covariance matrix.
        risk_free_rate: Annualized risk-free rate.
        max_weight: Maximum weight allowed per asset.

    Returns:
        pd.DataFrame: Comparison of Equal Weight, Minimum Variance, Maximum Sharpe, and Risk Parity.
    """
    asset_names = list(expected_returns.index)
    
    # Equal Weight
    ew_weights = equal_weight_portfolio(asset_names)
    ew_summary = calculate_portfolio_performance_summary(ew_weights, expected_returns, covariance_matrix, risk_free_rate)
    ew_summary["portfolio"] = "Equal Weight"
    
    # Minimum Variance
    mv_res = minimum_variance_portfolio(expected_returns, covariance_matrix, max_weight)
    if mv_res["success"]:
        mv_summary = calculate_portfolio_performance_summary(mv_res["weights"], expected_returns, covariance_matrix, risk_free_rate)
    else:
        mv_summary = {"expected_return": np.nan, "volatility": np.nan, "sharpe_ratio": np.nan, 
                      "largest_weight_asset": None, "largest_weight": np.nan}
    mv_summary["portfolio"] = "Minimum Variance"
    
    # Maximum Sharpe
    ms_res = maximum_sharpe_portfolio(expected_returns, covariance_matrix, risk_free_rate, max_weight)
    if ms_res["success"]:
        ms_summary = calculate_portfolio_performance_summary(ms_res["weights"], expected_returns, covariance_matrix, risk_free_rate)
    else:
        ms_summary = {"expected_return": np.nan, "volatility": np.nan, "sharpe_ratio": np.nan, 
                      "largest_weight_asset": None, "largest_weight": np.nan}
    ms_summary["portfolio"] = "Maximum Sharpe"
    
    # Risk Parity
    rp_res = risk_parity_portfolio(covariance_matrix, max_weight)
    if rp_res["success"]:
        rp_summary = calculate_portfolio_performance_summary(rp_res["weights"], expected_returns, covariance_matrix, risk_free_rate)
    else:
        rp_summary = {"expected_return": np.nan, "volatility": np.nan, "sharpe_ratio": np.nan, 
                      "largest_weight_asset": None, "largest_weight": np.nan}
    rp_summary["portfolio"] = "Risk Parity"
    
    df = pd.DataFrame([ew_summary, mv_summary, ms_summary, rp_summary])
    columns_order = ["portfolio", "expected_return", "volatility", "sharpe_ratio", "largest_weight_asset", "largest_weight"]
    return df[columns_order]
