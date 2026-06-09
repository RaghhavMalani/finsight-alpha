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
from src.visualization import option_plots, plots, simulation_plots, portfolio_plots, ml_plots
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
    "ML Forecasting Lab",
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
        "Focus ticker (Single Asset page)",
        options=tickers if tickers else options,
        index=0,
        help="The ticker shown on the Single Asset Analysis page.",
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

def page_ml_forecasting(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("ML Forecasting Lab")
    
    if not tickers:
        st.warning("Please load at least one ticker to begin.")
        return

    sub_mode = st.radio("Select Mode", ["General ML Forecasting", "Reliance Signal Research Mode"], horizontal=True)
    
    if sub_mode == "Reliance Signal Research Mode":
        page_reliance_signal_research(df)
        return

    st.sidebar.markdown("---")
    st.sidebar.subheader("Section 1: Model Setup")

    ticker = st.sidebar.selectbox("Select ticker", options=tickers)

    task_options = [
        "1. Next-Day Direction Classification",
        "2. Future Return Regression",
        "3. Future Volatility Regression"
    ]
    task = st.sidebar.selectbox("Prediction task", task_options)

    # Defaults and logic based on task
    is_classification = "Classification" in task
    
    if is_classification:
        horizon = st.sidebar.number_input("Target horizon (days)", min_value=1, value=1, step=1)
        model_options = ["Logistic Regression", "Random Forest", "Gradient Boosting"]
    elif "Return" in task:
        horizon = st.sidebar.number_input("Target horizon (days)", min_value=1, value=5, step=1)
        model_options = ["Linear Regression", "Random Forest", "Gradient Boosting"]
    else:
        # Volatility
        horizon = st.sidebar.number_input("Target horizon (days)", min_value=1, value=5, step=1)
        model_options = ["Linear Regression", "Random Forest", "Gradient Boosting"]

    model_choice = st.sidebar.selectbox("Model selection", model_options)
    test_size = st.sidebar.slider("Test size", min_value=0.05, max_value=0.5, value=0.2, step=0.05)
    random_state = st.sidebar.number_input("Random state", value=42, step=1)
    
    run_walk_forward = st.sidebar.checkbox("Run walk-forward validation", value=False)
    
    run_model = st.button("Train ML Model", type="primary")

    if run_model:
        with st.spinner("Preparing features and targets..."):
            # 1. Isolate the data for the ticker
            ticker_df = df[df["Ticker"] == ticker].copy().sort_values("Date").reset_index(drop=True)
            
            # 2. Build features
            feature_df = features.create_ml_feature_dataset(ticker_df)
            
            # 3. Build target
            if "Direction" in task:
                target_col = "target_direction"
                full_df = targets.create_direction_target(feature_df, horizon=horizon)
            elif "Return" in task:
                target_col = f"target_return_{horizon}d"
                full_df = targets.create_future_return_target(feature_df, horizon=horizon)
            else:
                target_col = f"target_volatility_{horizon}d"
                if "log_return" not in feature_df.columns:
                    feature_df["log_return"] = np.log(feature_df["Close"] / feature_df["Close"].shift(1))
                full_df = targets.create_future_volatility_target(feature_df, return_col="log_return", horizon=horizon)
                
            # Drop rows with missing targets
            ml_df = full_df.dropna(subset=[target_col]).reset_index(drop=True)
            
            if ml_df.empty or len(ml_df) < 50:
                st.error("Not enough data to train the model after dropping missing values.")
                return
                
            feature_cols = features.get_feature_columns(ml_df)
            
            # Force Streamlit to drop non-numeric columns in case the module hot-reload was missed
            feature_cols = [c for c in feature_cols if pd.api.types.is_numeric_dtype(ml_df[c])]
            
            st.markdown("---")
            st.subheader("Section 2: Data Preview")
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Total Rows", len(ml_df))
            c2.metric("Number of Features", len(feature_cols))
            c3.metric("Train Size", int(len(ml_df) * (1 - test_size)))
            c4.metric("Test Size", len(ml_df) - int(len(ml_df) * (1 - test_size)))
            
            if is_classification:
                class_balance = ml_df[target_col].mean()
                st.info(f"Class Balance: {class_balance:.1%} positive class (Up), {1 - class_balance:.1%} negative class (Down)")
                
        with st.spinner("Training model..."):
            # Convert model UI string to internal key
            model_key = model_choice.lower().replace(" ", "_")
            model_type = "classification" if is_classification else "regression"
            
            X_train, X_test, y_train, y_test = walk_forward.time_series_train_test_split(
                ml_df, feature_cols, target_col, test_size=test_size
            )
            
            if is_classification:
                model = models.get_classification_model(model_key, random_state=random_state)
            else:
                model = models.get_regression_model(model_key, random_state=random_state)
                
            model = models.train_model(model, X_train, y_train)
            preds, probs = models.make_predictions(model, X_test)
            
            st.markdown("---")
            st.subheader("Section 3: Model Performance")
            
            if is_classification:
                eval_metrics = evaluation.evaluate_classification_model(y_test, preds, probs)
                c1, c2, c3, c4, c5 = st.columns(5)
                c1.metric("Accuracy", _fmt_pct(eval_metrics["accuracy"]))
                c2.metric("Precision", _fmt_pct(eval_metrics["precision"]))
                c3.metric("Recall", _fmt_pct(eval_metrics["recall"]))
                c4.metric("F1 Score", _fmt_pct(eval_metrics["f1_score"]))
                if "roc_auc" in eval_metrics and pd.notna(eval_metrics["roc_auc"]):
                    c5.metric("ROC-AUC", _fmt_pct(eval_metrics["roc_auc"]))
                else:
                    c5.metric("ROC-AUC", "-")
            else:
                eval_metrics = evaluation.evaluate_regression_model(y_test, preds)
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("MAE", _fmt_num(eval_metrics["mae"]))
                c2.metric("RMSE", _fmt_num(eval_metrics["rmse"]))
                c3.metric("R² Score", _fmt_num(eval_metrics["r2_score"]))
                c4.metric("Directional Accuracy", _fmt_pct(eval_metrics["directional_accuracy"]))

            st.markdown("---")
            st.subheader("Section 4: Charts")
            
            feat_imp = models.get_feature_importance(model, feature_cols)
            
            left, right = st.columns(2)
            with left:
                st.plotly_chart(ml_plots.plot_feature_importance(feat_imp), use_container_width=True)
                
                if is_classification and probs is not None:
                    st.plotly_chart(ml_plots.plot_probability_distribution(probs), use_container_width=True)
                elif not is_classification:
                    st.plotly_chart(ml_plots.plot_regression_scatter(y_test, preds), use_container_width=True)
                    
            with right:
                if is_classification:
                    st.plotly_chart(ml_plots.plot_classification_confusion_matrix(y_test, preds), use_container_width=True)
                else:
                    test_dates = ml_df.loc[X_test.index, "Date"] if "Date" in ml_df.columns else None
                    st.plotly_chart(ml_plots.plot_predictions_vs_actual(y_test, preds, test_dates), use_container_width=True)
            
            if run_walk_forward:
                st.markdown("#### Walk-Forward Validation")
                with st.spinner("Running walk-forward validation..."):
                    wf_df = walk_forward.walk_forward_validation(
                        ml_df, feature_cols, target_col, model_type, model_key,
                        initial_train_size=1-test_size, step_size=20, random_state=random_state
                    )
                    if not wf_df.empty:
                        st.plotly_chart(ml_plots.plot_walk_forward_predictions(wf_df), use_container_width=True)
                    else:
                        st.warning("Walk-forward validation failed or returned no data.")
                        
            st.markdown("---")
            st.subheader("Section 5: Latest Prediction")
            
            # Predict the absolute latest available data point (which has no target yet)
            latest_feature_row = feature_df.iloc[-1:]
            latest_X = latest_feature_row[feature_cols]
            latest_pred, latest_prob = models.make_predictions(model, latest_X)
            
            lc1, lc2, lc3 = st.columns(3)
            lc1.metric("Model Used", model_choice)
            lc2.metric("Prediction Horizon", f"{horizon} day(s)")
            
            if is_classification:
                pred_label = "Up" if latest_pred[0] == 1 else "Down"
                lc3.metric("Predicted Direction", pred_label)
                if latest_prob is not None:
                    conf = latest_prob[0] if pred_label == "Up" else (1 - latest_prob[0])
                    st.info(f"Confidence: {_fmt_pct(conf)}")
            else:
                lc3.metric("Predicted Value", _fmt_num(latest_pred[0]))
                
            st.warning("⚠️ **Disclaimer**: These predictions are strictly educational. Machine learning models easily overfit to historical financial data. This is NOT financial advice.")

    st.markdown("---")
    st.subheader("Section 6: Educational Explanation")
    st.markdown(
        "**Why predict returns instead of price?** Prices are non-stationary (they drift upwards over time). Predicting raw price usually results in a model that just predicts yesterday's price, which is practically useless. Predicting returns or direction is much harder, but actually useful.\n\n"
        "**Feature Engineering**: Transforming raw data (Open, High, Low, Close) into meaningful signals like momentum, volatility, and technical indicators.\n\n"
        "**Data Leakage**: The biggest trap in financial ML. If your model accidentally sees future information during training (like using a future rolling average as a feature), it will look perfect in testing but fail completely in reality.\n\n"
        "**Time-Series Split**: Standard random train/test splits (like 80/20 random rows) cause severe data leakage in finance because the model learns from the future to predict the past. We strictly separate train (past) and test (future) chronologically.\n\n"
        "**Walk-Forward Validation**: A robust way to evaluate financial models by training on a rolling window of past data and predicting the immediate future, stepping forward slowly."
    )
    st.subheader("Section 7: Limitations")
    st.markdown(
        "- **Markets are noisy**: The signal-to-noise ratio in financial data is extremely low.\n"
        "- **Past != Future**: Patterns that existed in 2018 may completely disappear in 2024.\n"
        "- **Transaction Costs**: A model might predict small positive returns every day, but trading fees and bid-ask spread would turn it into a loss.\n"
        "- **Overfitting**: Tree models (like Random Forest) can easily memorize the training data. Always check the test set performance.\n"
        "- **Predictions are educational**, not investment advice."
    )

# ---------------------------------------------------------------------------
# Reliance Signal Research Lab
# ---------------------------------------------------------------------------
def page_reliance_signal_research(df: pd.DataFrame) -> None:
    from src.ml import reliance_features, reliance_targets, reliance_modeling, reliance_walk_forward, signal_engine, models, evaluation
    from src.visualization import ml_plots
    import numpy as np
    
    # -------------------------------------------------------------------------
    # SECTION 1: Header
    # -------------------------------------------------------------------------
    st.markdown("<h2 class='finsight-title'>Reliance Signal Research Lab</h2>", unsafe_allow_html=True)
    st.markdown("<div class='finsight-subtitle'>Institutional-style ML diagnostics for RELIANCE.NS</div>", unsafe_allow_html=True)
    st.caption("Educational quantitative research dashboard. Not financial advice.")
    
    # Isolate RELIANCE.NS
    rel_df = df[df["Ticker"] == "RELIANCE.NS"].copy().sort_values("Date").reset_index(drop=True)
    if rel_df.empty:
        st.error("RELIANCE.NS data not found in current dataset. Please load Indian Market with Reliance.")
        return
        
    # Isolate Benchmark
    bm_df = df[df["Ticker"] == "NIFTYBEES.NS"].copy().sort_values("Date").reset_index(drop=True)
    if bm_df.empty:
        bm_df = df[df["Ticker"] == "^NSEI"].copy().sort_values("Date").reset_index(drop=True)
        
    # Generate Features
    with st.spinner("Generating institutional features..."):
        feat_df = reliance_features.create_reliance_signal_features(rel_df, benchmark_df=bm_df)
        
    if feat_df.empty:
        st.error("Failed to generate features. Check data quality.")
        return

    # -------------------------------------------------------------------------
    # SECTION 2: Market Context Strip
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
    
    rel_ret = latest.get("reliance_minus_benchmark_return", 0)
    c9.metric("Rel Return vs Benchmark", _fmt_pct(rel_ret))
    c10.metric("Rolling Beta (60D)", _fmt_num(latest.get("rolling_beta_60", 0)))
    
    # -------------------------------------------------------------------------
    # SECTION 3: Model Control Panel
    # -------------------------------------------------------------------------
    st.sidebar.markdown("---")
    st.sidebar.subheader("Reliance Research Controls")
    
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
    
    bullish_threshold = st.sidebar.slider("Bullish Threshold", 0.50, 0.70, 0.57)
    bearish_threshold = st.sidebar.slider("Bearish Threshold", 0.30, 0.50, 0.43)
    
    run_signal = st.button("Run Reliance Signal Research", type="primary")
    
    if run_signal:
        target_col_base, _ = target_map[target_choice]
        with st.spinner("Building Targets..."):
            ml_df = reliance_targets.create_reliance_targets(feat_df, horizon=horizon)
            
        target_col = target_col_base
        
        feature_cols = [c for c in ml_df.columns if pd.api.types.is_numeric_dtype(ml_df[c])]
        exclude_cols = ["Date", "Ticker", "Open", "High", "Low", "Close", "Volume", "target_return_1d", "target_return_3d", "target_return_5d",
                        "target_direction", "target_strong_up", "target_strong_down", "target_risk_event"]
        feature_cols = [c for c in feature_cols if c not in exclude_cols]
        
        with st.spinner("Training Ensemble..."):
            suite_results = reliance_modeling.train_reliance_model_suite(
                ml_df, feature_cols, target_col, test_size=test_size
            )
            
        res_df = suite_results["model_results"]
        best_model_name = suite_results["best_model_name"]
        prob_up = suite_results["latest_confidence"]
        
        signal_data = signal_engine.generate_trading_signal(
            probability_up=prob_up,
            bullish_threshold=bullish_threshold,
            bearish_threshold=bearish_threshold
        )
        
        # -------------------------------------------------------------------------
        # SECTION 4: Executive Signal Summary
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Executive Signal Summary")
        
        sc1, sc2, sc3, sc4 = st.columns(4)
        sig = signal_data["signal"]
        color = "green" if sig == "Bullish" else "red" if sig == "Bearish" else "gray"
        sc1.markdown(f"**Final Signal**: <span style='color:{color}; font-size:1.2em;'>{sig}</span>", unsafe_allow_html=True)
        sc2.markdown(f"**Signal Strength**: {signal_data['signal_strength']}")
        sc3.markdown(f"**Prob (Up)**: {_fmt_pct(signal_data['probability_up'])}")
        sc4.markdown(f"**Prob (Down)**: {_fmt_pct(signal_data['probability_down'])}")
        
        mc1, mc2, mc3, mc4 = st.columns(4)
        mc1.metric("Best Model", best_model_name)
        
        # Edge calculation
        baseline_acc = evaluation.calculate_baseline_accuracy(suite_results["y_test"])
        edge = evaluation.calculate_model_edge(suite_results["best_model_metrics"]["accuracy"], baseline_acc)
        
        mc2.metric("Model Edge (Accuracy)", f"{edge*100:+.1f}%")
        
        roc = suite_results["best_model_metrics"]["roc_auc"]
        mc3.metric("ROC-AUC", _fmt_pct(roc))
        mc4.metric("F1 Score", _fmt_pct(suite_results["best_model_metrics"]["f1_score"]))
        
        st.info(signal_data["explanation"])
        
        if roc < 0.55:
            st.warning("⚠️ **Model edge is weak.** Treat signal as low-confidence research output.")
        elif 0.45 <= prob_up <= 0.55:
            st.warning("⚠️ **Neutral zone:** model does not have a strong directional edge.")
            
        # -------------------------------------------------------------------------
        # SECTION 5: Model Performance Scorecard
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Model Performance Scorecard")
        st.plotly_chart(ml_plots.plot_model_scorecard(res_df), use_container_width=True)
        
        # -------------------------------------------------------------------------
        # SECTION 6: Walk-Forward Validation
        # -------------------------------------------------------------------------
        if use_wf:
            st.markdown("---")
            st.subheader("Walk-Forward Validation")
            with st.spinner("Running walk-forward cross-validation..."):
                wf_df = reliance_walk_forward.run_reliance_walk_forward_validation(
                    ml_df, feature_cols, target_col, best_model_name,
                    initial_train_size=1-test_size, step_size=20
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
        # SECTION 7: Feature Intelligence
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
        # SECTION 8: Signal Timeline
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Signal Timeline")
        
        y_test_probs = pd.Series(suite_results["y_pred_proba"], index=suite_results["X_test"].index)
        dates = ml_df.loc[suite_results["X_test"].index, "Date"] if "Date" in ml_df.columns else suite_results["X_test"].index
        
        t1, t2 = st.columns(2)
        with t1:
            st.plotly_chart(ml_plots.plot_signal_probability_timeline(dates, y_test_probs, bullish_threshold, bearish_threshold), use_container_width=True)
        with t2:
            st.plotly_chart(ml_plots.plot_reliance_price_with_signal(ml_df.loc[suite_results["X_test"].index], y_test_probs, bullish_threshold, bearish_threshold), use_container_width=True)
            
        # -------------------------------------------------------------------------
        # SECTION 9: Error Diagnostics
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Error Diagnostics")
        
        d1, d2 = st.columns(2)
        with d1:
            st.plotly_chart(ml_plots.plot_classification_confusion_matrix(suite_results["y_test"], suite_results["y_pred"]), use_container_width=True)
        with d2:
            st.plotly_chart(ml_plots.plot_confidence_distribution(y_test_probs), use_container_width=True)
            
        # -------------------------------------------------------------------------
        # SECTION 10: Professional Interpretation
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Professional Interpretation")
        
        grouped = fi.copy()
        def get_group(name):
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
            f"The current ensemble model shows a **{sig}** signal for RELIANCE.NS. "
            f"The latest predicted probability of an upward move is **{prob_up*100:.1f}%**. "
            f"The strongest contributing feature groups driving this decision are **{top_groups[0]}** and **{top_groups[1]}**. "
        )
        if roc < 0.55:
            interp_text += f"However, with a ROC-AUC of just **{roc*100:.1f}%**, the signal separability is weak. This should be interpreted as moderate research evidence rather than a high-conviction trading recommendation."
        else:
            interp_text += f"The model demonstrates a solid edge with a ROC-AUC of **{roc*100:.1f}%**, making this a robust quantitative signal to consider alongside fundamentals."
            
        st.info(interp_text)
        
        # -------------------------------------------------------------------------
        # SECTION 11: Limitations
        # -------------------------------------------------------------------------
        st.subheader("Limitations")
        st.markdown(
            "- **Edge vs Randomness:** A ROC-AUC near 50% implies performance is close to random chance. Market noise often outweighs signal.\n"
            "- **Missing Macro Context:** This model relies on price/volume and benchmark correlation. It does not currently ingest live news sentiment, crude oil prices, USD/INR rates, or options implied volatility.\n"
            "- **Regime Shifts:** Financial markets experience structural breaks. A model trained during a secular bull market may perform poorly in a bear regime.\n"
            "- **Execution Reality:** The model assumes frictionless trading. It does not account for slippage, bid-ask spread, or capital gains taxes.\n"
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
                        - set(tickers)
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
    elif page == "ML Forecasting Lab":
        page_ml_forecasting(df, present)


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


if __name__ == "__main__":
    main()
