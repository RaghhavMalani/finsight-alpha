"""FinSight Alpha - professional Streamlit dashboard (Phase 1B).

A multi-page market-data analytics dashboard:

  A. Market Overview        - KPI cards + price overview for the selection.
  B. Single Asset Analysis  - deep dive on one ticker (price, returns, vol, dd).
  C. Multi-Asset Comparison - normalised cumulative returns across tickers.
  D. Correlation Heatmap    - return correlations across the selection.
  E. Sector Comparison      - sector-level average return / vol / drawdown.
  F. Data Quality Report    - row counts, date coverage, missing values.

Run from the project root:

    streamlit run app/streamlit_app.py
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
    calculate_correlation_matrix,
    calculate_max_drawdown,
    calculate_sector_summary,
    calculate_simple_returns,
    calculate_summary_statistics,
    build_returns_pivot,
)
from src.data.market_data import MarketDataService
from src.data.providers import AVAILABLE_PROVIDERS, ProviderError
from src.visualization import plots

# ---------------------------------------------------------------------------
# Page configuration
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="FinSight Alpha",
    page_icon="chart_with_upwards_trend",
    layout="wide",
    initial_sidebar_state="expanded",
)

PAGES = [
    "Market Overview",
    "Single Asset Analysis",
    "Multi-Asset Comparison",
    "Correlation Heatmap",
    "Sector Comparison",
    "Data Quality Report",
]


# ---------------------------------------------------------------------------
# Data loading (cached)
# ---------------------------------------------------------------------------
@st.cache_data(show_spinner=False)
def load_data(
    tickers: tuple[str, ...],
    start_date: str,
    end_date: str,
    provider: str,
) -> pd.DataFrame:
    """Download a combined long-format frame for the selected tickers.

    Cached by argument value so re-rendering pages does not re-download. Tickers
    are passed as a tuple because cache keys must be hashable.
    """
    service = MarketDataService(provider)
    return service.get_multiple(list(tickers), start_date, end_date, skip_errors=True)


def _prices_for(df: pd.DataFrame, ticker: str) -> pd.Series:
    """Extract a date-indexed Close price Series for one ticker from the long frame."""
    sub = df[df["Ticker"] == ticker].sort_values("Date")
    return pd.Series(sub["Close"].values, index=pd.to_datetime(sub["Date"]), name=ticker)


def _fmt_pct(x: float) -> str:
    return f"{x * 100:,.2f}%"


# ---------------------------------------------------------------------------
# Sidebar controls
# ---------------------------------------------------------------------------
def render_sidebar() -> dict[str, object]:
    """Render the sidebar controls and return the chosen settings."""
    st.sidebar.title("FinSight Alpha")
    st.sidebar.caption("Phase 1B - Market Analytics Dashboard")

    page = st.sidebar.radio("Navigation", PAGES, index=0)

    st.sidebar.markdown("---")
    st.sidebar.subheader("Data Selection")

    tickers = st.sidebar.multiselect(
        "Tickers",
        options=config.ALL_TICKERS,
        default=config.DEFAULT_TICKERS,
        help="Choose one or more symbols to analyse.",
    )

    today = pd.Timestamp.today().normalize()
    default_start = pd.Timestamp(config.DEFAULT_START_DATE)
    date_range = st.sidebar.date_input(
        "Date range",
        value=(default_start.date(), today.date()),
        help="Inclusive start, exclusive end.",
    )

    provider = st.sidebar.selectbox(
        "Data provider",
        options=AVAILABLE_PROVIDERS,
        index=AVAILABLE_PROVIDERS.index("yfinance") if "yfinance" in AVAILABLE_PROVIDERS else 0,
        help="yfinance is the default. Others are Phase 1C placeholders.",
    )

    load = st.sidebar.button("Load data", type="primary", use_container_width=True)

    # Normalise the date range into ISO strings.
    if isinstance(date_range, (tuple, list)) and len(date_range) == 2:
        start_date, end_date = str(date_range[0]), str(date_range[1])
    else:
        start_date, end_date = config.DEFAULT_START_DATE, config.DEFAULT_END_DATE

    return {
        "page": page,
        "tickers": tickers,
        "start_date": start_date,
        "end_date": end_date,
        "provider": provider,
        "load": load,
    }


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
def page_market_overview(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Market Overview")
    st.write("Headline metrics across your selected tickers.")

    rows = []
    for t in tickers:
        prices = _prices_for(df, t)
        if prices.dropna().shape[0] < 2:
            continue
        stats = calculate_summary_statistics(prices)
        rows.append(
            {
                "Ticker": t,
                "Sector": config.get_sector(t),
                "Latest Close": round(stats["end_price"], 2),
                "Total Return": stats["total_return"],
                "Ann. Volatility": stats["annualized_volatility"],
                "Max Drawdown": stats["max_drawdown"],
                "Sharpe": round(stats["sharpe_ratio"], 2),
            }
        )

    if not rows:
        st.warning("No valid data to summarise for the current selection.")
        return

    summary = pd.DataFrame(rows)

    # KPI cards for the first (or best) ticker as a headline.
    best = summary.sort_values("Total Return", ascending=False).iloc[0]
    c1, c2, c3, c4 = st.columns(4)
    c1.metric(f"{best['Ticker']} Latest Close", f"{best['Latest Close']:,.2f}")
    c2.metric("Total Return", _fmt_pct(best["Total Return"]))
    c3.metric("Ann. Volatility", _fmt_pct(best["Ann. Volatility"]))
    c4.metric("Max Drawdown", _fmt_pct(best["Max Drawdown"]))

    st.markdown("---")
    # Format percentage columns for the table.
    display = summary.copy()
    for col in ["Total Return", "Ann. Volatility", "Max Drawdown"]:
        display[col] = display[col].map(_fmt_pct)
    st.dataframe(display, use_container_width=True, hide_index=True)


def page_single_asset(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Single Asset Analysis")
    ticker = st.selectbox("Select a ticker", options=tickers)
    prices = _prices_for(df, ticker)

    if prices.dropna().shape[0] < 2:
        st.warning(f"Not enough data for {ticker}.")
        return

    stats = calculate_summary_statistics(prices)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Latest Close", f"{stats['end_price']:,.2f}")
    c2.metric("Total Return", _fmt_pct(stats["total_return"]))
    c3.metric("Ann. Volatility", _fmt_pct(stats["annualized_volatility"]))
    c4.metric("Max Drawdown", _fmt_pct(stats["max_drawdown"]))

    returns = calculate_simple_returns(prices)

    st.plotly_chart(
        plots.plot_price_history(prices, title=f"{ticker} - Price History"),
        use_container_width=True,
    )
    left, right = st.columns(2)
    with left:
        st.plotly_chart(
            plots.plot_cumulative_returns(returns, title=f"{ticker} - Cumulative Returns"),
            use_container_width=True,
        )
        st.plotly_chart(
            plots.plot_daily_returns(returns, title=f"{ticker} - Daily Returns"),
            use_container_width=True,
        )
    with right:
        st.plotly_chart(
            plots.plot_rolling_volatility(returns, title=f"{ticker} - Rolling Volatility"),
            use_container_width=True,
        )
        st.plotly_chart(
            plots.plot_drawdown(prices, title=f"{ticker} - Drawdown"),
            use_container_width=True,
        )


def page_multi_asset(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Multi-Asset Comparison")
    st.write("Normalised cumulative returns - compare growth of 1 unit invested.")

    import plotly.graph_objects as go

    fig = go.Figure()
    plotted = 0
    for t in tickers:
        prices = _prices_for(df, t)
        if prices.dropna().shape[0] < 2:
            continue
        returns = calculate_simple_returns(prices)
        from src.analytics import calculate_cumulative_returns

        cum = calculate_cumulative_returns(returns) * 100.0
        fig.add_trace(go.Scatter(x=cum.index, y=cum.values, mode="lines", name=t))
        plotted += 1

    if plotted == 0:
        st.warning("No valid data to compare.")
        return

    fig.update_layout(
        title="Cumulative Returns Comparison",
        xaxis_title="Date",
        yaxis_title="Cumulative Return (%)",
        template="plotly_white",
    )
    st.plotly_chart(fig, use_container_width=True)


def page_correlation(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Correlation Heatmap")
    st.write("Pearson correlation of daily returns. Low correlation = diversification.")

    if len(tickers) < 2:
        st.info("Select at least two tickers to compute correlations.")
        return

    returns_wide = build_returns_pivot(df)
    corr = calculate_correlation_matrix(returns_wide)
    if corr.empty:
        st.warning("Could not compute a correlation matrix for this selection.")
        return

    st.plotly_chart(plots.plot_correlation_heatmap(corr), use_container_width=True)


def page_sector(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Sector Comparison")
    summary = calculate_sector_summary(df)
    if summary.empty:
        st.warning("No sector data available for this selection.")
        return

    metric = st.selectbox(
        "Metric",
        options=["avg_total_return", "avg_annualized_volatility", "avg_max_drawdown"],
        format_func=lambda m: m.replace("_", " ").title(),
    )
    st.plotly_chart(plots.plot_sector_comparison(summary, metric=metric), use_container_width=True)

    display = summary.copy()
    for col in ["avg_total_return", "avg_annualized_volatility", "avg_max_drawdown"]:
        display[col] = display[col].map(_fmt_pct)
    st.dataframe(display, use_container_width=True)


def page_data_quality(df: pd.DataFrame, tickers: list[str]) -> None:
    st.header("Data Quality Report")
    st.write("Coverage and integrity checks for the loaded data.")

    rows = []
    for t in tickers:
        sub = df[df["Ticker"] == t]
        if sub.empty:
            rows.append({"Ticker": t, "Rows": 0, "Start": "-", "End": "-", "Missing Close": "-"})
            continue
        rows.append(
            {
                "Ticker": t,
                "Rows": len(sub),
                "Start": str(pd.to_datetime(sub["Date"]).min().date()),
                "End": str(pd.to_datetime(sub["Date"]).max().date()),
                "Missing Close": int(sub["Close"].isna().sum()),
            }
        )
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

    total_missing = int(df[["Open", "High", "Low", "Close", "Volume"]].isna().sum().sum()) if not df.empty else 0
    if total_missing == 0:
        st.success("No missing OHLCV values detected in the loaded data.")
    else:
        st.warning(f"Detected {total_missing} missing OHLCV values across the selection.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    settings = render_sidebar()
    page = settings["page"]
    tickers: list[str] = settings["tickers"]  # type: ignore[assignment]

    # Persist loaded data across page switches using session state.
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
                        str(settings["provider"]),
                    )
                if df.empty:
                    st.session_state.pop("data", None)
                    st.sidebar.error("No data returned. Try different tickers or dates.")
                else:
                    st.session_state["data"] = df
                    st.session_state["loaded_tickers"] = tickers
                    st.sidebar.success(f"Loaded {len(df):,} rows for {len(tickers)} tickers.")
            except ProviderError as exc:
                st.sidebar.error(f"Data error: {exc}")
            except Exception as exc:  # defensive: never crash the dashboard
                st.sidebar.error(f"Unexpected error: {exc}")

    df = st.session_state.get("data")
    loaded_tickers = st.session_state.get("loaded_tickers", tickers)

    if df is None or df.empty:
        st.title("FinSight Alpha")
        st.info(
            "Select tickers, a date range, and a provider in the sidebar, then "
            "click **Load data** to begin."
        )
        return

    # Only show tickers that are actually present in the loaded data.
    present = [t for t in loaded_tickers if t in set(df["Ticker"].unique())]

    if page == "Market Overview":
        page_market_overview(df, present)
    elif page == "Single Asset Analysis":
        page_single_asset(df, present)
    elif page == "Multi-Asset Comparison":
        page_multi_asset(df, present)
    elif page == "Correlation Heatmap":
        page_correlation(df, present)
    elif page == "Sector Comparison":
        page_sector(df, present)
    elif page == "Data Quality Report":
        page_data_quality(df, present)


if __name__ == "__main__":
    main()
