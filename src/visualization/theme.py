"""Professional dashboard theme.

A single source of truth for the FinSight Alpha look-and-feel: a dark,
finance-terminal aesthetic with clean cards, soft borders, and modern typography.

Two pieces:
  * :func:`apply_streamlit_theme` - injects custom CSS into the Streamlit app.
  * :func:`plotly_layout` / :func:`apply_plotly_theme` - a matching dark Plotly
    layout so every chart is styled consistently.
"""

from __future__ import annotations

from typing import Any

import plotly.graph_objects as go

# ---------------------------------------------------------------------------
# Color palette (dark finance terminal)
# ---------------------------------------------------------------------------
COLORS: dict[str, str] = {
    "background": "#0e1117",      # app background (near-black navy)
    "surface": "#161b26",         # card background
    "surface_alt": "#1c2230",     # hover / alt rows
    "border": "#2a3142",          # soft borders
    "text": "#e6e9ef",            # primary text
    "text_muted": "#9aa4b8",      # secondary text
    "accent": "#4c8bf5",          # primary accent (blue)
    "positive": "#26c281",        # gains (green)
    "negative": "#ef5350",        # losses (red)
    "neutral": "#9aa4b8",         # neutral grey
    "grid": "#222a39",            # chart gridlines
}

# Ordered categorical palette for multi-series charts (muted, professional).
CATEGORICAL_PALETTE: list[str] = [
    "#4c8bf5",  # blue
    "#26c281",  # green
    "#f5a623",  # amber
    "#bb6bd9",  # purple
    "#ef5350",  # red
    "#22b8cf",  # cyan
    "#e8638b",  # pink
    "#9aa4b8",  # grey
    "#7ed321",  # lime
    "#f78da7",  # rose
]

FONT_FAMILY: str = (
    '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif'
)


def apply_streamlit_theme() -> str:
    """Return custom CSS for the dashboard (inject via ``st.markdown``).

    The caller does::

        import streamlit as st
        st.markdown(apply_streamlit_theme(), unsafe_allow_html=True)

    Keeping this as a returned string (rather than calling Streamlit here) avoids
    importing Streamlit in the visualization layer and keeps it easy to test.
    """
    return f"""
    <style>
    /* Base app background + typography */
    .stApp {{
        background-color: {COLORS['background']};
        color: {COLORS['text']};
        font-family: {FONT_FAMILY};
    }}

    /* Tighten the top padding for a denser, terminal-like layout */
    .block-container {{
        padding-top: 2rem;
        padding-bottom: 3rem;
        max-width: 1400px;
    }}

    /* Sidebar */
    section[data-testid="stSidebar"] {{
        background-color: {COLORS['surface']};
        border-right: 1px solid {COLORS['border']};
    }}

    /* Headings */
    h1, h2, h3, h4 {{
        color: {COLORS['text']};
        font-family: {FONT_FAMILY};
        font-weight: 600;
        letter-spacing: 0.2px;
    }}

    /* App title block */
    .finsight-title {{
        font-size: 2.0rem;
        font-weight: 700;
        color: {COLORS['text']};
        margin-bottom: 0.1rem;
    }}
    .finsight-subtitle {{
        font-size: 0.95rem;
        color: {COLORS['text_muted']};
        margin-bottom: 1.2rem;
    }}

    /* KPI metric cards */
    div[data-testid="stMetric"] {{
        background-color: {COLORS['surface']};
        border: 1px solid {COLORS['border']};
        border-radius: 12px;
        padding: 16px 18px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.35);
    }}
    div[data-testid="stMetric"] label {{
        color: {COLORS['text_muted']};
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}
    div[data-testid="stMetricValue"] {{
        color: {COLORS['text']};
        font-weight: 700;
    }}

    /* Generic card wrapper (use with st.markdown) */
    .finsight-card {{
        background-color: {COLORS['surface']};
        border: 1px solid {COLORS['border']};
        border-radius: 12px;
        padding: 18px 20px;
        margin-bottom: 16px;
    }}

    /* Tabs */
    button[data-baseweb="tab"] {{
        font-weight: 600;
        color: {COLORS['text_muted']};
    }}
    button[data-baseweb="tab"][aria-selected="true"] {{
        color: {COLORS['accent']};
    }}

    /* Buttons */
    .stButton > button {{
        border-radius: 8px;
        border: 1px solid {COLORS['border']};
        font-weight: 600;
    }}

    /* Dataframes */
    .stDataFrame {{
        border: 1px solid {COLORS['border']};
        border-radius: 10px;
    }}

    /* Hide the default Streamlit menu/footer for a cleaner look */
    #MainMenu {{visibility: hidden;}}
    footer {{visibility: hidden;}}
    </style>
    """


def plotly_layout(title: str | None = None, **overrides: Any) -> dict[str, Any]:
    """Return a dark, professional Plotly layout dict.

    Parameters
    ----------
    title:
        Optional chart title.
    **overrides:
        Extra layout keys merged on top of the defaults (e.g. ``height=420``).

    Returns
    -------
    dict
        A layout dict suitable for ``fig.update_layout(**plotly_layout(...))``.
    """
    layout: dict[str, Any] = {
        "paper_bgcolor": COLORS["surface"],
        "plot_bgcolor": COLORS["surface"],
        "font": {"family": FONT_FAMILY, "color": COLORS["text"], "size": 13},
        "title": {
            "text": title or "",
            "font": {"size": 17, "color": COLORS["text"]},
            "x": 0.01,
            "xanchor": "left",
        },
        "margin": {"l": 50, "r": 25, "t": 55, "b": 45},
        "xaxis": {
            "gridcolor": COLORS["grid"],
            "zerolinecolor": COLORS["grid"],
            "linecolor": COLORS["border"],
            "color": COLORS["text_muted"],
        },
        "yaxis": {
            "gridcolor": COLORS["grid"],
            "zerolinecolor": COLORS["grid"],
            "linecolor": COLORS["border"],
            "color": COLORS["text_muted"],
        },
        "legend": {
            "bgcolor": "rgba(0,0,0,0)",
            "font": {"color": COLORS["text_muted"]},
        },
        "colorway": CATEGORICAL_PALETTE,
        "hovermode": "x unified",
    }
    layout.update(overrides)
    return layout


def apply_plotly_theme(fig: go.Figure, title: str | None = None, **overrides: Any) -> go.Figure:
    """Apply the dark FinSight layout to a figure in place and return it."""
    fig.update_layout(**plotly_layout(title=title, **overrides))
    return fig
