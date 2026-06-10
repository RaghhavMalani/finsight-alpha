import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from .theme import apply_plotly_theme

# Common color map for regimes to ensure consistency
REGIME_COLORS = {
    "Low-Vol Bullish": "#2ECC71",    # Green
    "High-Vol Bearish": "#E74C3C",   # Red
    "Stress / Selloff": "#9B59B6",   # Purple
    "Sideways / Choppy": "#F1C40F",  # Yellow
    "Recovery": "#3498DB",           # Blue
    "Unknown": "#95A5A6"             # Gray
}

def plot_price_with_regimes(
    df: pd.DataFrame,
    price_col: str = "Close",
    regime_col: str = "regime_label",
    date_col: str = "Date"
) -> go.Figure:
    """Show price line with colored background regions for regimes."""
    fig = go.Figure()
    
    # Plot price line
    if date_col not in df.columns:
        x_data = df.index
    else:
        x_data = df[date_col]
        
    fig.add_trace(go.Scatter(
        x=x_data,
        y=df[price_col],
        mode="lines",
        name="Price",
        line=dict(color="#ECF0F1", width=1.5)
    ))
    
    # Add regime backgrounds
    # We find contiguous blocks of the same regime
    if regime_col in df.columns:
        out = df.copy()
        if date_col not in out.columns:
            out["Date"] = out.index
            
        out["regime_block"] = (out[regime_col] != out[regime_col].shift(1)).cumsum()
        
        for block_id, group in out.groupby("regime_block"):
            regime = group[regime_col].iloc[0]
            color = REGIME_COLORS.get(regime, REGIME_COLORS["Unknown"])
            
            start_x = group["Date"].iloc[0]
            end_x = group["Date"].iloc[-1]
            
            fig.add_vrect(
                x0=start_x,
                x1=end_x,
                fillcolor=color,
                opacity=0.2,
                layer="below",
                line_width=0,
                name=regime
            )
            
    fig.update_layout(
        title="Price with Hidden Market Regimes",
        xaxis_title="Date",
        yaxis_title="Price",
        hovermode="x unified",
        showlegend=False
    )
    return apply_plotly_theme(fig)

def plot_recent_regime_timeline(
    df: pd.DataFrame,
    price_col: str = "Close",
    regime_col: str = "regime_label",
    date_col: str = "Date",
    years: int = 3
) -> go.Figure:
    """Show recent price line with colored background regions for regimes."""
    out = df.copy()
    if date_col not in out.columns:
        out["Date"] = out.index
    
    out["Date"] = pd.to_datetime(out["Date"])
    latest_date = out["Date"].max()
    cutoff_date = latest_date - pd.DateOffset(years=years)
    recent_df = out[out["Date"] >= cutoff_date]
    
    fig = plot_price_with_regimes(recent_df, price_col, regime_col, date_col)
    # The title will be set, but we can override it
    fig.update_layout(title=f"Recent {years}-Year Regime Timeline")
    return fig


def plot_regime_timeline(
    df: pd.DataFrame,
    regime_col: str = "regime_label",
    date_col: str = "Date"
) -> go.Figure:
    """Show regimes over time as categorical color bands."""
    fig = go.Figure()
    
    if date_col not in df.columns:
        x_data = df.index
    else:
        x_data = df[date_col]
        
    fig.add_trace(go.Scatter(
        x=x_data,
        y=df[regime_col],
        mode="markers",
        marker=dict(
            color=[REGIME_COLORS.get(r, REGIME_COLORS["Unknown"]) for r in df[regime_col]],
            symbol="square",
            size=10
        ),
        name="Regime"
    ))
    
    fig.update_layout(
        title="Regime Timeline",
        xaxis_title="Date",
        yaxis_title="Regime",
        yaxis=dict(type="category")
    )
    return apply_plotly_theme(fig)

def plot_regime_probability(
    df: pd.DataFrame,
    prob_col: str = "regime_probability",
    regime_col: str = "regime_label",
    date_col: str = "Date"
) -> go.Figure:
    """Show probability/confidence of current assigned regime over time."""
    fig = go.Figure()
    
    if date_col not in df.columns:
        x_data = df.index
    else:
        x_data = df[date_col]
        
    fig.add_trace(go.Scatter(
        x=x_data,
        y=df[prob_col],
        mode="lines",
        line=dict(width=1, color="rgba(255, 255, 255, 0.5)"),
        name="Probability",
        showlegend=False
    ))
    
    # Color by regime
    fig.add_trace(go.Scatter(
        x=x_data,
        y=df[prob_col],
        mode="markers",
        marker=dict(
            color=[REGIME_COLORS.get(r, REGIME_COLORS["Unknown"]) for r in df[regime_col]],
            size=4
        ),
        name="State Prob"
    ))
    
    fig.update_layout(
        title="Regime Assignment Probability",
        xaxis_title="Date",
        yaxis_title="Probability",
        yaxis=dict(range=[0, 1.05], tickformat=".0%")
    )
    return apply_plotly_theme(fig)

