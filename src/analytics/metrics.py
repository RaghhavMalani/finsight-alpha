"""Financial analytics.

A small, well-tested library of the core metrics every quant workflow needs:
returns (simple & log), cumulative returns, rolling volatility, drawdown, and a
summary-statistics helper.

Design choices
--------------
* Every function accepts a :class:`pandas.Series` of **prices** or **returns**
  (documented per function) and returns a new Series/scalar - inputs are never
  mutated.
* NumPy is used for the heavy lifting so the functions are fast and vectorised.
* Annualisation uses the trading-day convention from :mod:`src.config`.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src import config


def calculate_simple_returns(prices: pd.Series) -> pd.Series:
    """Simple (arithmetic) period-over-period returns.

    Formula
    -------
    ``R_t = P_t / P_{t-1} - 1``

    Parameters
    ----------
    prices:
        Series of prices indexed by date.

    Returns
    -------
    pandas.Series
        Simple returns. The first observation is ``NaN`` because there is no
        prior price to compare against.
    """
    if not isinstance(prices, pd.Series):
        raise TypeError("prices must be a pandas Series.")
    # pct_change is exactly P_t / P_{t-1} - 1.
    return prices.pct_change()


def calculate_log_returns(prices: pd.Series) -> pd.Series:
    """Log (continuously compounded) returns.

    Formula
    -------
    ``r_t = ln(P_t / P_{t-1})``

    Log returns are additive across time and approximately normal, which is why
    they are preferred for statistical modelling (GBM, Black-Scholes, VaR).

    Parameters
    ----------
    prices:
        Series of prices indexed by date.

    Returns
    -------
    pandas.Series
        Log returns. The first observation is ``NaN``.
    """
    if not isinstance(prices, pd.Series):
        raise TypeError("prices must be a pandas Series.")
    if (prices <= 0).any():
        raise ValueError("Prices must be strictly positive to take a logarithm.")
    # ln(P_t / P_{t-1}) == ln(P_t) - ln(P_{t-1}); the shift gives the ratio.
    return np.log(prices / prices.shift(1))


def calculate_cumulative_returns(returns: pd.Series) -> pd.Series:
    """Cumulative (compounded) growth from a series of simple returns.

    Formula
    -------
    ``C_t = prod(1 + R_i) - 1`` for ``i = 1..t``

    Parameters
    ----------
    returns:
        Series of **simple** returns (e.g. from :func:`calculate_simple_returns`).

    Returns
    -------
    pandas.Series
        Cumulative return at each point in time. ``0.5`` means +50% since the
        start. ``NaN`` returns are treated as 0% for that period so the running
        product is not broken by the leading ``NaN``.
    """
    if not isinstance(returns, pd.Series):
        raise TypeError("returns must be a pandas Series.")
    # Treat missing periods as flat (0%) so the compounding chain stays intact.
    growth_factors = (1.0 + returns.fillna(0.0)).cumprod()
    return growth_factors - 1.0


def calculate_rolling_volatility(
    returns: pd.Series,
    window: int = config.DEFAULT_VOLATILITY_WINDOW,
    annualize: bool = True,
    trading_days: int = config.TRADING_DAYS_PER_YEAR,
) -> pd.Series:
    """Rolling standard deviation of returns (i.e. volatility).

    Parameters
    ----------
    returns:
        Series of returns (simple or log).
    window:
        Number of periods in the rolling window (default ~1 trading month).
    annualize:
        If ``True``, scale daily volatility to an annual figure by multiplying
        by ``sqrt(trading_days)``.
    trading_days:
        Trading days per year used for annualisation.

    Returns
    -------
    pandas.Series
        Rolling volatility. The first ``window - 1`` values are ``NaN``.
    """
    if not isinstance(returns, pd.Series):
        raise TypeError("returns must be a pandas Series.")
    if window < 2:
        raise ValueError("window must be at least 2 to compute a std deviation.")

    # ddof=1 -> sample standard deviation (the unbiased estimator).
    rolling_std = returns.rolling(window=window).std(ddof=1)
    if annualize:
        # Volatility scales with the square root of time (variance scales linearly).
        rolling_std = rolling_std * np.sqrt(trading_days)
    return rolling_std


def calculate_drawdown(prices: pd.Series) -> pd.Series:
    """Drawdown series: percentage decline from the running peak.

    Formula
    -------
    ``DD_t = (P_t - running_max(P)_t) / running_max(P)_t``

    Parameters
    ----------
    prices:
        Series of prices (or any cumulative value series, e.g. equity curve).

    Returns
    -------
    pandas.Series
        Drawdown at each point, always ``<= 0``. ``-0.2`` means 20% below the
        prior peak.
    """
    if not isinstance(prices, pd.Series):
        raise TypeError("prices must be a pandas Series.")
    # The highest price seen up to and including each point in time.
    running_peak = prices.cummax()
    return (prices - running_peak) / running_peak


def calculate_max_drawdown(prices: pd.Series) -> float:
    """Maximum drawdown: the worst peak-to-trough decline in the series.

    Parameters
    ----------
    prices:
        Series of prices (or an equity curve).

    Returns
    -------
    float
        The most negative drawdown value (e.g. ``-0.55`` for a 55% loss). Returns
        ``0.0`` if the series only ever rises.
    """
    if not isinstance(prices, pd.Series):
        raise TypeError("prices must be a pandas Series.")
    drawdown = calculate_drawdown(prices)
    if drawdown.empty:
        return 0.0
    # The minimum of the drawdown series is the deepest trough = max drawdown.
    return float(drawdown.min())


def calculate_annualized_volatility(
    returns: pd.Series,
    trading_days: int = config.TRADING_DAYS_PER_YEAR,
) -> float:
    """Annualised volatility from a series of (daily) returns.

    Formula
    -------
    ``sigma_annual = std(daily_returns) * sqrt(trading_days)``

    Parameters
    ----------
    returns:
        Series of daily returns (simple or log).
    trading_days:
        Trading days per year used for annualisation.

    Returns
    -------
    float
        Annualised volatility as a decimal (e.g. ``0.25`` = 25%). Returns ``0.0``
        if there are fewer than two observations.
    """
    if not isinstance(returns, pd.Series):
        raise TypeError("returns must be a pandas Series.")
    clean = returns.dropna()
    if clean.shape[0] < 2:
        return 0.0
    return float(clean.std(ddof=1) * np.sqrt(trading_days))


def calculate_total_return(prices: pd.Series) -> float:
    """Total (cumulative) return over the whole price series.

    Formula
    -------
    ``total_return = P_last / P_first - 1``

    Parameters
    ----------
    prices:
        Series of prices.

    Returns
    -------
    float
        Total return as a decimal (e.g. ``2.3`` = +230%).
    """
    if not isinstance(prices, pd.Series):
        raise TypeError("prices must be a pandas Series.")
    clean = prices.dropna()
    if clean.empty:
        raise ValueError("Cannot compute total return of an empty price series.")
    return float(clean.iloc[-1] / clean.iloc[0] - 1.0)


def calculate_average_daily_return(returns: pd.Series) -> float:
    """Average (mean) daily return.

    Parameters
    ----------
    returns:
        Series of daily returns (simple or log).

    Returns
    -------
    float
        The arithmetic mean of the returns as a decimal. ``0.0`` if there is no
        valid observation.
    """
    if not isinstance(returns, pd.Series):
        raise TypeError("returns must be a pandas Series.")
    clean = returns.dropna()
    if clean.empty:
        return 0.0
    return float(clean.mean())


def calculate_best_day(returns: pd.Series) -> float:
    """The single best daily return in the series.

    Parameters
    ----------
    returns:
        Series of daily returns.

    Returns
    -------
    float
        The maximum daily return as a decimal (e.g. ``0.08`` = +8%). ``0.0`` if
        there is no valid observation.
    """
    if not isinstance(returns, pd.Series):
        raise TypeError("returns must be a pandas Series.")
    clean = returns.dropna()
    if clean.empty:
        return 0.0
    return float(clean.max())


def calculate_worst_day(returns: pd.Series) -> float:
    """The single worst daily return in the series.

    Parameters
    ----------
    returns:
        Series of daily returns.

    Returns
    -------
    float
        The minimum daily return as a decimal (e.g. ``-0.09`` = -9%). ``0.0`` if
        there is no valid observation.
    """
    if not isinstance(returns, pd.Series):
        raise TypeError("returns must be a pandas Series.")
    clean = returns.dropna()
    if clean.empty:
        return 0.0
    return float(clean.min())


def calculate_summary_statistics(
    prices: pd.Series,
    trading_days: int = config.TRADING_DAYS_PER_YEAR,
    risk_free_rate: float = config.RISK_FREE_RATE,
) -> dict[str, float]:
    """Compute a dictionary of headline statistics for a price series.

    Parameters
    ----------
    prices:
        Series of (adjusted) prices.
    trading_days:
        Trading days per year, for annualisation.
    risk_free_rate:
        Annualised risk-free rate (decimal) used in the Sharpe ratio.

    Returns
    -------
    dict[str, float]
        Keys: ``observations``, ``start_price``, ``end_price``,
        ``total_return``, ``annualized_return``, ``annualized_volatility``,
        ``sharpe_ratio``, ``max_drawdown``.
    """
    if not isinstance(prices, pd.Series):
        raise TypeError("prices must be a pandas Series.")

    prices = prices.dropna()
    if prices.empty:
        raise ValueError("Cannot summarise an empty price series.")

    simple_returns = calculate_simple_returns(prices).dropna()
    n_obs = int(prices.shape[0])

    start_price = float(prices.iloc[0])
    end_price = float(prices.iloc[-1])
    total_return = end_price / start_price - 1.0

    # Geometric annualised return: scale total growth by years elapsed.
    years = max(n_obs / trading_days, 1e-9)  # guard against divide-by-zero
    annualized_return = (1.0 + total_return) ** (1.0 / years) - 1.0

    # Annualised volatility from the daily standard deviation.
    daily_vol = float(simple_returns.std(ddof=1)) if simple_returns.shape[0] > 1 else 0.0
    annualized_volatility = daily_vol * np.sqrt(trading_days)

    # Sharpe ratio: excess annual return per unit of annual volatility.
    if annualized_volatility > 0:
        sharpe_ratio = (annualized_return - risk_free_rate) / annualized_volatility
    else:
        sharpe_ratio = 0.0

    max_dd = calculate_max_drawdown(prices)

    return {
        "observations": float(n_obs),
        "start_price": start_price,
        "end_price": end_price,
        "total_return": total_return,
        "annualized_return": annualized_return,
        "annualized_volatility": annualized_volatility,
        "sharpe_ratio": sharpe_ratio,
        "max_drawdown": max_dd,
        "average_daily_return": calculate_average_daily_return(simple_returns),
        "best_day": calculate_best_day(simple_returns),
        "worst_day": calculate_worst_day(simple_returns),
    }
