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


def clean_returns(returns: pd.Series) -> pd.Series:
    """Return a clean copy of a returns series.

    Replaces ``+inf`` / ``-inf`` with ``NaN`` (these appear when a price was 0
    and a division blew up) and drops every missing value. Many metrics call
    this first so a single bad row cannot poison a mean, std, or covariance.

    Parameters
    ----------
    returns:
        Series of returns (simple or log).

    Returns
    -------
    pandas.Series
        The same values with infinities and NaNs removed.
    """
    if not isinstance(returns, pd.Series):
        raise TypeError("returns must be a pandas Series.")
    return returns.replace([np.inf, -np.inf], np.nan).dropna()


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


def calculate_daily_volatility(returns: pd.Series) -> float:
    """Daily volatility: the (sample) standard deviation of daily returns.

    Parameters
    ----------
    returns:
        Series of daily returns (simple or log).

    Returns
    -------
    float
        Daily volatility as a decimal. ``0.0`` if there are fewer than two
        valid observations.
    """
    clean = clean_returns(returns)
    if clean.shape[0] < 2:
        return 0.0
    return float(clean.std(ddof=1))


def _years_between(start: pd.Timestamp, end: pd.Timestamp) -> float:
    """Number of calendar years between two timestamps (using 365.25 days/year)."""
    days = (end - start).days
    return days / 365.25


def calculate_cagr(
    df: pd.DataFrame,
    price_col: str = "Close",
    date_col: str = "Date",
) -> float:
    """Compound Annual Growth Rate (CAGR) from a price DataFrame.

    Formula
    -------
    ``CAGR = (Ending Value / Beginning Value) ** (1 / years) - 1``

    CAGR is the single constant yearly rate that would grow the first price into
    the last price - the "smoothed" annual return that ignores the bumps along
    the way.

    Parameters
    ----------
    df:
        Frame containing ``price_col`` and ``date_col``.
    price_col, date_col:
        Column names for price and date.

    Returns
    -------
    float
        CAGR as a decimal (e.g. ``0.18`` = 18%/yr). ``np.nan`` if it cannot be
        computed (missing columns, empty, non-positive prices, or zero span).
    """
    if df is None or len(df) < 2 or price_col not in df.columns or date_col not in df.columns:
        return np.nan

    work = df[[date_col, price_col]].dropna().copy()
    work[date_col] = pd.to_datetime(work[date_col], errors="coerce")
    work = work.dropna(subset=[date_col]).sort_values(date_col)
    if len(work) < 2:
        return np.nan

    begin_value = float(work[price_col].iloc[0])
    end_value = float(work[price_col].iloc[-1])
    years = _years_between(work[date_col].iloc[0], work[date_col].iloc[-1])

    if begin_value <= 0 or years <= 0:
        return np.nan
    return (end_value / begin_value) ** (1.0 / years) - 1.0


def _cagr_from_price_series(
    prices: pd.Series,
    trading_days: int = config.TRADING_DAYS_PER_YEAR,
) -> float:
    """CAGR from a price Series, using its index for the time span when possible.

    If the index is a ``DatetimeIndex`` the real elapsed years are used; otherwise
    the year span is approximated as ``len(prices) / trading_days``.
    """
    clean = prices.dropna()
    if clean.shape[0] < 2:
        return np.nan

    begin_value = float(clean.iloc[0])
    end_value = float(clean.iloc[-1])
    if begin_value <= 0:
        return np.nan

    if isinstance(clean.index, pd.DatetimeIndex):
        years = _years_between(clean.index[0], clean.index[-1])
    else:
        years = clean.shape[0] / trading_days

    if years <= 0:
        years = clean.shape[0] / trading_days
    if years <= 0:
        return np.nan
    return (end_value / begin_value) ** (1.0 / years) - 1.0