def plot_regime_transition_matrix(transition_matrix: pd.DataFrame) -> go.Figure:
    """Heatmap of transition probabilities."""
    
    if transition_matrix.empty:
        return go.Figure()
        
    labels = transition_matrix.columns.tolist()
    z = transition_matrix.values
    
    fig = go.Figure(data=go.Heatmap(
        z=z,
        x=labels,
        y=transition_matrix.index.tolist(),
        colorscale="Viridis",
        text=np.round(z, 2),
        texttemplate="%{text}",
        hoverinfo="z"
    ))
    
    fig.update_layout(
        title="Regime Transition Probability Matrix",
        xaxis_title="To Next State",
        yaxis_title="From Current State"
    )
    return apply_plotly_theme(fig)

def plot_regime_performance(performance_df: pd.DataFrame) -> go.Figure:
    """Bar chart comparing annualized return, volatility, and positive-day rate by regime."""
    
    if performance_df.empty:
        return go.Figure()
        
    fig = go.Figure()
    
    labels = performance_df["regime_label"]
    colors = [REGIME_COLORS.get(lbl, REGIME_COLORS["Unknown"]) for lbl in labels]
    
    # Annualized Return
    fig.add_trace(go.Bar(
        x=labels,
        y=performance_df["annualized_return"],
        name="Ann. Return",
        marker_color=colors,
        text=performance_df["annualized_return"].apply(lambda x: f"{x:.1%}"),
        textposition="auto"
    ))
    
    fig.update_layout(
        title="Annualized Return by Market Regime",
        xaxis_title="Regime",
        yaxis_title="Return",
        yaxis=dict(tickformat=".0%")
    )
    return apply_plotly_theme(fig)

def plot_regime_duration(duration_df: pd.DataFrame) -> go.Figure:
    """Show duration of each regime episode."""
    
    if duration_df.empty:
        return go.Figure()
        
    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        x=duration_df["end_date"],
        y=duration_df["duration_days"],
        marker_color=[REGIME_COLORS.get(r, REGIME_COLORS["Unknown"]) for r in duration_df["regime_label"]],
        text=duration_df["regime_label"],
        hovertemplate="<b>%{text}</b><br>Ended: %{x}<br>Duration: %{y} days<extra></extra>"
    ))
    
    fig.update_layout(
        title="Regime Episode Duration",
        xaxis_title="Date",
        yaxis_title="Duration (Days)"
    )
    return apply_plotly_theme(fig)

def plot_regime_duration_distribution(duration_df: pd.DataFrame) -> go.Figure:
    """Show average and maximum duration by regime."""
    if duration_df.empty:
        return go.Figure()
        
    stats = duration_df.groupby("regime_label")["duration_days"].agg(["mean", "max"]).reset_index()
    
    fig = go.Figure()
    colors = [REGIME_COLORS.get(r, REGIME_COLORS["Unknown"]) for r in stats["regime_label"]]
    
    fig.add_trace(go.Bar(
        name="Average Duration",
        x=stats["regime_label"],
        y=stats["mean"],
        marker_color=colors,
        opacity=0.8,
        text=stats["mean"].round(0).astype(int),
        textposition='auto'
    ))
    
    fig.add_trace(go.Scatter(
        name="Max Duration",
        x=stats["regime_label"],
        y=stats["max"],
        mode="markers",
        marker=dict(
            symbol="line-ew",
            size=30,
            color="white",
            line=dict(width=3)
        )
    ))
    
    fig.update_layout(
        title="Regime Duration Distribution (Average vs Max)",
        xaxis_title="Regime",
        yaxis_title="Days",
        barmode="overlay",
        showlegend=True
    )
    
    return apply_plotly_theme(fig)

def plot_regime_feature_scatter(
    df: pd.DataFrame,
    x_col: str = "realized_vol_20",
    y_col: str = "rolling_return_20",
    regime_col: str = "regime_label"
) -> go.Figure:
    """Scatter of vol vs return colored by regime."""
    
    if x_col not in df.columns or y_col not in df.columns or regime_col not in df.columns:
        return go.Figure()
        
    fig = go.Figure()
    
    for regime, group in df.groupby(regime_col):
        fig.add_trace(go.Scatter(
            x=group[x_col],
            y=group[y_col],
            mode="markers",
            name=regime,
            marker=dict(
                color=REGIME_COLORS.get(regime, REGIME_COLORS["Unknown"]),
                size=6,
                opacity=0.7
            )
        ))
        
    fig.update_layout(
        title="Regime Feature Space (Return vs Volatility)",
        xaxis_title=x_col.replace("_", " ").title(),
        yaxis_title=y_col.replace("_", " ").title()
    )
    return apply_plotly_theme(fig)
