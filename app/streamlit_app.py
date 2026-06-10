"""FinSight Alpha - local-first professional market analytics dashboard.

A classy, finance-terminal-style Streamlit app. Everything runs locally: market
data is downloaded with yfinance, analytics are computed in-process, and results
are rendered with Plotly. No cloud, API, database, or keys required.

Run from the project root::

    streamlit run app/streamlit_app.py

Pages:
    1. Market Overview
    2. Single Asset Analysis
    3. Multi-Asset Comparison
    4. Correlation Heatmap
    5. Sector Comparison
    6. Risk Summary
    7. Data Quality Report
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the project root is importable when Streamlit runs this file directly.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
import numpy as np
import streamlit as st

from src import config
from src.analytics import (
    calculate_average_daily_return,
    calculate_best_day,
    calculate_correlation_matrix,
    calculate_data_quality_report,
    calculate_risk_summary,
    calculate_sector_summary,
    calculate_simple_returns,
    calculate_summary_statistics,
    calculate_worst_day,
    create_returns_pivot,
    find_highest_correlation_pair,
    find_lowest_correlation_pair,
)
from src.data import storage
from src.data.market_data import MarketDataService
from src.data.providers import ProviderError
from src.pricing import black_scholes
from src.simulation import monte_carlo
from src.risk import var_cvar, portfolio_optimization
from src.ml import features, targets, models, evaluation, walk_forward
from src import regime
from src.visualization import option_plots, plots, simulation_plots, portfolio_plots, ml_plots, regime_plots
from src.visualization.theme import apply_streamlit_theme

# ---------------------------------------------------------------------------
# Page configuration + theme
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="FinSight Alpha",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded",
)
st.markdown(apply_streamlit_theme(), unsafe_allow_html=True)

PAGES = [
    "Market Overview",
    "Single Asset Analysis",
    "Multi-Asset Comparison",
    "Correlation Heatmap",
    "Sector Comparison",
    "Risk Summary",
    "Data Quality Report",
    "Option Pricing Lab",
    "Monte Carlo Risk Lab",
    "Portfolio Optimization Lab",
    "Signal Research Lab",
    "Market Regime Lab",
    "AI Equity Research Terminal",
]

UNIVERSE_INDIAN = "Indian Market"
UNIVERSE_US = "US Market"
UNIVERSE_CUSTOM = "Custom Selection"


# ---------------------------------------------------------------------------
# Data loading (cached)
# ---------------------------------------------------------------------------
@st.cache_data(show_spinner=False)
def load_data(
    tickers: tuple[str, ...],
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Download a combined long-format OHLCV frame via :class:`MarketDataService`.

    Cached by argument value so switching pages never re-downloads. Tickers are
    passed as a tuple because Streamlit cache keys must be hashable.
    """
    service = MarketDataService("yfinance")
    return service.get_multiple(list(tickers), start_date, end_date, skip_errors=True)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _price_series(df: pd.DataFrame, ticker: str) -> pd.Series:
    """Date-indexed Close series for one ticker."""
    sub = df[df["Ticker"] == ticker].sort_values("Date")
    return pd.Series(sub["Close"].to_numpy(), index=pd.to_datetime(sub["Date"]), name=str(ticker))


def _benchmark_prices_for(ticker: str, benchmark_df: pd.DataFrame | None) -> pd.Series | None:
    """Date-indexed benchmark Close series for the given asset, or ``None``.

    The benchmark is chosen by :func:`config.get_default_benchmark_for_ticker`
    (Nifty ETF for ``.NS`` symbols, SPY otherwise). Returns ``None`` if benchmark
    data was not fetched, so beta/CAPM degrade gracefully to ``NaN``.
    """
    if benchmark_df is None or benchmark_df.empty:
        return None
    benchmark_ticker = config.get_default_benchmark_for_ticker(ticker)
    if benchmark_ticker not in set(benchmark_df["Ticker"].unique()):
        return None
    prices = _price_series(benchmark_df, benchmark_ticker).dropna()
    return prices if prices.shape[0] >= 2 else None


def _fmt_pct(x: float) -> str:
    try:
        if x is None or pd.isna(x):
            return "-"
        return f"{x * 100:,.2f}%"
    except (TypeError, ValueError):
        return "-"


def _fmt_num(x: float) -> str:
    try:
        if x is None or pd.isna(x):
            return "-"
        return f"{x:,.2f}"
    except (TypeError, ValueError):
        return "-"


