"""3D visualization of the Monte Carlo probability cone."""

from __future__ import annotations

import numpy as np
import plotly.graph_objects as go

from src.simulation.mc_distribution import MCProbabilitySurface
from src.visualization.theme import COLORS, FONT_FAMILY

_BAND_COLORS = {5: COLORS["negative"], 50: COLORS["accent_amber"], 95: COLORS["positive"]}


def plot_mc_probability_cone(surface: MCProbabilitySurface) -> go.Figure:
    """Render the time x price probability-density surface in 3D.

    The surface shows how the distribution of the simulated price spreads as the
    horizon extends. Percentile paths (5 / 50 / 95) are drawn on the floor so the
    cone's spread is readable from above too.
    """
    fig = go.Figure(
        data=[
            go.Surface(
                x=surface.prices,
                y=surface.times,
                z=surface.density,
                colorscale="Viridis",
                showscale=True,
                colorbar=dict(title="density", tickfont=dict(color=COLORS["text_muted"])),
                opacity=0.97,
                name="P(price)",
            )
        ]
    )

    # Percentile paths projected onto the floor (z = 0).
    floor = np.zeros_like(surface.times)
    for p, line in surface.percentiles.items():
        fig.add_trace(
            go.Scatter3d(
                x=line, y=surface.times, z=floor,
                mode="lines",
                line=dict(color=_BAND_COLORS.get(p, COLORS["text_muted"]), width=5),
                name=f"P{p}",
            )
        )

    fig.update_layout(
        title=dict(
            text="Monte Carlo Probability Cone "
                 f"<span style='color:{COLORS['text_muted']}'>(price distribution over time)</span>",
            font=dict(size=17, color=COLORS["text"]), x=0.01, xanchor="left",
        ),
        paper_bgcolor=COLORS["background"],
        font=dict(family=FONT_FAMILY, color=COLORS["text"], size=12),
        margin=dict(l=0, r=0, t=55, b=0),
        height=600,
        scene=dict(
            xaxis=_axis("Price"),
            yaxis=_axis("Horizon (years)"),
            zaxis=_axis("Probability density"),
            camera=dict(eye=dict(x=1.7, y=-1.5, z=0.85)),
            bgcolor=COLORS["background"],
        ),
        legend=dict(bgcolor="rgba(0,0,0,0)", font=dict(color=COLORS["text_muted"])),
    )
    return fig


def _axis(title: str) -> dict:
    return dict(
        title=dict(text=title, font=dict(color=COLORS["text_muted"], size=12)),
        backgroundcolor=COLORS["background"],
        gridcolor=COLORS["grid"],
        zerolinecolor=COLORS["grid"],
        color=COLORS["text_muted"],
        showbackground=True,
    )