def calculate_downside_deviation(
    returns: pd.Series,
    target_return: float = 0.0,
    trading_days: int = config.TRADING_DAYS_PER_YEAR,
    annualize: bool = True,
) -> float:
    """Downside deviation: volatility of only the returns below ``target_return``.

    Unlike standard deviation (which treats upside and downside the same),
    downside deviation measures only the "bad" volatility investors fear. It is
    the denominator of the Sortino ratio.

    Formula
    -------
    ``DD = sqrt(mean( (min(0, r - target))^2 ))``  (then optionally * sqrt(252))

    Parameters
    ----------
    returns:
        Series of daily returns.
    target_return:
        Minimum acceptable daily return; only returns *below* this count as
        downside. Defaults to ``0.0``.
    trading_days:
        Trading days per year (for annualisation).
    annualize:
        If ``True`` (default), scale by ``sqrt(trading_days)``.

    Returns
    -------
    float
        Downside deviation as a decimal. ``0.0`` if there is no downside.
    """
    clean = clean_returns(returns)
    downside = clean[clean < target_return] - target_return
    if downside.shape[0] < 1:
        return 0.0
    dd = float(np.sqrt(np.mean(np.square(downside))))
    if annualize:
        dd *= np.sqrt(trading_days)
    return dd


def calculate_sharpe_ratio(
    returns: pd.Series,
    risk_free_rate: float = 0.05,
    trading_days: int = config.TRADING_DAYS_PER_YEAR,
) -> float:
    """Sharpe ratio: excess annual return per unit of total volatility.

    Formula
    -------
    ``Annual Return = mean(daily) * 252``
    ``Annual Volatility = std(daily) * sqrt(252)``
    ``Sharpe = (Annual Return - Risk Free Rate) / Annual Volatility``

    Higher is better: more reward per unit of risk. Returns ``np.nan`` when
    volatility is zero (the ratio is undefined).

    Parameters
    ----------
    returns:
        Series of daily returns.
    risk_free_rate:
        Annual risk-free rate (decimal), default ``0.05`` (5%).
    trading_days:
        Trading days per year.
    """
    clean = clean_returns(returns)
    if clean.shape[0] < 2:
        return np.nan

    annual_return = float(clean.mean()) * trading_days
    annual_volatility = float(clean.std(ddof=1)) * np.sqrt(trading_days)
    if annual_volatility == 0:
        return np.nan
    return (annual_return - risk_free_rate) / annual_volatility


def calculate_sortino_ratio(
    returns: pd.Series,
    risk_free_rate: float = 0.05,
    target_return: float = 0.0,
    trading_days: int = config.TRADING_DAYS_PER_YEAR,
) -> float:
    """Sortino ratio: excess annual return per unit of *downside* volatility.

    Formula
    -------
    ``Annual Return = mean(daily) * 252``
    ``Sortino = (Annual Return - Risk Free Rate) / Downside Deviation``

    Like Sharpe, but it only penalises downside risk - so a fund that is volatile
    only on the way up is not punished. Returns ``np.nan`` when downside
    deviation is zero.

    Parameters
    ----------
    returns:
        Series of daily returns.
    risk_free_rate:
        Annual risk-free rate (decimal), default ``0.05``.
    target_return:
        Daily minimum acceptable return used for the downside calculation.
    trading_days:
        Trading days per year.
    """
    clean = clean_returns(returns)
    if clean.shape[0] < 2:
        return np.nan

    annual_return = float(clean.mean()) * trading_days
    downside_deviation = calculate_downside_deviation(
        clean, target_return=target_return, trading_days=trading_days, annualize=True
    )
    if downside_deviation == 0:
        return np.nan
    return (annual_return - risk_free_rate) / downside_deviation


def calculate_beta(
    asset_returns: pd.Series,
    benchmark_returns: pd.Series,
) -> float:
    """Beta: an asset's sensitivity to its benchmark (market).

    Formula
    -------
    ``Beta = Cov(asset, benchmark) / Var(benchmark)``

    Interpretation: beta = 1 moves with the market; beta > 1 amplifies market
    moves; beta < 1 is more defensive; beta < 0 moves opposite the market.

    The two series are aligned by their (date) index and missing values are
    dropped before the calculation. Returns ``np.nan`` if there is insufficient
    overlap or the benchmark has zero variance.

    Parameters
    ----------
    asset_returns:
        Series of the asset's daily returns (indexed by date).
    benchmark_returns:
        Series of the benchmark's daily returns (indexed by date).
    """
    if not isinstance(asset_returns, pd.Series) or not isinstance(benchmark_returns, pd.Series):
        raise TypeError("asset_returns and benchmark_returns must be pandas Series.")

    # Align on the shared index and drop any rows missing on either side.
    combined = pd.concat(
        [asset_returns.rename("asset"), benchmark_returns.rename("benchmark")],
        axis=1,
        join="inner",
    )
    combined = combined.replace([np.inf, -np.inf], np.nan).dropna()
    if combined.shape[0] < 2:
        return np.nan

    benchmark_var = float(combined["benchmark"].var(ddof=1))
    if benchmark_var == 0:
        return np.nan
    covariance = float(combined["asset"].cov(combined["benchmark"]))
    return covariance / benchmark_var


