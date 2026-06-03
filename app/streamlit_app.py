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
    calculate_annualized_volatility,
    calculate_average_daily_return,
    calculate_best_day,
    calculate_correlation_matrix,
    calculate_data_quality_report,
    calculate_max_drawdown,
    calculate_risk_summary,
    calculate_sector_summary,
    calculate_simple_returns,
    calculate_summary_statistics,
    calculate_total_return,
    calculate_worst_day,
    create_returns_pivot,
    find_highest_correlation_pair,
    find_lowest_correlation_pair,
)
from src.data import storage
from src.data.market_data import MarketDataService
from src.data.providers import ProviderError
from src.visualization import plots
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


def _fmt_pct(x: float) -> str:
    try:
        return f"{x * 100:,.2f}%"
    except (TypeError, ValueError):
        return "-"


def _fmt_num(x: float) -> str:
    try:
        return f"{x:,.2f}"
    except (TypeError, ValueError):
        return "-"


def build_summary(df: pd.DataFrame, tickers: list[str]) -> pd.DataFrame:
    """Per-ticker headline metrics used across several pages.

    Columns: ``Ticker, Name, Sector, latest_close, total_return,
    annualized_volatility, max_drawdown`` (numeric decimals).
    """
    rows: list[dict[str, object]] = []
    for t in tickers:
        prices = _price_series(df, t).dropna()
        if prices.shape[0] < 2:
            continue
        returns = calculate_simple_returns(prices)
        rows.append(
            {
                "Ticker": t,
                "Name": config.get_display_name(t),
                "Sector": config.get_sector(t),
                "latest_close": float(prices.iloc[-1]),
                "total_return": calculate_total_return(prices),
                "annualized_volatility": calculate_annualized_volatility(returns),
                "max_drawdown": calculate_max_drawdown(prices),
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
    st.sidebar.caption("Local-first - no cloud, no API keys. Phase 1.")

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
    summary = build_summary(df, tickers)
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
def page_market_overview(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Market Overview")
    summary = build_summary(df, tickers)
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


def page_single_asset(df: pd.DataFrame, tickers: list[str], default_ticker: str, vol_window: int) -> None:
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
    stats = calculate_summary_statistics(prices)

    st.subheader(f"{config.get_display_name(ticker)} ({ticker}) - {config.get_sector(ticker)}")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Latest Close", _fmt_num(stats["end_price"]))
    c2.metric("Total Return", _fmt_pct(stats["total_return"]))
    c3.metric("Annualized Volatility", _fmt_pct(stats["annualized_volatility"]))
    c4.metric("Max Drawdown", _fmt_pct(stats["max_drawdown"]))

    c5, c6, c7 = st.columns(3)
    c5.metric("Avg Daily Return", _fmt_pct(calculate_average_daily_return(returns)))
    c6.metric("Best Day", _fmt_pct(calculate_best_day(returns)))
    c7.metric("Worst Day", _fmt_pct(calculate_worst_day(returns)))

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
                "Annualized Return", "Annualized Volatility", "Sharpe Ratio",
                "Max Drawdown", "Avg Daily Return", "Best Day", "Worst Day",
            ],
            "Value": [
                f"{int(stats['observations'])}",
                _fmt_num(stats["start_price"]),
                _fmt_num(stats["end_price"]),
                _fmt_pct(stats["total_return"]),
                _fmt_pct(stats["annualized_return"]),
                _fmt_pct(stats["annualized_volatility"]),
                _fmt_num(stats["sharpe_ratio"]),
                _fmt_pct(stats["max_drawdown"]),
                _fmt_pct(stats["average_daily_return"]),
                _fmt_pct(stats["best_day"]),
                _fmt_pct(stats["worst_day"]),
            ],
        }
    )
    st.dataframe(stats_table, use_container_width=True, hide_index=True)


def page_multi_asset(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Multi-Asset Comparison")
    summary = build_summary(df, tickers)
    if summary.empty:
        st.warning("No valid data to compare.")
        return

    st.plotly_chart(plots.plot_normalized_price_comparison(df), use_container_width=True)
    st.plotly_chart(plots.plot_cumulative_return_comparison(df), use_container_width=True)

    st.markdown("---")
    st.subheader("Rankings")
    col1, col2, col3 = st.columns(3)

    with col1:
        st.caption("Total Return (best first)")
        tr = summary.sort_values("total_return", ascending=False)[["Ticker", "total_return"]].copy()
        tr["total_return"] = tr["total_return"].map(_fmt_pct)
        st.dataframe(tr, use_container_width=True, hide_index=True)

    with col2:
        st.caption("Annualized Volatility (lowest first)")
        vol = summary.sort_values("annualized_volatility")[["Ticker", "annualized_volatility"]].copy()
        vol["annualized_volatility"] = vol["annualized_volatility"].map(_fmt_pct)
        st.dataframe(vol, use_container_width=True, hide_index=True)

    with col3:
        st.caption("Max Drawdown (shallowest first)")
        dd = summary.sort_values("max_drawdown", ascending=False)[["Ticker", "max_drawdown"]].copy()
        dd["max_drawdown"] = dd["max_drawdown"].map(_fmt_pct)
        st.dataframe(dd, use_container_width=True, hide_index=True)


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


def page_risk(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Risk Summary")
    risk = calculate_risk_summary(df)
    if risk.empty:
        st.warning("No risk data available for this selection.")
        return

    display = risk.copy()
    for col in ["Annualized Volatility", "Downside Deviation", "Max Drawdown"]:
        display[col] = display[col].map(_fmt_pct)
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
        "and max drawdown."
    )

    st.markdown("---")
    st.subheader("Risk ranking (riskiest first)")
    ranking = risk[["Ticker", "Risk Classification", "Annualized Volatility"]].copy()
    ranking["Annualized Volatility"] = ranking["Annualized Volatility"].map(_fmt_pct)
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
                if df.empty:
                    st.session_state.pop("data", None)
                    st.sidebar.error("No data returned. Try different tickers or dates.")
                else:
                    st.session_state["data"] = df
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
        page_market_overview(df, present)
    elif page == "Single Asset Analysis":
        page_single_asset(df, present, str(settings["single_ticker"]), int(settings["vol_window"]))
    elif page == "Multi-Asset Comparison":
        page_multi_asset(df, present)
    elif page == "Correlation Heatmap":
        page_correlation(df, present)
    elif page == "Sector Comparison":
        page_sector(df, present)
    elif page == "Risk Summary":
        page_risk(df, present)
    elif page == "Data Quality Report":
        page_data_quality(df, present)


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
