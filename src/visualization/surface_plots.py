"""3D + 2D visualizations for the implied volatility surface.

* :func:`plot_vol_surface_3d` - the signature terminal view: a rotatable 3D
  implied-vol surface over strike x maturity, with the raw solved quotes shown
  as points so the fit is auditable.
* :func:`plot_vol_smile` - a 2D smile slice (IV vs strike) at one maturity.
* :func:`plot_atm_term_structure` - ATM implied vol vs maturity.

All charts use the shared dark terminal theme.
"""

from __future__ import annotations

import numpy as np
import plotly.graph_objects as go

from src.pricing.vol_surface import VolSurface
from src.visualization.theme import COLORS, FONT_FAMILY, apply_plotly_theme

# A perceptually-uniform colorscale reads as "quant terminal" and prints well.
_SURFACE_COLORSCALE = "Viridis"


def plot_vol_surface_3d(
    surface: VolSurface,
    use_strike_axis: bool = True,
    show_points: bool = True,
) -> go.Figure:
    """Render the implied volatility surface in 3D.

    Parameters
    ----------
    surface:
        The :class:`VolSurface` to render.
    use_strike_axis:
        If True, the moneyness axis is shown as absolute strikes; otherwise as
        log-moneyness ln(K/S).
    show_points:
        Overlay the raw per-option solved IVs as a scatter so a viewer can see
        how well the smooth surface fits the quotes.
    """
    x = surface.strike_axis() if use_strike_axis else surface.log_moneyness
    x_title = "Strike" if use_strike_axis else "Log-moneyness ln(K/S)"
    y = surface.maturities
    z = surface.iv_grid * 100.0  # show IV in percent

    fig = go.Figure(
        data=[
            go.Surface(
                x=x,
                y=y,
                z=z,
                colorscale=_SURFACE_COLORSCALE,
                colorbar=dict(title="IV %", tickfont=dict(color=COLORS["text_muted"])),
                contours={
                    "z": {"show": True, "usecolormap": True, "project_z": True,
                          "width": 1},
                },
                opacity=0.96,
                name="IV surface",
            )
        ]
    )

    if show_points and surface.points is not None and not surface.points.empty:
        pts = surface.points
        px = pts["strike"] if use_strike_axis else pts["log_moneyness"]
        fig.add_trace(
            go.Scatter3d(
                x=px,
                y=pts["T"],
                z=pts["iv"] * 100.0,
                mode="markers",
                marker=dict(size=2.5, color=COLORS["text"], opacity=0.5),
                name="Quoted IV",
                hovertemplate="K=%{x:.1f}<br>T=%{y:.2f}y<br>IV=%{z:.1f}%<extra></extra>",
            )
        )

    src_tag = "synthetic demo data" if surface.source == "synthetic" else "live option chain"
    fig.update_layout(
        title=dict(
            text=f"Implied Volatility Surface · {surface.ticker} "
                 f"<span style='color:{COLORS['text_muted']}'>({src_tag})</span>",
            font=dict(size=17, color=COLORS["text"]), x=0.01, xanchor="left",
        ),
        paper_bgcolor=COLORS["surface"],
        font=dict(family=FONT_FAMILY, color=COLORS["text"], size=12),
        margin=dict(l=0, r=0, t=55, b=0),
        height=620,
        scene=dict(
            xaxis=_scene_axis(x_title),
            yaxis=_scene_axis("Maturity (years)"),
            zaxis=_scene_axis("Implied vol (%)"),
            camera=dict(eye=dict(x=1.6, y=-1.6, z=0.9)),
            bgcolor=COLORS["surface"],
        ),
        legend=dict(bgcolor="rgba(0,0,0,0)", font=dict(color=COLORS["text_muted"])),
    )
    return fig


def _scene_axis(title: str) -> dict:
    """Dark-themed axis config for a 3D scene."""
    return dict(
        title=dict(text=title, font=dict(color=COLORS["text_muted"], size=12)),
        backgroundcolor=COLORS["surface"],
        gridcolor=COLORS["grid"],
        zerolinecolor=COLORS["grid"],
        color=COLORS["text_muted"],
        showbackground=True,
    )


def plot_vol_smile(surface: VolSurface, maturity: float) -> go.Figure:
    """2D implied-vol smile (IV vs strike) at the maturity nearest ``maturity``."""
    smile = surface.smile(maturity)
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=smile["strike"],
            y=smile["iv"] * 100.0,
            mode="lines+markers",
            line=dict(color=COLORS["accent"], width=3),
            marker=dict(size=5),
            name=f"T = {smile['maturity'].iloc[0]:.2f}y",
        )
    )
    # Mark the spot (ATM) for orientation.
    fig.add_vline(
        x=surface.spot, line_dash="dot", line_color=COLORS["text_muted"],
        annotation_text="Spot", annotation_position="top",
    )
    apply_plotly_theme(
        fig,
        title=f"Volatility Smile · {surface.ticker} · T≈{smile['maturity'].iloc[0]:.2f}y",
        height=380, hovermode="x",
    )
    fig.update_xaxes(title_text="Strike")
    fig.update_yaxes(title_text="Implied vol (%)")
    return fig


def plot_atm_term_structure(surface: VolSurface) -> go.Figure:
    """ATM implied vol as a function of maturity (the term structure)."""
    ts = surface.atm_term_structure()
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=ts["T"],
            y=ts["atm_iv"] * 100.0,
            mode="lines+markers",
            line=dict(color=COLORS["positive"], width=3),
            marker=dict(size=5),
            name="ATM IV",
        )
    )
    apply_plotly_theme(
        fig, title=f"ATM Term Structure · {surface.ticker}", height=380, hovermode="x"
    )
    fig.update_xaxes(title_text="Maturity (years)")
    fig.update_yaxes(title_text="ATM implied vol (%)")
    return fig