def calculate_capm_expected_return(
    beta: float,
    market_return: float,
    risk_free_rate: float = 0.05,
) -> float:
    """CAPM expected return for an asset.

    Formula
    -------
    ``Expected Return = Risk Free Rate + Beta * (Market Return - Risk Free Rate)``

    The Capital Asset Pricing Model says an asset should earn the risk-free rate
    plus a premium proportional to how much market risk (beta) it carries.

    Parameters
    ----------
    beta:
        The asset's beta vs the market.
    market_return:
        The market's expected/observed annual return (decimal).
    risk_free_rate:
        Annual risk-free rate (decimal), default ``0.05``.

    Returns
    -------
    float
        Expected annual return as a decimal, or ``np.nan`` if ``beta`` or
        ``market_return`` is missing.
    """
    if beta is None or market_return is None:
        return np.nan
    if isinstance(beta, float) and np.isnan(beta):
        return np.nan
    if isinstance(market_return, float) and np.isnan(market_return):
        return np.nan
    return risk_free_rate + beta * (market_return - risk_free_rate)


def calculate_summary_statistics(
    prices: pd.Series,
    benchmark_prices: pd.Series | None = None,
    trading_days: int = config.TRADING_DAYS_PER_YEAR,
    risk_free_rate: float = 0.05,
) -> dict[str, float]:
    """Compute a dictionary of headline statistics for a price series.

    Parameters
    ----------
    prices:
        Series of (adjusted) prices, ideally indexed by date.
    benchmark_prices:
        Optional benchmark price series (indexed by date) used to compute
        ``beta`` and ``capm_expected_return``. If ``None`` (default), those two
        values are ``np.nan``.
    trading_days:
        Trading days per year, for annualisation.
    risk_free_rate:
        Annualised risk-free rate (decimal) used in Sharpe/Sortino/CAPM.

    Returns
    -------
    dict[str, float]
        Keys include ``observations``, ``start_price``, ``end_price``,
        ``latest_close``, ``total_return``, ``cagr``, ``average_daily_return``,
        ``annualized_return``, ``annualized_volatility``, ``sharpe_ratio``,
        ``sortino_ratio``, ``max_drawdown``, ``best_day``, ``worst_day``,
        ``beta``, ``capm_expected_return``.
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
    annualized_volatility = calculate_annualized_volatility(simple_returns, trading_days)

    # Risk-adjusted ratios use the dedicated, edge-case-safe helpers.
    sharpe_ratio = calculate_sharpe_ratio(simple_returns, risk_free_rate, trading_days)
    sortino_ratio = calculate_sortino_ratio(simple_returns, risk_free_rate, 0.0, trading_days)

    cagr = _cagr_from_price_series(prices, trading_days)
    max_dd = calculate_max_drawdown(prices)

    # Beta + CAPM require a benchmark; otherwise they are NaN.
    beta = np.nan
    capm_expected_return = np.nan
    if benchmark_prices is not None and not benchmark_prices.dropna().empty:
        benchmark_returns = calculate_simple_returns(benchmark_prices.dropna()).dropna()
        beta = calculate_beta(simple_returns, benchmark_returns)
        market_return = _cagr_from_price_series(benchmark_prices, trading_days)
        capm_expected_return = calculate_capm_expected_return(beta, market_return, risk_free_rate)

    return {
        "observations": float(n_obs),
        "start_price": start_price,
        "end_price": end_price,
        "latest_close": end_price,
        "total_return": total_return,
        "cagr": cagr,
        "average_daily_return": calculate_average_daily_return(simple_returns),
        "annualized_return": annualized_return,
        "annualized_volatility": annualized_volatility,
        "sharpe_ratio": sharpe_ratio,
        "sortino_ratio": sortino_ratio,
        "max_drawdown": max_dd,
        "best_day": calculate_best_day(simple_returns),
        "worst_day": calculate_worst_day(simple_returns),
        "beta": beta,
        "capm_expected_return": capm_expected_return,
    }
