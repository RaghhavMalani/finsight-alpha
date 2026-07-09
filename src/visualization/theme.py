"""Professional dashboard theme.

A single source of truth for the FinSight Alpha look-and-feel: a dark,
finance-terminal aesthetic with clean cards, soft borders, and modern typography.

Provides :func:`plotly_layout` / :func:`apply_plotly_theme` - a matching dark
Plotly layout so every chart is styled consistently, plus the shared color
palette and font stacks.
"""

from __future__ import annotations

from typing import Any

import plotly.graph_objects as go

# ---------------------------------------------------------------------------
# Color palette (dark finance terminal)
# ---------------------------------------------------------------------------
COLORS: dict[str, str] = {
    "background": "#000000",      # pure black terminal background
    "surface": "#0a0d12",         # card background (near-black)
    "surface_alt": "#12161d",     # hover / alt rows
    "border": "#222834",          # crisp, subtle borders
    "text": "#e8ecf3",            # primary text
    "text_muted": "#8b95a7",      # secondary text
    "accent": "#4c8bf5",          # primary accent (blue)
    "accent_amber": "#f5a623",    # terminal amber accent
    "positive": "#26c281",        # gains (green)
    "negative": "#ef5350",        # losses (red)
    "neutral": "#8b95a7",         # neutral grey
    "grid": "#141922",            # chart gridlines (very dark)
}

# Monospaced stack for figures/tickers - the terminal feel.
MONO_FONT: str = '"JetBrains Mono", "SF Mono", "Consolas", "Roboto Mono", monospace'

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
        "paper_bgcolor": COLORS["background"],
        "plot_bgcolor": COLORS["background"],
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