def build_summary(
    df: pd.DataFrame,
    tickers: list[str],
    benchmark_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Per-ticker headline + risk-adjusted metrics used across several pages.

    Columns (numeric decimals unless noted): ``Ticker, Name, Sector, Benchmark,
    latest_close, total_return, cagr, annualized_volatility, sharpe_ratio,
    sortino_ratio, max_drawdown, beta, capm_expected_return``.

    Beta and CAPM require ``benchmark_df``; when it is missing they are ``NaN``.
    """
    rows: list[dict[str, object]] = []
    for t in tickers:
        prices = _price_series(df, t).dropna()
        if prices.shape[0] < 2:
            continue
        benchmark_prices = _benchmark_prices_for(t, benchmark_df)
        stats = calculate_summary_statistics(prices, benchmark_prices=benchmark_prices)
        rows.append(
            {
                "Ticker": t,
                "Name": config.get_display_name(t),
                "Sector": config.get_sector(t),
                "Benchmark": config.get_default_benchmark_for_ticker(t),
                "latest_close": stats["latest_close"],
                "total_return": stats["total_return"],
                "cagr": stats["cagr"],
                "annualized_volatility": stats["annualized_volatility"],
                "sharpe_ratio": stats["sharpe_ratio"],
                "sortino_ratio": stats["sortino_ratio"],
                "max_drawdown": stats["max_drawdown"],
                "beta": stats["beta"],
                "capm_expected_return": stats["capm_expected_return"],
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
def render_sidebar() -> dict[str, object]:
    """Render sidebar controls and return the chosen settings."""
    st.sidebar.markdown(
        "<div class='finsight-title'>FinSight Alpha</div>"
        "<div class='finsight-subtitle'>AI-Ready Quant Market Analytics Platform</div>",
        unsafe_allow_html=True,
    )

    page = st.sidebar.radio("Navigation", PAGES, index=0)

    st.sidebar.markdown("---")
    st.sidebar.subheader("Data Selection")

    universe = st.sidebar.selectbox(
        "Asset universe",
        options=[UNIVERSE_INDIAN, UNIVERSE_US, UNIVERSE_CUSTOM],
        index=2,
        help="Choose a market preset, or Custom to mix Indian + US symbols.",
    )
    if universe == UNIVERSE_INDIAN:
        options = config.INDIAN_TICKERS
        default = config.INDIAN_TICKERS[:5]
    elif universe == UNIVERSE_US:
        options = config.US_TICKERS
        default = config.US_TICKERS[:5]
    else:
        options = config.ALL_TICKERS
        default = config.DEFAULT_TICKERS

    tickers = st.sidebar.multiselect(
        "Tickers", options=options, default=default,
        help="Pick one or more symbols to analyze.",
    )

    single_ticker = st.sidebar.selectbox(
        "Focus Ticker (Single Asset / ML Lab)",
        options=tickers if tickers else options,
        help="Choose the ticker to analyze in the Single Asset and Signal Research Lab views."
    )

    today = pd.Timestamp.today().normalize()
    default_start = pd.Timestamp(config.DEFAULT_START_DATE)
    date_range = st.sidebar.date_input(
        "Date range",
        value=(default_start.date(), today.date()),
        help="Inclusive start, exclusive end.",
    )

    vol_window = st.sidebar.slider(
        "Rolling volatility window (days)",
        min_value=5, max_value=120, value=config.DEFAULT_VOLATILITY_WINDOW, step=5,
    )

    save_processed = st.sidebar.checkbox(
        "Save processed data locally", value=False,
        help="Write raw + processed CSVs to the data/ folder on load.",
    )

    load = st.sidebar.button("Load / Refresh Data", type="primary", use_container_width=True)

    # Normalize the date range to ISO strings.
    if isinstance(date_range, (tuple, list)) and len(date_range) == 2:
        start_date, end_date = str(date_range[0]), str(date_range[1])
    else:
        start_date, end_date = config.DEFAULT_START_DATE, config.DEFAULT_END_DATE

    # Export controls appear once data is loaded.
    _render_export_controls()

    st.sidebar.markdown("---")
    st.sidebar.caption("Local-first - no cloud, no API keys. Phase 2: Financial Math Engine.")

    return {
        "page": page,
        "universe": universe,
        "tickers": tickers,
        "single_ticker": single_ticker,
        "start_date": start_date,
        "end_date": end_date,
        "vol_window": vol_window,
        "save_processed": save_processed,
        "load": load,
    }


def _render_export_controls() -> None:
    """Sidebar export section: download CSVs and optionally save to data/exports/."""
    df = st.session_state.get("data")
    if df is None or df.empty:
        return

    tickers = st.session_state.get("loaded_tickers", [])
    benchmark_df = st.session_state.get("benchmark_data")
    summary = build_summary(df, tickers, benchmark_df)
    returns_pivot = create_returns_pivot(df)
    corr = calculate_correlation_matrix(returns_pivot)

    with st.sidebar.expander("Export data", expanded=False):
        st.download_button(
            "Download combined data (CSV)",
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="finsight_combined_data.csv",
            mime="text/csv",
            use_container_width=True,
        )
        if not summary.empty:
            st.download_button(
                "Download summary stats (CSV)",
                data=summary.to_csv(index=False).encode("utf-8"),
                file_name="finsight_summary_stats.csv",
                mime="text/csv",
                use_container_width=True,
            )
        if not corr.empty:
            st.download_button(
                "Download correlation matrix (CSV)",
                data=corr.to_csv().encode("utf-8"),
                file_name="finsight_correlation_matrix.csv",
                mime="text/csv",
                use_container_width=True,
            )
        if st.button("Save all exports to data/exports/", use_container_width=True):
            storage.export_to_csv(df, "finsight_combined_data.csv")
            if not summary.empty:
                storage.export_to_csv(summary, "finsight_summary_stats.csv")
            if not corr.empty:
                # Correlation matrix keeps its index (ticker labels).
                path = config.EXPORTS_DIR / "finsight_correlation_matrix.csv"
                config.ensure_data_dirs()
                corr.to_csv(path)
            st.success(f"Exports saved to {config.EXPORTS_DIR}")


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
def page_market_overview(df: pd.DataFrame, tickers: list[str], benchmark_df: pd.DataFrame | None = None) -> None:
    st.header("Market Overview")
    summary = build_summary(df, tickers, benchmark_df)
    if summary.empty:
        st.warning("No valid data to summarize for the current selection.")
        return

    best = summary.sort_values("total_return", ascending=False).iloc[0]
    worst = summary.sort_values("total_return", ascending=True).iloc[0]
    avg_vol = summary["annualized_volatility"].mean()
    worst_dd = summary["max_drawdown"].min()

    c1, c2, c3 = st.columns(3)
    c1.metric("Selected Assets", f"{len(summary)}")
    c2.metric("Avg Annualized Volatility", _fmt_pct(avg_vol))
    c3.metric("Worst Max Drawdown", _fmt_pct(worst_dd))

    c4, c5 = st.columns(2)
    c4.metric(f"Best Performer - {best['Ticker']}", _fmt_pct(best["total_return"]))
    c5.metric(f"Worst Performer - {worst['Ticker']}", _fmt_pct(worst["total_return"]))

    start = pd.to_datetime(df["Date"]).min().date()
    end = pd.to_datetime(df["Date"]).max().date()
    st.caption(f"Date range: {start} to {end}")

    st.markdown("---")
    st.plotly_chart(plots.plot_normalized_price_comparison(df), use_container_width=True)
    st.plotly_chart(plots.plot_cumulative_return_comparison(df), use_container_width=True)
    st.plotly_chart(plots.plot_risk_return_scatter(summary), use_container_width=True)


def page_single_asset(
    df: pd.DataFrame,
    tickers: list[str],
    default_ticker: str,
    vol_window: int,
    benchmark_df: pd.DataFrame | None = None,
) -> None:
    st.header("Single Asset Analysis")
    if not tickers:
        st.warning("No tickers loaded.")
        return

    index = tickers.index(default_ticker) if default_ticker in tickers else 0
    ticker = st.selectbox("Ticker", options=tickers, index=index)

    prices = _price_series(df, ticker).dropna()
    if prices.shape[0] < 2:
        st.warning(f"Not enough data for {ticker}.")
        return

    returns = calculate_simple_returns(prices)
    benchmark_prices = _benchmark_prices_for(ticker, benchmark_df)
    stats = calculate_summary_statistics(prices, benchmark_prices=benchmark_prices)
    benchmark_ticker = config.get_default_benchmark_for_ticker(ticker)

    st.subheader(f"{config.get_display_name(ticker)} ({ticker}) - {config.get_sector(ticker)}")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Latest Close", _fmt_num(stats["latest_close"]))
    c2.metric("Total Return", _fmt_pct(stats["total_return"]))
    c3.metric("CAGR", _fmt_pct(stats["cagr"]))
    c4.metric("Annualized Volatility", _fmt_pct(stats["annualized_volatility"]))

    # Phase 2 risk-adjusted KPIs.
    c5, c6, c7, c8 = st.columns(4)
    c5.metric("Sharpe Ratio", _fmt_num(stats["sharpe_ratio"]))
    c6.metric("Sortino Ratio", _fmt_num(stats["sortino_ratio"]))
    c7.metric(f"Beta vs {benchmark_ticker}", _fmt_num(stats["beta"]))
    c8.metric("CAPM Expected Return", _fmt_pct(stats["capm_expected_return"]))

    c9, c10, c11, c12 = st.columns(4)
    c9.metric("Max Drawdown", _fmt_pct(stats["max_drawdown"]))
    c10.metric("Avg Daily Return", _fmt_pct(calculate_average_daily_return(returns)))
    c11.metric("Best Day", _fmt_pct(calculate_best_day(returns)))
    c12.metric("Worst Day", _fmt_pct(calculate_worst_day(returns)))

    if benchmark_prices is None:
        st.caption(
            f"Beta and CAPM need benchmark data ({benchmark_ticker}); it was not "
            "available for this selection, so those values show as '-'."
        )

    st.markdown("---")
    st.plotly_chart(plots.plot_price_chart(df, ticker), use_container_width=True)

    left, right = st.columns(2)
    with left:
        st.plotly_chart(plots.plot_cumulative_returns(df, ticker), use_container_width=True)
        st.plotly_chart(plots.plot_rolling_volatility(df, ticker, window=vol_window), use_container_width=True)
    with right:
        st.plotly_chart(plots.plot_daily_returns(df, ticker), use_container_width=True)
        st.plotly_chart(plots.plot_drawdown(df, ticker), use_container_width=True)

    st.markdown("---")
    st.subheader("Summary statistics")
    stats_table = pd.DataFrame(
        {
            "Metric": [
                "Observations", "Start Price", "End Price", "Total Return",
                "CAGR", "Annualized Return", "Annualized Volatility",
                "Sharpe Ratio", "Sortino Ratio", "Beta", "CAPM Expected Return",
                "Max Drawdown", "Avg Daily Return", "Best Day", "Worst Day",
            ],
            "Value": [
                f"{int(stats['observations'])}",
                _fmt_num(stats["start_price"]),
                _fmt_num(stats["end_price"]),
                _fmt_pct(stats["total_return"]),
                _fmt_pct(stats["cagr"]),
                _fmt_pct(stats["annualized_return"]),
                _fmt_pct(stats["annualized_volatility"]),
                _fmt_num(stats["sharpe_ratio"]),
                _fmt_num(stats["sortino_ratio"]),
                _fmt_num(stats["beta"]),
                _fmt_pct(stats["capm_expected_return"]),
                _fmt_pct(stats["max_drawdown"]),
                _fmt_pct(stats["average_daily_return"]),
                _fmt_pct(stats["best_day"]),
                _fmt_pct(stats["worst_day"]),
            ],
        }
    )
    st.dataframe(stats_table, use_container_width=True, hide_index=True)


def _ranking_table(summary: pd.DataFrame, column: str, ascending: bool, fmt) -> pd.DataFrame:
    """Two-column ranked table (Ticker + formatted metric) with NaNs dropped."""
    data = summary.dropna(subset=[column]).sort_values(column, ascending=ascending)
    out = data[["Ticker", column]].copy()
    out[column] = out[column].map(fmt)
    return out


def page_multi_asset(df: pd.DataFrame, tickers: list[str], benchmark_df: pd.DataFrame | None = None) -> None:
    st.header("Multi-Asset Comparison")
    summary = build_summary(df, tickers, benchmark_df)
    if summary.empty:
        st.warning("No valid data to compare.")
        return

    st.plotly_chart(plots.plot_normalized_price_comparison(df), use_container_width=True)
    st.plotly_chart(plots.plot_cumulative_return_comparison(df), use_container_width=True)

    # Phase 2 risk-adjusted comparison charts.
    st.markdown("---")
    st.subheader("Risk-adjusted performance")
    st.plotly_chart(plots.plot_cagr_bar(summary), use_container_width=True)
    st.plotly_chart(plots.plot_sharpe_sortino_bar(summary), use_container_width=True)
    st.plotly_chart(plots.plot_beta_bar(summary), use_container_width=True)
    st.plotly_chart(plots.plot_risk_adjusted_scatter(summary), use_container_width=True)

    st.markdown("---")
    st.subheader("Rankings")
    col1, col2, col3 = st.columns(3)
    with col1:
        st.caption("Highest CAGR")
        st.dataframe(_ranking_table(summary, "cagr", False, _fmt_pct), use_container_width=True, hide_index=True)
    with col2:
        st.caption("Highest Sharpe Ratio")
        st.dataframe(_ranking_table(summary, "sharpe_ratio", False, _fmt_num), use_container_width=True, hide_index=True)
    with col3:
        st.caption("Highest Sortino Ratio")
        st.dataframe(_ranking_table(summary, "sortino_ratio", False, _fmt_num), use_container_width=True, hide_index=True)

    col4, col5, col6 = st.columns(3)
    with col4:
        st.caption("Lowest Max Drawdown (shallowest first)")
        st.dataframe(_ranking_table(summary, "max_drawdown", False, _fmt_pct), use_container_width=True, hide_index=True)
    with col5:
        st.caption("Lowest Annualized Volatility")
        st.dataframe(_ranking_table(summary, "annualized_volatility", True, _fmt_pct), use_container_width=True, hide_index=True)
    with col6:
        st.caption("Total Return (best first)")
        st.dataframe(_ranking_table(summary, "total_return", False, _fmt_pct), use_container_width=True, hide_index=True)

    if summary["beta"].notna().any():
        col7, col8 = st.columns(2)
        with col7:
            st.caption("Highest Beta (most market-sensitive)")
            st.dataframe(_ranking_table(summary, "beta", False, _fmt_num), use_container_width=True, hide_index=True)
        with col8:
            st.caption("Lowest Beta (most defensive)")
            st.dataframe(_ranking_table(summary, "beta", True, _fmt_num), use_container_width=True, hide_index=True)
    else:
        st.caption("Beta rankings need benchmark data, which was not available for this selection.")


def page_correlation(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Correlation Heatmap")
    if len(tickers) < 2:
        st.info("Select at least two tickers to compute correlations.")
        return

    returns_pivot = create_returns_pivot(df)
    corr = calculate_correlation_matrix(returns_pivot)
    if corr.empty:
        st.warning("Could not compute a correlation matrix for this selection.")
        return

    st.plotly_chart(plots.plot_correlation_heatmap(corr), use_container_width=True)

    highest = find_highest_correlation_pair(corr)
    lowest = find_lowest_correlation_pair(corr)
    c1, c2 = st.columns(2)
    if highest:
        c1.metric(
            f"Most Correlated: {highest[0]} & {highest[1]}",
            f"{highest[2]:.2f}",
        )
    if lowest:
        c2.metric(
            f"Least Correlated: {lowest[0]} & {lowest[1]}",
            f"{lowest[2]:.2f}",
        )

    st.markdown(
        "**What correlation means:** it measures how two assets move together, "
        "from **+1** (move in lockstep) through **0** (no relationship) to **-1** "
        "(move in opposite directions). Combining assets with **low or negative** "
        "correlation is the core idea behind diversification - it can reduce "
        "portfolio risk without necessarily reducing expected return."
    )


def page_sector(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Sector Comparison")
    summary = calculate_sector_summary(df)
    if summary.empty:
        st.warning("No sector data available for this selection.")
        return

    display = summary.copy()
    for col in ["avg_total_return", "avg_annualized_volatility", "avg_max_drawdown"]:
        display[col] = display[col].map(_fmt_pct)
    display = display.rename(
        columns={
            "avg_total_return": "Avg Total Return",
            "avg_annualized_volatility": "Avg Ann. Volatility",
            "avg_max_drawdown": "Avg Max Drawdown",
            "num_tickers": "Tickers",
        }
    )
    st.dataframe(display, use_container_width=True)

    st.plotly_chart(plots.plot_sector_return_bar(summary), use_container_width=True)
    col1, col2 = st.columns(2)
    with col1:
        st.plotly_chart(plots.plot_sector_volatility_bar(summary), use_container_width=True)
    with col2:
        st.plotly_chart(plots.plot_sector_drawdown_bar(summary), use_container_width=True)

    st.markdown(
        "**Reading this page:** sectors group similar businesses (e.g. Information "
        "Technology, Financials). Comparing average return, volatility, and drawdown "
        "by sector shows where performance and risk were concentrated over the period."
    )


def page_risk(df: pd.DataFrame, tickers: list[str], benchmark_df: pd.DataFrame | None = None) -> None:
    st.header("Risk Summary")
    risk = calculate_risk_summary(df)
    if risk.empty:
        st.warning("No risk data available for this selection.")
        return

    # Enrich the risk table with Phase 2 risk-adjusted metrics.
    summary = build_summary(df, tickers, benchmark_df)
    if not summary.empty:
        extra = summary[["Ticker", "sharpe_ratio", "sortino_ratio", "beta", "capm_expected_return"]]
        risk = risk.merge(extra, on="Ticker", how="left")

    display = risk.copy()
    for col in ["Annualized Volatility", "Downside Deviation", "Max Drawdown"]:
        display[col] = display[col].map(_fmt_pct)
    for col in ["sharpe_ratio", "sortino_ratio", "beta"]:
        if col in display.columns:
            display[col] = display[col].map(_fmt_num)
    if "capm_expected_return" in display.columns:
        display["capm_expected_return"] = display["capm_expected_return"].map(_fmt_pct)
    display = display.rename(
        columns={
            "sharpe_ratio": "Sharpe Ratio",
            "sortino_ratio": "Sortino Ratio",
            "beta": "Beta",
            "capm_expected_return": "CAPM Expected Return",
        }
    )
    st.dataframe(display, use_container_width=True, hide_index=True)

    st.markdown("---")
    st.subheader("Advanced tail-risk (coming in Phase 4)")
    c1, c2, c3 = st.columns(3)
    c1.metric("Value at Risk (VaR)", "Phase 4")
    c2.metric("Conditional VaR (CVaR)", "Phase 4")
    c3.metric("Monte Carlo Risk", "Phase 4")
    st.caption(
        "VaR, CVaR, and Monte Carlo simulation will quantify tail losses in "
        "Phase 4. For now, risk is summarized via volatility, downside deviation, "
        "max drawdown, and risk-adjusted ratios (Sharpe / Sortino / Beta)."
    )

    st.markdown("---")
    st.subheader("Risk ranking (riskiest first)")
    ranking_cols = ["Ticker", "Risk Classification", "Annualized Volatility"]
    if "Sharpe Ratio" in display.columns:
        ranking_cols.append("Sharpe Ratio")
    ranking = display[ranking_cols].copy()
    st.dataframe(ranking, use_container_width=True, hide_index=True)


def page_data_quality(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Data Quality Report")
    report = calculate_data_quality_report(df)
    if report.empty:
        st.warning("No data-quality information available.")
        return

    total_rows = int(report["Row Count"].sum())
    total_missing = int(report["Missing Values"].sum())
    total_dupes = int(report["Duplicate Rows"].sum())
    c1, c2, c3 = st.columns(3)
    c1.metric("Total Rows", f"{total_rows:,}")
    c2.metric("Total Missing Values", f"{total_missing:,}")
    c3.metric("Total Duplicate Rows", f"{total_dupes:,}")

    st.markdown("---")
    display = report.copy()
    for col in ("First Date", "Last Date"):
        display[col] = pd.to_datetime(display[col], errors="coerce").dt.date.astype(str)
    st.dataframe(display, use_container_width=True, hide_index=True)

    st.plotly_chart(plots.plot_data_quality_bar(report), use_container_width=True)

    if total_missing == 0 and total_dupes == 0:
        st.success("No missing values or duplicate rows detected. Clean dataset.")
    else:
        st.warning("Some gaps or duplicates were detected - see the table above.")


def page_option_pricing() -> None:
    st.header("Option Pricing Lab")
    
    st.sidebar.markdown("---")
    st.sidebar.subheader("Option Parameters")
    
    option_type = st.sidebar.selectbox("Option Type", ["call", "put"]).lower()
    S = st.sidebar.number_input("Spot Price (S)", min_value=0.01, value=100.0, step=1.0)
    K = st.sidebar.number_input("Strike Price (K)", min_value=0.01, value=100.0, step=1.0)
    T = st.sidebar.number_input("Time to Maturity (T) in years", min_value=0.01, value=1.0, step=0.1)
    r = st.sidebar.number_input("Risk-Free Rate (r)", min_value=0.0, value=0.05, step=0.01, format="%.4f")
    sigma = st.sidebar.number_input("Volatility (sigma)", min_value=0.01, value=0.20, step=0.01, format="%.4f")
    q = st.sidebar.number_input("Dividend Yield (q)", min_value=0.0, value=0.0, step=0.01, format="%.4f")
    
    st.sidebar.markdown("---")
    st.sidebar.subheader("Implied Volatility Solver")
    market_price = st.sidebar.number_input("Market Price (optional)", min_value=0.0, value=0.0, step=0.1)
    
    # Calculate
    price = black_scholes.calculate_option_price(S, K, T, r, sigma, q, option_type)
    greeks = black_scholes.calculate_all_greeks(S, K, T, r, sigma, q, option_type)
    
    st.subheader(f"Theoretical {option_type.capitalize()} Option Price: {_fmt_num(price)}")
    
    # KPI Cards
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Delta", _fmt_num(greeks["delta"]))
    c2.metric("Gamma", _fmt_num(greeks["gamma"]))
    c3.metric("Vega", _fmt_num(greeks["vega"]))
    c4.metric("Theta", _fmt_num(greeks["theta"]))
    
    c5, c6, c7, c8 = st.columns(4)
    c5.metric("Rho", _fmt_num(greeks["rho"]))
    if market_price > 0:
        iv = black_scholes.calculate_implied_volatility(market_price, S, K, T, r, q, option_type)
        c6.metric("Implied Volatility", _fmt_pct(iv) if not np.isnan(iv) else "Failed")
    else:
        c6.metric("Implied Volatility", "-")
    c7.metric("Theta (per day)", _fmt_num(greeks["theta_per_day"]))
    c8.metric("Vega (per 1%)", _fmt_num(greeks.get("vega_per_1pct", greeks.get("vega_per_1_pct"))))
    
    st.markdown("---")
    st.subheader("Sensitivity Charts")
    left, right = st.columns(2)
    with left:
        st.plotly_chart(option_plots.plot_option_price_vs_spot(S, K, T, r, sigma, q, option_type), use_container_width=True)
        if hasattr(option_plots, "plot_delta_vs_spot"):
            st.plotly_chart(option_plots.plot_delta_vs_spot(S, K, T, r, sigma, q, option_type), use_container_width=True)
        st.plotly_chart(option_plots.plot_greeks_vs_spot(S, K, T, r, sigma, q, option_type), use_container_width=True)
    with right:
        st.plotly_chart(option_plots.plot_option_price_vs_volatility(S, K, T, r, sigma, q, option_type), use_container_width=True)
        if hasattr(option_plots, "plot_gamma_vs_spot"):
            st.plotly_chart(option_plots.plot_gamma_vs_spot(S, K, T, r, sigma, q, option_type), use_container_width=True)
        
        st.subheader("Greeks Explained")
        st.markdown(
            "**Delta**: How much option price changes when underlying changes by 1 unit.\n\n"
            "**Gamma**: How fast delta changes when underlying moves.\n\n"
            "**Vega**: Sensitivity to volatility.\n\n"
            "**Theta**: Time decay.\n\n"
            "**Rho**: Sensitivity to interest rates."
        )
        
        st.subheader("Black-Scholes Assumptions")
        st.markdown(
            "- **European options** (exercised only at expiration)\n"
            "- **Constant volatility** and **constant risk-free rate**\n"
            "- **No arbitrage** opportunities\n"
            "- **Lognormal stock price behavior**\n"
            "- **Frictionless markets** (no transaction costs or taxes)"
        )


def page_monte_carlo(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Monte Carlo Risk Lab")
    
    st.sidebar.markdown("---")
    st.sidebar.subheader("Simulation Parameters")
    
    # Auto-fill helper from loaded tickers
    auto_fill = st.sidebar.checkbox("Auto-fill from loaded ticker", value=False)
    selected_ticker = None
    if auto_fill and len(tickers) > 0:
        selected_ticker = st.sidebar.selectbox("Select ticker for auto-fill", options=tickers)
    
    default_S0 = 100.0
    default_mu = 0.08
    default_sigma = 0.20
    
    historical_returns = None
    if selected_ticker and df is not None and not df.empty:
        prices = _price_series(df, selected_ticker).dropna()
        if len(prices) >= 2:
            default_S0 = float(prices.iloc[-1])
            stats = calculate_summary_statistics(prices)
            default_mu = float(stats["cagr"])
            default_sigma = float(stats["annualized_volatility"])
            historical_returns = calculate_simple_returns(prices)
            
    # Inputs
    S0 = st.sidebar.number_input("Initial Price (S0)", min_value=0.01, value=default_S0, step=1.0)
    mu_pct = st.sidebar.number_input("Expected Annual Return (μ) %", value=default_mu * 100, step=1.0)
    sigma_pct = st.sidebar.number_input("Annual Volatility (σ) %", min_value=0.1, value=default_sigma * 100, step=1.0)
    T = st.sidebar.number_input("Time Horizon in Years", min_value=0.1, value=1.0, step=0.1)
    steps = st.sidebar.number_input("Number of Time Steps", min_value=10, value=252, step=10)
    n_simulations = st.sidebar.number_input("Number of Simulations", min_value=100, max_value=100000, value=5000, step=100)
    confidence_level_pct = st.sidebar.number_input("Confidence Level %", min_value=50.0, max_value=99.9, value=95.0, step=1.0)
    random_seed = st.sidebar.number_input("Random Seed (optional)", min_value=0, value=42, step=1)
    
    run_sim = st.button("Run Monte Carlo Simulation", type="primary")
    
    if run_sim:
        with st.spinner("Running simulation..."):
            mu = mu_pct / 100.0
            sigma = sigma_pct / 100.0
            conf_level = confidence_level_pct / 100.0
            
            paths = monte_carlo.simulate_gbm_paths(
                S0=S0, mu=mu, sigma=sigma, T=T, steps=steps, n_simulations=n_simulations, random_seed=random_seed
            )
            
            final_prices = monte_carlo.calculate_final_prices(paths)
            sim_returns = monte_carlo.calculate_simulated_returns(final_prices, S0)
            
            sim_summary = monte_carlo.calculate_simulation_summary(paths, S0)
            risk_summary = var_cvar.calculate_var_cvar_summary(historical_returns, sim_returns, conf_level)
            
            st.markdown("---")
            st.subheader("Simulation Results")
            
            # KPI Cards
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Expected Final Price", _fmt_num(sim_summary["expected_final_price"]))
            c2.metric("Median Final Price", _fmt_num(sim_summary["median_final_price"]))
            c3.metric("Probability of Loss", _fmt_pct(sim_summary["probability_of_loss"]))
            c4.metric("Worst Simulated Return", _fmt_pct(sim_summary["worst_return"]))
            
            c5, c6, c7, c8 = st.columns(4)
            c5.metric("Best Simulated Return", _fmt_pct(sim_summary["best_return"]))
            c6.metric("Monte Carlo VaR", _fmt_pct(risk_summary["monte_carlo_var"]))
            c7.metric("Monte Carlo CVaR", _fmt_pct(risk_summary["monte_carlo_cvar"]))
            c8.metric("Confidence Level", _fmt_pct(conf_level))
            
            if historical_returns is not None:
                st.markdown("##### Historical & Parametric Comparison")
                hc1, hc2, pc1, pc2 = st.columns(4)
                hc1.metric("Historical VaR", _fmt_pct(risk_summary["historical_var"]))
                hc2.metric("Historical CVaR", _fmt_pct(risk_summary["historical_cvar"]))
                pc1.metric("Parametric VaR", _fmt_pct(risk_summary["parametric_var"]))
                pc2.metric("Parametric CVaR", _fmt_pct(risk_summary["parametric_cvar"]))
                
            st.markdown("---")
            st.subheader("Visualizations")
            
            left, right = st.columns(2)
            with left:
                st.plotly_chart(simulation_plots.plot_monte_carlo_paths(paths, max_paths=150), use_container_width=True)
                st.plotly_chart(simulation_plots.plot_final_price_distribution(final_prices), use_container_width=True)
            with right:
                st.plotly_chart(simulation_plots.plot_percentile_fan_chart(paths), use_container_width=True)
                st.plotly_chart(simulation_plots.plot_var_cvar_histogram(
                    sim_returns, 
                    risk_summary["monte_carlo_var"], 
                    risk_summary["monte_carlo_cvar"], 
                    conf_level
                ), use_container_width=True)
                
            st.plotly_chart(simulation_plots.plot_simulated_return_distribution(sim_returns), use_container_width=True)
            
    st.markdown("---")
    st.subheader("Educational Explanation")
    
    st.markdown(
        "**Monte Carlo Simulation**: A method where we simulate thousands of possible future price paths using randomness to model uncertainty.\n\n"
        "**Geometric Brownian Motion (GBM)**: A model that assumes returns follow a normal distribution and prices follow a lognormal path.\n\n"
        "**Value-at-Risk (VaR)**: The maximum expected loss at a given confidence level over a given time horizon. For example, a 95% VaR of 5% means there is a 95% confidence that losses will not exceed 5%.\n\n"
        "**Conditional Value-at-Risk (CVaR)**: Also known as Expected Shortfall. It calculates the average loss in the worst tail *beyond* the VaR threshold. It answers: 'If things do go bad, exactly how bad are they expected to get?'"
    )
    
    st.subheader("Important Limitations")
    st.markdown(
        "- **GBM assumes constant volatility**, which is rarely true in live markets.\n"
        "- **Returns are assumed normally distributed** in the basic formulation, which ignores 'fat tails' often seen in real financial panics.\n"
        "- Real markets can experience discontinuous jumps or crashes.\n"
        "- Historical future may not repeat; relying purely on auto-filled historical parameters can severely underestimate future stress.\n"
        "- VaR does not describe how bad losses can get beyond the cutoff. (This is why CVaR is an essential complementary metric!)"
    )

def page_portfolio_optimization(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Portfolio Optimization Lab")
    
    if len(tickers) < 2:
        st.warning("Please select at least two assets for portfolio optimization.")
        return
        
    st.sidebar.markdown("---")
    st.sidebar.subheader("Section 1: Portfolio Setup")
    
    risk_free_rate = st.sidebar.number_input("Risk-Free Rate (%)", min_value=0.0, value=5.0, step=0.1) / 100.0
    max_weight = st.sidebar.number_input("Max Weight per Asset (%)", min_value=1.0, max_value=100.0, value=100.0, step=5.0) / 100.0
    return_method = st.sidebar.selectbox("Return Method", ["log", "simple"])
    
    optimization_mode = st.sidebar.selectbox(
        "Optimization Mode", 
        ["Minimum Variance", "Maximum Sharpe", "Risk Parity", "Compare All"],
        index=3
    )
    
    run_opt = st.button("Run Portfolio Optimization", type="primary")
    
    if run_opt:
        with st.spinner("Running optimizations..."):
            # Prepare data
            price_pivot = portfolio_optimization.create_price_pivot(df)
            price_pivot = price_pivot[tickers].dropna()
            
            if price_pivot.empty or len(price_pivot) < 2:
                st.error("Not enough overlapping valid data for the selected tickers.")
                return
                
            returns = portfolio_optimization.calculate_asset_returns(price_pivot, method=return_method)
            expected_returns = portfolio_optimization.calculate_expected_returns(returns)
            covariance_matrix = portfolio_optimization.calculate_covariance_matrix(returns)
            
            st.markdown("---")
            st.subheader("Section 2: Portfolio Summary KPI Cards")
            
            summary_res = None
            opt_weights = None
            
            if optimization_mode == "Minimum Variance":
                res = portfolio_optimization.minimum_variance_portfolio(expected_returns, covariance_matrix, max_weight)
                if res["success"]:
                    summary_res = portfolio_optimization.calculate_portfolio_performance_summary(res["weights"], expected_returns, covariance_matrix, risk_free_rate)
                    opt_weights = res["weights"]
                else:
                    st.error("Optimization failed: " + res["message"])
            elif optimization_mode == "Maximum Sharpe":
                res = portfolio_optimization.maximum_sharpe_portfolio(expected_returns, covariance_matrix, risk_free_rate, max_weight)
                if res["success"]:
                    summary_res = portfolio_optimization.calculate_portfolio_performance_summary(res["weights"], expected_returns, covariance_matrix, risk_free_rate)
                    opt_weights = res["weights"]
                else:
                    st.error("Optimization failed: " + res["message"])
            elif optimization_mode == "Risk Parity":
                res = portfolio_optimization.risk_parity_portfolio(covariance_matrix, max_weight)
                if res["success"]:
                    summary_res = portfolio_optimization.calculate_portfolio_performance_summary(res["weights"], expected_returns, covariance_matrix, risk_free_rate)
                    opt_weights = res["weights"]
                else:
                    st.error("Optimization failed: " + res["message"])
            
            if optimization_mode == "Compare All":
                comp_df = portfolio_optimization.compare_portfolios(expected_returns, covariance_matrix, risk_free_rate, max_weight)
                st.dataframe(comp_df, use_container_width=True)
                
                # Default to Max Sharpe for the detailed views if comparing all
                ms_res = portfolio_optimization.maximum_sharpe_portfolio(expected_returns, covariance_matrix, risk_free_rate, max_weight)
                if ms_res["success"]:
                    summary_res = portfolio_optimization.calculate_portfolio_performance_summary(ms_res["weights"], expected_returns, covariance_matrix, risk_free_rate)
                    opt_weights = ms_res["weights"]
                    st.info("Showing detailed allocation for Maximum Sharpe portfolio below.")
            
            if summary_res:
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Expected Return", _fmt_pct(summary_res["expected_return"]))
                c2.metric("Volatility", _fmt_pct(summary_res["volatility"]))
                c3.metric("Sharpe Ratio", _fmt_num(summary_res["sharpe_ratio"]))
                c4.metric("Number of Assets", summary_res["num_assets"])
                
                c5, c6, c7, c8 = st.columns(4)
                c5.metric("Largest Holding", summary_res["largest_weight_asset"])
                c6.metric("Largest Weight", _fmt_pct(summary_res["largest_weight"]))
                c7.metric("Smallest Holding", summary_res["smallest_weight_asset"])
                c8.metric("Smallest Weight", _fmt_pct(summary_res["smallest_weight"]))
                
                st.markdown("---")
                st.subheader("Section 3: Optimized Allocation")
                left, right = st.columns(2)
                with left:
                    if opt_weights is not None:
                        st.plotly_chart(portfolio_plots.plot_portfolio_weights(opt_weights, "Portfolio Weights"), use_container_width=True)
                with right:
                    if opt_weights is not None:
                        st.plotly_chart(portfolio_plots.plot_allocation_pie_chart(opt_weights, "Asset Allocation Breakdown"), use_container_width=True)
                    
            st.markdown("---")
            st.subheader("Section 4: Efficient Frontier")
            with st.spinner("Calculating efficient frontier..."):
                frontier_df = portfolio_optimization.calculate_efficient_frontier(expected_returns, covariance_matrix, n_portfolios=30, max_weight=max_weight)
                min_var = portfolio_optimization.minimum_variance_portfolio(expected_returns, covariance_matrix, max_weight)
                max_sharpe = portfolio_optimization.maximum_sharpe_portfolio(expected_returns, covariance_matrix, risk_free_rate, max_weight)
                
                st.plotly_chart(portfolio_plots.plot_efficient_frontier(frontier_df, min_var, max_sharpe), use_container_width=True)
                
            st.markdown("---")
            st.subheader("Section 5: Risk Contribution")
            if opt_weights is not None:
                rc_df = portfolio_optimization.calculate_risk_contribution(opt_weights.values, covariance_matrix)
                st.plotly_chart(portfolio_plots.plot_risk_contribution(rc_df), use_container_width=True)
                st.markdown("**Note:** An asset's *weight* (how much capital is allocated) is often different from its *risk contribution* (how much it adds to total portfolio volatility). This is due to volatility and correlation differences.")
                
            if optimization_mode == "Compare All":
                st.markdown("---")
                st.subheader("Section 6: Asset Allocation Comparison")
                st.plotly_chart(portfolio_plots.plot_portfolio_comparison(comp_df), use_container_width=True)
                
    st.markdown("---")
    st.subheader("Section 7: Educational Explanation")
    st.markdown(
        "**Markowitz Optimization**: Builds portfolios by balancing expected return and risk using the efficient frontier.\n\n"
        "**Minimum Variance Portfolio**: The portfolio with the lowest possible volatility regardless of return.\n\n"
        "**Maximum Sharpe Portfolio**: The portfolio with the best risk-adjusted return (steepest capital market line).\n\n"
        "**Efficient Frontier**: The set of portfolios that offer the highest expected return for a given risk level.\n\n"
        "**Risk Parity**: A portfolio where each asset contributes roughly equally to total risk (rather than equal capital).\n\n"
        "**Covariance Matrix**: Shows how assets move together; essential for modeling portfolio risk and diversification."
    )
    
    st.subheader("Section 8: Limitations")
    st.markdown(
        "- Expected returns are estimated from historical data, which is famously unreliable.\n"
        "- Covariance and correlation can change dramatically over time (especially during crises).\n"
        "- Optimization can 'overfit' to historical noise, resulting in extreme allocations.\n"
        "- Real markets have transaction costs and liquidity constraints not modeled here.\n"
        "- Past performance does not guarantee future results.\n"
        "- Long-only constraints limit short-selling assumptions."
    )


def page_market_regime_lab(df: pd.DataFrame, tickers: list[str], benchmark_df: pd.DataFrame | None, target_ticker: str) -> None:
    st.header("Market Regime Lab")
    st.markdown("<div class='finsight-subtitle'>Hidden-state market regime detection for equities and ETFs.</div>", unsafe_allow_html=True)
    
    if not tickers:
        st.warning("Please load at least one ticker to begin.")
        return
        
    if target_ticker not in tickers:
        st.error(f"Selected ticker {target_ticker} has no loaded data. Please click 'Load / Refresh Data'.")
        return
        
    ticker = target_ticker
        
    st.sidebar.markdown("---")
    st.sidebar.subheader("Regime Controls")
    
    default_bench = config.get_default_benchmark(ticker)
    available_benchmarks = list(benchmark_df["Ticker"].unique()) if benchmark_df is not None and not benchmark_df.empty else []
    if default_bench not in available_benchmarks and available_benchmarks:
        default_bench = available_benchmarks[0]
        
    benchmark_choice = st.sidebar.selectbox(
        "Benchmark (for relative features)", 
        options=["None"] + available_benchmarks,
        index=(available_benchmarks.index(default_bench) + 1) if default_bench in available_benchmarks else 0
    )
    
    model_type = st.sidebar.selectbox("Regime Model", ["HMM", "Gaussian Mixture", "KMeans"])
    n_states = st.sidebar.selectbox("Number of States", [3, 4, 5], index=1)
    
    feature_set = st.sidebar.selectbox("Feature Set", ["Basic", "With Benchmark", "Full"])
    
    run_regime = st.button("Run Regime Detection", type="primary")
    
    if run_regime:
        asset_df = df[df["Ticker"] == ticker].copy().sort_values("Date").reset_index(drop=True)
        if asset_df.empty:
            st.error(f"Data not found for {ticker}.")
            return
            
        b_df = None
        if benchmark_choice != "None" and benchmark_df is not None:
            b_df = benchmark_df[benchmark_df["Ticker"] == benchmark_choice].copy()
            
        with st.spinner("Engineering regime features..."):
            feat_df = regime.create_regime_features(asset_df, benchmark_df=b_df)
            
        if feat_df.empty:
            st.error("Failed to generate features. Check data.")
            return
            
        cols = regime.get_regime_feature_columns(feat_df, feature_set)
            
        if not cols:
            st.error("No valid features selected.")
            return
            
        with st.spinner(f"Fitting {model_type} model with {n_states} states..."):
            if model_type == "HMM":
                if not regime.is_hmmlearn_available():
                    st.warning("hmmlearn not installed. Falling back to Gaussian Mixture.")
                    res_df = regime.run_gmm_regime_detection(feat_df, cols, n_states=n_states)
                    state_col, prob_col = "gmm_state", "gmm_state_probability"
                else:
                    res_df = regime.run_hmm_regime_detection(feat_df, cols, n_states=n_states)
                    state_col, prob_col = "hmm_state", "hmm_state_probability"
            elif model_type == "Gaussian Mixture":
                res_df = regime.run_gmm_regime_detection(feat_df, cols, n_states=n_states)
                state_col, prob_col = "gmm_state", "gmm_state_probability"
            else:
                res_df = regime.run_kmeans_regime_detection(feat_df, cols, n_states=n_states)
                state_col, prob_col = "kmeans_state", "kmeans_state_probability"
                
            if state_col not in res_df.columns or res_df[state_col].isna().all():
                st.error("Model failed to fit. Try a different model or fewer states.")
                return
                
        with st.spinner("Labeling Regimes..."):
            reg_summary = regime.summarize_regime_states(res_df, state_col)
            labels = regime.label_regime_states(reg_summary)
            res_df = regime.map_regime_labels_to_rows(res_df, state_col, labels)
            
            # Recalculate summary with labels
            perf_summary = regime.calculate_regime_performance_summary(res_df)
            current_summary = regime.calculate_current_regime_summary(res_df, probability_col=prob_col)
            durations = regime.calculate_regime_duration(res_df)
            
            # Matrix
            trans_matrix = regime.calculate_regime_transition_matrix(res_df["regime_label"])
            
        st.markdown("---")
        
        # Part A: Professional Header
        from src.config import get_display_name
        st.markdown("### Configuration Summary")
        col_a1, col_a2, col_a3 = st.columns(3)
        col_a1.markdown(f"**Selected Asset:** {ticker} — {get_display_name(ticker)}")
        col_a1.markdown(f"**Benchmark:** {benchmark_choice}")
        col_a2.markdown(f"**Model:** {model_type}")
        col_a2.markdown(f"**States:** {n_states}")
        min_dt = res_df['Date'].min() if 'Date' in res_df.columns else res_df.index.min()
        max_dt = res_df['Date'].max() if 'Date' in res_df.columns else res_df.index.max()
        col_a3.markdown(f"**Date Range:** {min_dt.strftime('%Y-%m-%d')} to {max_dt.strftime('%Y-%m-%d')}")
        col_a3.markdown(f"**Feature Set:** {feature_set}")
        
        with st.expander(f"Features used by regime model ({len(cols)} total)"):
            st.write(", ".join(cols))
            
        st.markdown("---")
        
        # Part E: Regime Interpretation Panel
        st.subheader("Current Regime Summary")
        from src.regime.regime_analysis import generate_regime_interpretation
        interpretation_text = generate_regime_interpretation(current_summary, perf_summary, trans_matrix, asset_name=get_display_name(ticker))
        st.info(interpretation_text)
        
        # Part C: Confidence Quality KPI
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Current Regime", current_summary.get("current_regime", "Unknown"))
        
        prob = current_summary.get("current_regime_probability", np.nan)
        c2.metric("Regime Probability", _fmt_pct(prob) if pd.notna(prob) else "N/A")
        c3.metric("Confidence Quality", current_summary.get("regime_confidence_quality", "Unknown"))
        c4.metric("Regime Stability", current_summary.get("regime_stability", "Unknown"))
        
        c5, c6, c7, c8 = st.columns(4)
        c5.metric("Current Duration", f"{current_summary.get('current_regime_duration', 0)} days")
        c6.metric("Regime Risk Level", current_summary.get("current_regime_risk_level", "Unknown"))
        
        latest = res_df.iloc[-1]
        c7.metric("Latest Close", _fmt_num(latest.get("Close", 0)))
        c8.metric("20D Volatility", _fmt_pct(latest.get("realized_vol_20", 0)))
        
        st.caption("Regime probability is model assignment confidence, not a guaranteed market truth.")
        
        st.markdown("---")
        st.subheader("Price and Regime Timeline")
        st.plotly_chart(regime_plots.plot_recent_regime_timeline(res_df, years=3), use_container_width=True)
        with st.expander("View Full Historical Regime Timeline"):
            st.plotly_chart(regime_plots.plot_price_with_regimes(res_df), use_container_width=True)
        
        left, right = st.columns(2)
        with left:
            st.plotly_chart(regime_plots.plot_regime_timeline(res_df), use_container_width=True)
        with right:
            st.plotly_chart(regime_plots.plot_regime_probability(res_df, prob_col=prob_col), use_container_width=True)
            
        st.markdown("---")
        st.subheader("Regime State Diagnostics")
        st.dataframe(perf_summary, use_container_width=True, hide_index=True)
        st.plotly_chart(regime_plots.plot_regime_performance(perf_summary), use_container_width=True)
        
        st.markdown("---")
        st.subheader("Transition Matrix")
        st.markdown("Transition matrix shows the probability of moving from one regime to another.")
        
        t_c1, t_c2 = st.columns([2, 1])
        with t_c1:
            st.plotly_chart(regime_plots.plot_regime_transition_matrix(trans_matrix), use_container_width=True)
        with t_c2:
            from src.regime.regime_analysis import analyze_transition_matrix
            trans_analysis = analyze_transition_matrix(trans_matrix, current_summary.get("current_regime", "Unknown"))
            st.markdown("#### Matrix Analysis")
            st.write(trans_analysis.get("interpretation", ""))
            
            st.metric("Most Stable Regime", trans_analysis.get("most_stable_regime", "N/A"), f"{trans_analysis.get('most_stable_probability', 0):.1%}")
            st.metric("Most Unstable Regime", trans_analysis.get("least_stable_regime", "N/A"), f"{trans_analysis.get('least_stable_probability', 0):.1%}")
            st.metric("Probability of Staying", current_summary.get("current_regime", "N/A"), f"{trans_analysis.get('current_regime_stay_probability', 0):.1%}")
            
        
        st.markdown("---")
        st.subheader("Regime Duration")
        st.plotly_chart(regime_plots.plot_regime_duration_distribution(durations), use_container_width=True)
        with st.expander("View all historical regime episodes"):
            st.plotly_chart(regime_plots.plot_regime_duration(durations), use_container_width=True)
        
        st.markdown("---")
        st.subheader("Feature Space")
        st.markdown("How unsupervised models cluster market states based on engineered features.")
        st.plotly_chart(regime_plots.plot_regime_feature_scatter(res_df), use_container_width=True)
        
        st.markdown("---")
        st.subheader("Signal Integration")
        st.info("This regime output can be added to ML Signal Research Lab as an additional feature. It can also adjust signal confidence. For example, bullish ML signals in a high-volatility selloff regime may be suppressed.")
        
        st.markdown("---")
        st.subheader("Limitations")
        st.markdown(
            "- HMM/GMM states are statistical clusters, not guaranteed economic truths.\n"
            "- Regime labels are assigned after the model using summary statistics.\n"
            "- Regimes can shift suddenly.\n"
            "- Model can overfit if too many states are used.\n"
            "- Educational only."
        )


def page_signal_research_lab(df: pd.DataFrame, tickers: list[str], benchmark_df: pd.DataFrame, target_ticker: str) -> None:
    from src.ml import signal_features, signal_targets, signal_modeling, signal_walk_forward, signal_engine, models, evaluation
    from src.visualization import ml_plots
    from src import config
    import numpy as np
    
    # -------------------------------------------------------------------------
    # SECTION 1: Header
    # -------------------------------------------------------------------------
    st.markdown("<h2 class='finsight-title'>Signal Research Lab</h2>", unsafe_allow_html=True)
    st.markdown("<div class='finsight-subtitle'>Institutional-style ML diagnostics for equities and ETFs.</div>", unsafe_allow_html=True)
    st.caption("Educational quantitative research dashboard. Not financial advice.")
    
    if not tickers:
        st.warning("Please load at least one ticker to begin.")
        return

    # -------------------------------------------------------------------------
    # SECTION 2: Ticker and Benchmark Controls
    # -------------------------------------------------------------------------
    st.sidebar.markdown("---")
    st.sidebar.subheader("Signal Research Controls")
    
    if target_ticker not in tickers:
        st.error(f"Selected ticker {target_ticker} has no loaded data. Please click 'Load / Refresh Data'.")
        return
        
    ticker = target_ticker
    display_name = config.get_display_name(ticker)
    
    default_bench = config.get_default_benchmark(ticker)
    available_benchmarks = list(benchmark_df["Ticker"].unique()) if not benchmark_df.empty else []
    if default_bench not in available_benchmarks and available_benchmarks:
        default_bench = available_benchmarks[0]
        
    benchmark_choice = st.sidebar.selectbox(
        "Select Benchmark (for relative features)", 
        options=available_benchmarks if available_benchmarks else [default_bench],
        index=available_benchmarks.index(default_bench) if default_bench in available_benchmarks else 0
    )
    
    target_map = {
        "Next-day Direction": ("target_direction", 1),
        "Strong Up Move": ("target_strong_up", 1),
        "Strong Down Move": ("target_strong_down", 1),
        "Risk Event": ("target_risk_event", 1)
    }
    target_choice = st.sidebar.selectbox("Prediction Target", list(target_map.keys()))
    horizon = st.sidebar.selectbox("Horizon (days)", [1, 3, 5])
    
    test_size = st.sidebar.slider("Test Size", 0.1, 0.4, 0.2)
    use_wf = st.sidebar.checkbox("Run Walk-Forward Validation", value=True)
    use_regime = st.sidebar.checkbox("Use Regime Features", value=False)
    use_rag_factors = st.sidebar.checkbox("Use Document Factor Features", value=False)
    
    bullish_threshold = st.sidebar.slider("Bullish Threshold", 0.50, 0.70, 0.57)
    bearish_threshold = st.sidebar.slider("Bearish Threshold", 0.30, 0.50, 0.43)
    
    run_signal = st.button("Run Signal Research", type="primary")
    
    st.markdown(f"### {display_name} Signal Research Lab")
    st.markdown(f"**Ticker**: `{ticker}` | **Benchmark**: `{benchmark_choice}`")
    
    if run_signal:
        target_col_base, _ = target_map[target_choice]
        
        # Isolate Asset
        asset_df = df[df["Ticker"] == ticker].copy().sort_values("Date").reset_index(drop=True)
        if asset_df.empty:
            st.error(f"Data not found for {ticker}.")
            return
            
        # Isolate Benchmark
        b_df = benchmark_df[benchmark_df["Ticker"] == benchmark_choice].copy() if not benchmark_df.empty else pd.DataFrame()
        
        with st.spinner("Generating institutional features..."):
            feat_df = signal_features.create_signal_research_features(asset_df, benchmark_df=b_df, ticker=ticker)
            
        if feat_df.empty:
            st.error("Failed to generate features. Check data quality.")
            return

        with st.spinner("Building Targets..."):
            ml_df = signal_targets.create_signal_research_targets(feat_df, horizon=horizon)
            
        target_col = target_col_base
        
        # Merge Document Factors if selected
        if use_rag_factors:
            from src.rag.factor_store import load_factor_records, merge_factors_with_market_data
            with st.spinner("Merging RAG Document Factors..."):
                factor_df = load_factor_records()
                if not factor_df.empty:
                    # ML lab expects Date to be datetime
                    ml_df = merge_factors_with_market_data(ml_df, factor_df, date_col="Date", ticker_col="Ticker")
                    st.success(f"Merged Document Factors for ML features.")
                else:
                    st.warning("No document factor records found. Use AI Equity Research Terminal page to extract factors first.")
        
        
        if use_regime:
            from src import regime as regime_mod
            with st.spinner("Generating regime features..."):
                reg_feat = regime_mod.create_regime_features(asset_df, benchmark_df=b_df)
                reg_cols = regime_mod.get_regime_feature_columns(reg_feat)
                
                if regime_mod.is_hmmlearn_available():
                    reg_df = regime_mod.run_hmm_regime_detection(reg_feat, reg_cols, n_states=4)
                    state_col, prob_col = "hmm_state", "hmm_state_probability"
                else:
                    reg_df = regime_mod.run_gmm_regime_detection(reg_feat, reg_cols, n_states=4)
                    state_col, prob_col = "gmm_state", "gmm_state_probability"
                    
                reg_summary = regime_mod.summarize_regime_states(reg_df, state_col)
                labels = regime_mod.label_regime_states(reg_summary)
                reg_df = regime_mod.map_regime_labels_to_rows(reg_df, state_col, labels)
                current_reg_summary = regime_mod.calculate_current_regime_summary(reg_df, probability_col=prob_col)
                
                ml_df = regime_mod.add_regime_features_to_ml_dataset(ml_df, reg_df)
                
        feature_cols = [c for c in ml_df.columns if pd.api.types.is_numeric_dtype(ml_df[c])]
        exclude_cols = ["Date", "Ticker", "Open", "High", "Low", "Close", "Volume", "target_return_1d", "target_return_3d", "target_return_5d",
                        "target_direction", "target_strong_up", "target_strong_down", "target_risk_event"]
        feature_cols = [c for c in feature_cols if c not in exclude_cols]
        
        # Drop missing targets and features
        ml_df = ml_df.dropna(subset=[target_col] + feature_cols).reset_index(drop=True)
        
        if ml_df.empty or len(ml_df) < 50:
            st.error("Not enough data to train the model after dropping missing values.")
            return
        
        with st.spinner("Training Ensemble..."):
            suite_results = signal_modeling.train_signal_model_suite(
                ml_df, feature_cols, target_col, test_size=test_size, ticker=ticker
            )
            
        res_df = suite_results["model_results"]
        best_model_name = suite_results["best_model_name"]
        
        signal_data = suite_results["institutional_signal"]
        
        # -------------------------------------------------------------------------
        # SECTION 3: Market Context Strip
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Market Context Strip")
        latest = feat_df.iloc[-1]
        
        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Latest Close", _fmt_num(latest.get("Close", 0)))
        c2.metric("1D Return", _fmt_pct(latest.get("simple_return", 0)))
        c3.metric("5D Return", _fmt_pct((latest.get("Close", 0) / feat_df.iloc[-6].get("Close", 1)) - 1 if len(feat_df) > 5 else 0))
        c4.metric("20D Return", _fmt_pct((latest.get("Close", 0) / feat_df.iloc[-21].get("Close", 1)) - 1 if len(feat_df) > 20 else 0))
        c5.metric("20D Realized Vol", _fmt_pct(latest.get("realized_vol_20", 0)))
        
        c6, c7, c8, c9, c10 = st.columns(5)
        c6.metric("Drawdown from 52W High", _fmt_pct(latest.get("drawdown_from_252_high", 0)))
        c7.metric("Trend Regime", latest.get("trend_regime", "Unknown"))
        c8.metric("Volatility Regime", latest.get("volatility_regime", "Unknown"))
        
        if "asset_minus_benchmark_return" in latest and pd.notna(latest["asset_minus_benchmark_return"]):
            rel_ret = latest["asset_minus_benchmark_return"]
            c9.metric("Rel Return vs Benchmark", _fmt_pct(rel_ret))
        else:
            c9.metric("Rel Return vs Benchmark", "N/A")
            
        if "rolling_beta_60" in latest and pd.notna(latest["rolling_beta_60"]):
            c10.metric("Rolling Beta (60D)", _fmt_num(latest["rolling_beta_60"]))
        else:
            c10.metric("Rolling Beta (60D)", "N/A")
        
        # -------------------------------------------------------------------------
        # SECTION 4: Executive Signal Summary
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Executive Signal Summary")
        
        sc1, sc2, sc3, sc4 = st.columns(4)
        sig = signal_data["signal"]
        color = "green" if sig == "Bullish" else "red" if sig == "Bearish" else "gray"
        sc1.markdown(f"**Final Research Signal**: <span style='color:{color}; font-size:1.2em;'>{sig}</span>", unsafe_allow_html=True)
        sc2.markdown(f"**Research Confidence**: {signal_data['research_confidence']}")
        sc3.markdown(f"**Raw Probability (Up)**: {_fmt_pct(signal_data['raw_probability_up'])}")
        sc4.markdown(f"**Validation-Adjusted Prob**: {_fmt_pct(signal_data['calibrated_probability_up'])}")
        
        mc1, mc2, mc3, mc4 = st.columns(4)
        mc1.metric("Best Model Used", best_model_name)
        
        roc = suite_results["best_model_metrics"]["roc_auc"]
        mc2.metric("ROC-AUC", _fmt_pct(roc))
        mc3.metric("F1 Score", _fmt_pct(suite_results["best_model_metrics"]["f1_score"]))
        
        edge = suite_results["model_edge"]
        mc4.metric("Model Edge vs Baseline", f"{edge*100:+.1f}%")
        
        if not signal_data["is_signal_allowed"]:
            st.error("⚠️ **Signal suppressed because validation edge is weak.**")
            
        st.info(signal_data["explanation"])

        if use_regime:
            adj_signal_data = regime_mod.adjust_signal_for_regime(signal_data, current_reg_summary)
            st.markdown("---")
            st.subheader("Regime Adjustment")
            r1, r2, r3 = st.columns(3)
            r1.metric("Current Regime", adj_signal_data["current_regime"])
            r2.metric("Regime Risk Level", current_reg_summary.get("current_regime_risk_level", "Unknown"))
            
            sig2 = adj_signal_data["regime_adjusted_signal"]
            color2 = "green" if sig2 == "Bullish" else "red" if sig2 == "Bearish" else "gray"
            r3.markdown(f"**Adjusted Signal**: <span style='color:{color2}; font-size:1.2em;'>{sig2}</span>", unsafe_allow_html=True)
            
            st.info(adj_signal_data["regime_adjustment_reason"])
            
            # Use adjusted signal for interpreting
            sig = sig2
        
            
        # -------------------------------------------------------------------------
        # SECTION 5: Confidence Diagnostics
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Confidence Diagnostics")
        dc1, dc2, dc3, dc4 = st.columns(4)
        dc1.metric("Raw Probability Up", _fmt_pct(signal_data['raw_probability_up']))
        dc2.metric("Calibrated Probability", _fmt_pct(signal_data['calibrated_probability_up']))
        dc3.metric("Brier Score", _fmt_num(suite_results["brier_score"]))
        dc4.metric("Baseline Accuracy", _fmt_pct(suite_results["baseline_accuracy"]))
        
        # -------------------------------------------------------------------------
        # SECTION 6: Model Performance Scorecard
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Model Performance Scorecard")
        st.plotly_chart(ml_plots.plot_model_scorecard(res_df), use_container_width=True)
        
        # -------------------------------------------------------------------------
        # SECTION 7: Walk-Forward Validation
        # -------------------------------------------------------------------------
        if use_wf:
            st.markdown("---")
            st.subheader("Walk-Forward Validation")
            with st.spinner("Running walk-forward cross-validation..."):
                wf_df = signal_walk_forward.run_signal_walk_forward_validation(
                    ml_df, feature_cols, target_col, best_model_name,
                    initial_train_size=1-test_size, step_size=20, ticker=ticker
                )
            
            if not wf_df.empty:
                wf_acc = (wf_df["y_true"] == wf_df["y_pred"]).mean()
                wc1, wc2, wc3 = st.columns(3)
                wc1.metric("WF Accuracy", _fmt_pct(wf_acc))
                wc2.metric("Number of Folds", wf_df["fold"].nunique())
                wc3.metric("Test Samples", len(wf_df))
                
                left, right = st.columns(2)
                with left:
                    st.plotly_chart(ml_plots.plot_walk_forward_fold_metrics(wf_df), use_container_width=True)
                with right:
                    hit_rate = evaluation.calculate_rolling_hit_rate(wf_df["y_true"], wf_df["y_pred"], window=30)
                    st.plotly_chart(ml_plots.plot_rolling_hit_rate(wf_df["Date"], hit_rate), use_container_width=True)
                    
        # -------------------------------------------------------------------------
        # SECTION 8: Feature Intelligence
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Feature Intelligence")
        st.caption("Feature importance shows which signals the model used most, not guaranteed causal drivers.")
        
        fi = suite_results["feature_importance"]
        f1, f2 = st.columns(2)
        with f1:
            st.plotly_chart(ml_plots.plot_feature_importance(fi.head(15)), use_container_width=True)
        with f2:
            st.plotly_chart(ml_plots.plot_feature_group_importance(fi), use_container_width=True)
            
        # -------------------------------------------------------------------------
        # SECTION 9: Signal Timeline
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Signal Timeline")
        
        y_test_probs = pd.Series(suite_results["y_pred_proba"], index=suite_results["X_test"].index)
        dates = ml_df.loc[suite_results["X_test"].index, "Date"] if "Date" in ml_df.columns else suite_results["X_test"].index
        
        t1, t2 = st.columns(2)
        with t1:
            st.plotly_chart(ml_plots.plot_signal_probability_timeline(dates, y_test_probs, bullish_threshold, bearish_threshold), use_container_width=True)
        with t2:
            # If signal is suppressed, pass neutral thresholds to hide markers
            if not signal_data["is_signal_allowed"]:
                b_thresh, br_thresh = 1.1, -0.1
            else:
                b_thresh, br_thresh = bullish_threshold, bearish_threshold
            st.plotly_chart(ml_plots.plot_price_with_signal(ml_df.loc[suite_results["X_test"].index], y_test_probs, b_thresh, br_thresh), use_container_width=True)
            
        # -------------------------------------------------------------------------
        # SECTION 10: Error Diagnostics
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Error Diagnostics")
        
        d1, d2 = st.columns(2)
        with d1:
            st.plotly_chart(ml_plots.plot_classification_confusion_matrix(suite_results["y_test"], suite_results["y_pred"]), use_container_width=True)
        with d2:
            st.plotly_chart(ml_plots.plot_confidence_distribution(y_test_probs), use_container_width=True)
            
        # -------------------------------------------------------------------------
        # SECTION 11: Professional Interpretation
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Professional Interpretation")
        
        grouped = fi.copy()
        def get_group(name):
            name = name.lower()
            if "return" in name: return "Momentum/Returns"
            if "vol" in name: return "Volatility"
            if "ma_" in name or "ema_" in name: return "Trend"
            if "volume" in name: return "Volume"
            if "rsi" in name or "macd" in name or "bollinger" in name: return "Technicals"
            if "benchmark" in name or "relative" in name or "beta" in name: return "Relative Value"
            return "Other"
        grouped["group"] = grouped["feature"].apply(get_group)
        top_groups = grouped.groupby("group")["importance"].sum().nlargest(2).index.tolist()
        
        interp_text = (
            f"The current model shows **{sig}** for {ticker}. "
        )
        if not signal_data["is_signal_allowed"]:
            interp_text += (
                f"Although the latest raw probability is {signal_data['raw_probability_up']*100:.0f}%, "
                f"out-of-sample ROC-AUC is only {roc*100:.1f}%, so the signal is suppressed. "
            )
        else:
            interp_text += (
                f"The model demonstrates a solid edge with a ROC-AUC of **{roc*100:.1f}%**, "
                f"making this a robust quantitative signal. "
            )
            
        if len(top_groups) >= 2:
            interp_text += f"The strongest feature groups are {top_groups[0]} and {top_groups[1]}. "
            
        interp_text += "This should be treated as a research diagnostic, not a trading signal."
            
        st.info(interp_text)
        
        # -------------------------------------------------------------------------
        # SECTION 12: Limitations
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Limitations")
        st.markdown(
            "- **Edge vs Randomness:** Model performance close to random chance (ROC-AUC ~ 50%) means no reliable edge. Market noise often outweighs signal.\n"
            "- **Missing Context:** Missing macro, news, options IV, and earnings data may limit signal quality.\n"
            "- **Regime Shifts:** Financial markets experience structural breaks. Models trained during bull markets may perform poorly in bear regimes.\n"
            "- **Execution Reality:** Transaction costs, slippage, bid-ask spread, and taxes are not included.\n"
            "- **Educational Purpose:** This dashboard is strictly a quantitative research tool and does not constitute financial advice."
        )

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    settings = render_sidebar()
    tickers: list[str] = settings["tickers"]  # type: ignore[assignment]

    if settings["load"]:
        if not tickers:
            st.sidebar.error("Please select at least one ticker.")
        else:
            try:
                with st.spinner("Downloading market data..."):
                    df = load_data(
                        tuple(tickers),
                        str(settings["start_date"]),
                        str(settings["end_date"]),
                    )
                    # Also fetch the matching market benchmarks (Nifty ETF / SPY)
                    # so beta + CAPM can be computed. Benchmark data is kept
                    # separate so it never appears as an analyzed asset.
                    benchmarks = sorted(
                        {config.get_default_benchmark_for_ticker(t) for t in tickers}
                    )
                    benchmark_df = (
                        load_data(tuple(benchmarks), str(settings["start_date"]), str(settings["end_date"]))
                        if benchmarks
                        else pd.DataFrame()
                    )
                if df.empty:
                    st.session_state.pop("data", None)
                    st.session_state.pop("benchmark_data", None)
                    st.sidebar.error("No data returned. Try different tickers or dates.")
                else:
                    st.session_state["data"] = df
                    st.session_state["benchmark_data"] = benchmark_df
                    st.session_state["loaded_tickers"] = tickers
                    fetched = sorted(df["Ticker"].unique().tolist())
                    failed = [t for t in tickers if t not in fetched]
                    st.sidebar.success(f"Loaded {len(df):,} rows for {len(fetched)} ticker(s).")
                    if failed:
                        st.sidebar.warning("Skipped (no data): " + ", ".join(failed))
                    if settings["save_processed"]:
                        _save_processed(df, fetched)
                        st.sidebar.info("Saved raw + processed data under data/.")
            except ProviderError as exc:
                st.sidebar.error(f"Data error: {exc}")
            except Exception as exc:  # never crash the dashboard
                st.sidebar.error(f"Unexpected error: {exc}")

    # Header.
    st.markdown(
        "<div class='finsight-title'>FinSight Alpha</div>"
        "<div class='finsight-subtitle'>AI-Ready Quant Market Analytics Platform</div>",
        unsafe_allow_html=True,
    )

    df = st.session_state.get("data")
    benchmark_df = st.session_state.get("benchmark_data")
    loaded_tickers = st.session_state.get("loaded_tickers", tickers)

    if df is None or df.empty:
        st.info(
            "Use the sidebar to pick an asset universe, tickers, and a date range, "
            "then click **Load / Refresh Data** to begin."
        )
        return

    present = [t for t in loaded_tickers if t in set(df["Ticker"].unique())]
    page = settings["page"]

    if page == "Market Overview":
        page_market_overview(df, present, benchmark_df)
    elif page == "Single Asset Analysis":
        page_single_asset(df, present, str(settings["single_ticker"]), int(settings["vol_window"]), benchmark_df)
    elif page == "Multi-Asset Comparison":
        page_multi_asset(df, present, benchmark_df)
    elif page == "Correlation Heatmap":
        page_correlation(df, present)
    elif page == "Sector Comparison":
        page_sector(df, present)
    elif page == "Risk Summary":
        page_risk(df, present, benchmark_df)
    elif page == "Data Quality Report":
        page_data_quality(df, present)
    elif page == "Option Pricing Lab":
        page_option_pricing()
    elif page == "Monte Carlo Risk Lab":
        page_monte_carlo(df, present)
    elif page == "Portfolio Optimization Lab":
        page_portfolio_optimization(df, present)
    elif page == "Signal Research Lab":
        page_signal_research_lab(df, present, benchmark_df, str(settings["single_ticker"]))
    elif page == "Market Regime Lab":
        page_market_regime_lab(df, present, benchmark_df, str(settings["single_ticker"]))
    elif page == "AI Equity Research Terminal":
        page_ai_equity_research_terminal()


def _save_processed(df: pd.DataFrame, tickers: list[str]) -> None:
    """Persist raw + processed data locally (best-effort, never raises)."""
    try:
        for ticker in tickers:
            group = df[df["Ticker"] == ticker]
            storage.save_raw_data(group, ticker)
            storage.save_processed_data(group, ticker)
        storage.save_combined_processed_data(df)
    except Exception:  # saving must never break the UI
        pass


# -------------------------------------------------------------------------
# RAG Page: AI Equity Research Terminal
# -------------------------------------------------------------------------
def page_ai_equity_research_terminal() -> None:
    import pandas as pd
    import json
    import glob
    import os
    from src.rag.vector_store import LocalVectorStore
    from src import config
    
    st.markdown("<h2 class='finsight-title'>AI Equity Research Terminal</h2>", unsafe_allow_html=True)
    st.markdown("<div class='finsight-subtitle'>Document-grounded company research, factor extraction, and ML-ready intelligence.</div>", unsafe_allow_html=True)
    
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 1: Workspace Setup
    # -------------------------------------------------------------------------
    st.subheader("Research Workspace Setup")
    
    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        selected_ticker = st.selectbox("Select Company Ticker", config.ALL_TICKERS, key="term_ticker")
    with col2:
        research_depth = st.selectbox("Research Depth", ["Quick Scan", "Standard Research", "Deep Research"])
    with col3:
        market = st.selectbox("Market", ["India", "US", "Custom"])
        
    c1, c2 = st.columns([3, 1])
    with c1:
        sources = st.multiselect(
            "Discovery Sources", 
            ["company_ir", "screener", "nse", "bse", "web_search", "local_documents"], 
            default=["company_ir", "screener", "local_documents"]
        )
    with c2:
        respect_robots = st.checkbox("Respect robots.txt", value=True)
        
    colA, colB, colC = st.columns(3)
    
    if "workspace_built" not in st.session_state:
        st.session_state["workspace_built"] = False
        
    with colA:
        if st.button("Build Research Workspace", type="primary"):
            st.session_state["workspace_built"] = True
            st.session_state["active_ticker"] = selected_ticker
            
            from src.rag.screener_snapshot import fetch_screener_snapshot
            with st.spinner("Fetching company snapshot..."):
                snap = fetch_screener_snapshot(selected_ticker)
                st.session_state["company_snapshot"] = snap
                
    with colB:
        if st.button("Discover Documents"):
            if not st.session_state.get("workspace_built"):
                st.warning("Build Workspace first.")
            else:
                from src.rag.document_discovery import discover_financial_documents
                with st.spinner("Discovering documents..."):
                    candidates = discover_financial_documents(
                        ticker=st.session_state["active_ticker"],
                        sources=[s for s in sources if s != "local_documents"],
                        document_types=["annual_report", "earnings_transcript", "investor_presentation"],
                        max_candidates=15,
                        respect_robots=respect_robots
                    )
                    st.session_state["disc_candidates"] = candidates
                    if candidates:
                        st.success(f"Discovered {len(candidates)} candidate documents.")
                    else:
                        st.warning("No candidates discovered.")
                        
    with colC:
        if st.button("Process Selected Documents"):
            from src.rag.document_loader import load_documents_from_folder
            from src.rag.chunker import chunk_documents
            from src.rag.embeddings import embed_texts
            
            with st.spinner("Processing local and downloaded documents..."):
                pages = load_documents_from_folder("data/documents")
                if not pages:
                    st.warning("No documents found in data/documents. Download or upload first.")
                else:
                    chunks = chunk_documents(pages)
                    active_chunks = [c for c in chunks if c.get("ticker") == st.session_state.get("active_ticker")]
                    if not active_chunks:
                        active_chunks = chunks
                    
                    texts = [c["text"] for c in active_chunks]
                    embeddings = embed_texts(texts)
                    vs = LocalVectorStore()
                    vs.build_index(active_chunks, embeddings)
                    vs.save("data/rag_index")
                    
                    st.session_state["rag_store"] = vs
                    st.session_state["rag_chunks"] = active_chunks
                    st.success(f"Indexed {len(active_chunks)} chunks into Workspace.")
                    
    st.markdown("---")
    
    if not st.session_state.get("workspace_built"):
        st.info("Please select a ticker and click 'Build Research Workspace' to begin.")
        return
        
    active_ticker = st.session_state["active_ticker"]
    
    # -------------------------------------------------------------------------
    # SECTION 2: Company Research Header
    # -------------------------------------------------------------------------
    st.subheader("Company Snapshot")
    snap = st.session_state.get("company_snapshot", {})
    
    c_name = snap.get("company_name", active_ticker) if snap.get("success") else active_ticker
    st.markdown(f"### {c_name}")
    
    if snap.get("success"):
        metrics = snap.get("snapshot_metrics", {})
        
        m_cols = st.columns(4)
        m_keys = list(metrics.keys())
        for i, col in enumerate(m_cols):
            if i < len(m_keys):
                k = m_keys[i]
                col.metric(k, metrics[k])
                
        m_cols2 = st.columns(4)
        for i, col in enumerate(m_cols2):
            idx = i + 4
            if idx < len(m_keys):
                k = m_keys[idx]
                col.metric(k, metrics[k])
                
        with st.expander("Business Overview"):
            st.write(snap.get("about", "No summary available."))
    else:
        st.info(f"Screener snapshot unavailable. ({snap.get('message', '')}). Continue with document-based research.")
        
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 3: Research Document Library
    # -------------------------------------------------------------------------
    st.subheader("Research Document Library")
    
    tab1, tab2, tab3, tab4 = st.tabs(["Indexed Documents", "Discovered Candidates", "Manual Upload", "Source Health"])
    
    with tab1:
        if "rag_store" not in st.session_state:
            vs = LocalVectorStore()
            if vs.load("data/rag_index"):
                st.session_state["rag_store"] = vs
                st.session_state["rag_chunks"] = vs.chunks
                
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        
        col1, col2, col3 = st.columns(3)
        col1.metric("Indexed Chunks", len(active_chunks))
        sources = list(set(c.get("source_file", "unknown") for c in active_chunks))
        col2.metric("Indexed Documents", len(sources))
        types = list(set(c.get("document_type", "unknown") for c in active_chunks))
        col3.metric("Document Types", len(types))
        
        if sources:
            st.write("Files in index:")
            st.write(sources)
        else:
            st.info("No documents indexed for this ticker.")
            
    with tab2:
        if "disc_candidates" in st.session_state and st.session_state["disc_candidates"]:
            candidates = st.session_state["disc_candidates"]
            df_c = pd.DataFrame(candidates)
            df_c["Select"] = False
            
            cols = ["Select", "title", "source_name", "document_type", "confidence", "downloadable", "document_url"]
            df_c = df_c[[c for c in cols if c in df_c.columns]]
            
            edited_df = st.data_editor(
                df_c,
                column_config={
                    "Select": st.column_config.CheckboxColumn("Download", default=False),
                    "document_url": st.column_config.LinkColumn("URL")
                },
                hide_index=True,
                key="disc_editor_workspace"
            )
            
            if st.button("Download Selected Documents", type="primary"):
                selected_indices = edited_df[edited_df["Select"] == True].index.tolist()
                selected_candidates = [candidates[i] for i in selected_indices]
                
                if not selected_candidates:
                    st.warning("Please select at least one document.")
                else:
                    from src.rag.download_manager import download_documents_batch
                    from src.rag.source_health import record_source_status, summarize_source_health
                    
                    with st.spinner(f"Downloading {len(selected_candidates)} documents..."):
                        results = download_documents_batch(
                            selected_candidates,
                            output_dir="data/documents",
                            max_downloads=len(selected_candidates),
                            respect_robots=respect_robots
                        )
                        health_records = []
                        success_count = 0
                        
                        for r in results:
                            source = r["candidate"].get("source_name", "Unknown")
                            url = r["result"]["url"]
                            if r["result"]["success"]:
                                success_count += 1
                                health_records.append(record_source_status(source, "Success", "Download successful", url))
                            else:
                                msg = r['result']['message']
                                status_label = "Blocked by robots.txt" if "robots.txt" in msg.lower() else "Failed"
                                health_records.append(record_source_status(source, status_label, msg, url))
                                
                        if "health_records" not in st.session_state:
                            st.session_state["health_records"] = []
                        st.session_state["health_records"].extend(health_records)
                        
                        st.success(f"Downloaded {success_count} documents. View Source Health tab for details.")
        else:
            st.info("Click 'Discover Documents' to find candidates.")
            
    with tab3:
        st.markdown("If a document is blocked by robots.txt or missing, manually upload it here.")
        uploaded_files = st.file_uploader("Upload financial documents (PDF, TXT, DOCX)", accept_multiple_files=True)
        if st.button("Save Uploaded Files"):
            if uploaded_files:
                os.makedirs("data/documents", exist_ok=True)
                for f in uploaded_files:
                    path = f"data/documents/{f.name}"
                    with open(path, "wb") as out_f:
                        out_f.write(f.read())
                    meta = {"ticker": active_ticker, "source_name": "Manual Upload", "document_type": "unknown"}
                    with open(path + ".meta.json", "w") as out_m:
                        json.dump(meta, out_m)
                st.success("Files saved. Go back to Section 1 and click 'Process Selected Documents' to index them.")
                
    with tab4:
        records = st.session_state.get("health_records", [])
        if records:
            from src.rag.source_health import summarize_source_health
            summary_df = summarize_source_health(records)
            st.dataframe(summary_df, hide_index=True, use_container_width=True)
        else:
            st.info("No download actions performed yet.")
            
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 4: AI Research Workspace
    # -------------------------------------------------------------------------
    st.subheader("AI Research Workspace")
    
    preset_questions = [
        "What are the key risks for this company?",
        "What are the main growth drivers?",
        "What does management say about margins?",
        "What are the capex plans?",
        "What are the debt and leverage concerns?",
        "What are the key business segments?"
    ]
    
    q_col1, q_col2 = st.columns([1, 2])
    with q_col1:
        selected_preset = st.radio("Preset Questions", preset_questions)
    with q_col2:
        custom_query = st.text_input("Or ask a custom question:")
        
    query = custom_query if custom_query else selected_preset
    
    if st.button("Search & Answer") and query:
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        vs = st.session_state.get("rag_store")
        
        if not active_chunks or not vs:
            st.warning("No indexed documents found. Discover, download, or upload documents first, then Process them.")
        else:
            from src.rag.retriever import hybrid_retrieve
            from src.rag.reranker import rerank_chunks
            from src.rag.rag_answer import generate_llm_answer
            
            with st.spinner("Generating answer..."):
                retrieved = hybrid_retrieve(query, active_chunks, vector_store=vs, top_k=10)
                reranked = rerank_chunks(query, retrieved, top_k=5)
                answer_data = generate_llm_answer(query, reranked, llm_provider="none")
                
                st.markdown("#### Summary Answer")
                st.info(answer_data["answer"])
                
                st.markdown("#### Supporting Evidence")
                for i, chunk in enumerate(answer_data["retrieved_chunks"]):
                    with st.expander(f"Evidence {i+1} | Score: {chunk.get('rerank_score', 0.0):.2f} | {chunk.get('source_file')}"):
                        st.write(chunk["text"])
                        
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 5: Investment Research Brief
    # -------------------------------------------------------------------------
    st.subheader("Investment Research Brief")
    
    if st.button("Generate Research Brief", type="primary"):
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        snap = st.session_state.get("company_snapshot")
        
        if not active_chunks:
            st.warning("No indexed documents found to generate a brief.")
        else:
            from src.rag.research_brief import generate_research_brief
            with st.spinner("Compiling structured brief..."):
                brief = generate_research_brief(active_ticker, active_chunks, snap)
                st.session_state["research_brief"] = brief
                
    if "research_brief" in st.session_state:
        brief = st.session_state["research_brief"]
        
        col_b1, col_b2 = st.columns(2)
        with col_b1:
            st.markdown("#### Business Overview")
            st.write(brief.get("business_summary", ""))
            
            st.markdown("#### Growth Drivers")
            for g in brief.get("key_growth_drivers", []):
                st.write("- " + g)
                
            st.markdown("#### Margins & Capex")
            st.write(brief.get("margin_outlook", ""))
            st.write(brief.get("capex_and_cashflow", ""))
            
        with col_b2:
            st.markdown("#### Key Risks")
            for r in brief.get("key_risks", []):
                st.write("- " + r)
                
            st.markdown("#### Debt & Balance Sheet")
            st.write(brief.get("debt_and_balance_sheet", ""))
            
            st.markdown("#### Open Questions")
            for oq in brief.get("open_questions", []):
                st.warning(oq)
                
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 6: Factor Extraction Matrix
    # -------------------------------------------------------------------------
    st.subheader("Factor Extraction Matrix")
    st.markdown("Extract structured quant factors from qualitative text.")
    
    if st.button("Compute Factor Matrix"):
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        
        if not active_chunks:
            st.warning("No indexed documents found.")
        else:
            from src.rag.factor_extractor import extract_financial_factors_llm
            from src.visualization import rag_plots
            
            with st.spinner("Extracting institutional factors..."):
                factor_record = extract_financial_factors_llm(active_chunks, ticker=active_ticker)
                st.session_state["last_factor_record"] = factor_record
                
    if "last_factor_record" in st.session_state:
        factor_record = st.session_state["last_factor_record"]
        from src.visualization import rag_plots
        
        st.markdown("#### Multi-Factor Scores")
        
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Overall Sentiment", f"{factor_record['overall_sentiment_score']:.2f}")
        m2.metric("Growth", f"{factor_record['growth_score']:.2f}")
        m3.metric("Risk", f"{factor_record['risk_score']:.2f}")
        m4.metric("Debt Risk", f"{factor_record['debt_risk_score']:.2f}")
        
        m5, m6, m7, m8 = st.columns(4)
        m5.metric("Capex Intensity", f"{factor_record['capex_intensity_score']:.2f}")
        m6.metric("Margin Pressure", f"{factor_record['margin_pressure_score']:.2f}")
        m7.metric("Cash Flow Quality", f"{factor_record.get('cash_flow_quality_score', 0.5):.2f}")
        m8.metric("Management Tone", f"{factor_record.get('management_tone_score', 0.5):.2f}")
        
        p1, p2 = st.columns(2)
        with p1:
            st.plotly_chart(rag_plots.plot_factor_scores(factor_record), use_container_width=True)
        with p2:
            st.plotly_chart(rag_plots.plot_risk_growth_radar(factor_record), use_container_width=True)
            
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 7: Segment Intelligence
    # -------------------------------------------------------------------------
    st.subheader("Segment Intelligence")
    st.markdown("Detect sub-segment performance (e.g. O2C vs Jio vs Retail).")
    
    if st.button("Extract Segment Intelligence"):
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        
        if not active_chunks:
            st.warning("No indexed documents found.")
        else:
            from src.rag.segment_intelligence import extract_segment_intelligence
            with st.spinner("Isolating segments..."):
                seg_intel = extract_segment_intelligence(active_chunks, ticker=active_ticker)
                st.session_state["segment_intelligence"] = seg_intel
                
    if "segment_intelligence" in st.session_state:
        seg_intel = st.session_state["segment_intelligence"]
        segments = seg_intel.get("segments", {})
        
        if not segments:
            st.info("No major business segments cleanly detected in text.")
        else:
            for s_name, s_data in segments.items():
                with st.expander(f"Segment: {s_name} | Sentiment: {s_data['sentiment_score']:.2f} | Evidence: {s_data['evidence_count']}"):
                    c1, c2 = st.columns(2)
                    c1.metric("Growth Score", f"{s_data['growth_score']:.2f}")
                    c2.metric("Risk Score", f"{s_data['risk_score']:.2f}")
                    
                    st.write("**Top Evidence Snippets:**")
                    for ev in s_data["evidence"]:
                        st.write("- " + ev)
                        
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 8: Export to ML Signal Lab
    # -------------------------------------------------------------------------
    st.subheader("Export to ML Signal Lab")
    st.write("These extracted factors are mapped to dates and exported to `data/factors/factor_records.csv` to be used by the Signal Engine.")
    
    if "last_factor_record" in st.session_state:
        factor_record = st.session_state["last_factor_record"]
        if st.button("Save Factor Record"):
            from src.rag.factor_store import save_factor_record
            save_factor_record(factor_record)
            st.success("Factor record securely saved and ready for ML integration.")
    else:
        st.info("Compute Factor Matrix first.")
        
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 9: Limitations
    # -------------------------------------------------------------------------
    with st.expander("Limitations & Compliance"):
        st.markdown(
            """
            - **PDF Extraction:** Extracted text from PDFs can be imperfect due to formatting.
            - **RAG Answers:** RAG answers depend strictly on indexed documents.
            - **Rule-based Extraction:** Rule-based factor extraction is approximate.
            - **Robots.txt:** The downloader respects source policies and will skip blocked files.
            - **Not Financial Advice:** This is an educational and research tool.
            """
        )


if __name__ == "__main__":
    main()
