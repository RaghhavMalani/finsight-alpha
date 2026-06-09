"""Visualization tools for machine learning models.

Provides Plotly functions to visualize feature importance, confusion matrices,
predictions vs actuals, regression scatters, probability distributions,
and walk-forward validation results.
"""

import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from src.visualization.theme import COLORS


def plot_feature_importance(feature_importance_df: pd.DataFrame) -> go.Figure:
    """Plot a horizontal bar chart of top features.
    
    Args:
        feature_importance_df: DataFrame with 'feature' and 'importance'.
        
    Returns:
        Plotly Figure.
    """
    df = feature_importance_df.head(20).copy() # Show top 20
    df = df.sort_values("importance", ascending=True) # Sort ascending for Plotly horizontal bar
    
    fig = px.bar(
        df,
        x="importance",
        y="feature",
        orientation="h",
        title="Feature Importance",
        template="plotly_dark",
        color_discrete_sequence=[COLORS["accent"]]
    )
    
    fig.update_layout(
        xaxis_title="Importance",
        yaxis_title="Feature",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    
    return fig


def plot_classification_confusion_matrix(y_true, y_pred) -> go.Figure:
    """Plot a heatmap confusion matrix.
    
    Args:
        y_true: True class labels.
        y_pred: Predicted class labels.
        
    Returns:
        Plotly Figure.
    """
    from sklearn.metrics import confusion_matrix
    cm = confusion_matrix(y_true, y_pred)
    
    # We assume binary classification for this lab: 0 (Down) and 1 (Up)
    labels = ["Down (0)", "Up (1)"]
    if cm.shape[0] != 2:
        labels = [str(i) for i in range(cm.shape[0])]
        
    fig = px.imshow(
        cm,
        text_auto=True,
        labels=dict(x="Predicted", y="Actual", color="Count"),
        x=labels,
        y=labels,
        title="Confusion Matrix",
        color_continuous_scale="Blues",
        template="plotly_dark"
    )
    
    return fig


def plot_predictions_vs_actual(y_true, y_pred, dates=None) -> go.Figure:
    """Plot line chart comparing actual and predicted values over time.
    
    Args:
        y_true: True values.
        y_pred: Predicted values.
        dates: Optional array of dates for the x-axis.
        
    Returns:
        Plotly Figure.
    """
    if dates is None:
        dates = np.arange(len(y_true))
        
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=dates, y=y_true,
        mode="lines",
        name="Actual",
        line=dict(color=COLORS["accent"], width=2)
    ))
    
    fig.add_trace(go.Scatter(
        x=dates, y=y_pred,
        mode="lines",
        name="Predicted",
        line=dict(color=COLORS["positive"], width=2, dash="dash")
    ))
    
    fig.update_layout(
        title="Predictions vs Actual",
        xaxis_title="Date / Step",
        yaxis_title="Value",
        template="plotly_dark",
        hovermode="x unified",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    
    return fig


def plot_regression_scatter(y_true, y_pred) -> go.Figure:
    """Plot scatter plot with diagonal reference line for regression results.
    
    Args:
        y_true: True values.
        y_pred: Predicted values.
        
    Returns:
        Plotly Figure.
    """
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=y_true, y=y_pred,
        mode="markers",
        name="Data Points",
        marker=dict(color=COLORS["accent"], opacity=0.6)
    ))
    
    # Add a reference line (y = x)
    min_val = min(np.min(y_true), np.min(y_pred))
    max_val = max(np.max(y_true), np.max(y_pred))
    
    fig.add_trace(go.Scatter(
        x=[min_val, max_val], y=[min_val, max_val],
        mode="lines",
        name="Perfect Prediction",
        line=dict(color="rgba(255, 255, 255, 0.5)", width=2, dash="dash")
    ))
    
    fig.update_layout(
        title="Actual vs Predicted Scatter",
        xaxis_title="Actual Values",
        yaxis_title="Predicted Values",
        template="plotly_dark",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    
    return fig


def plot_walk_forward_predictions(walk_forward_df: pd.DataFrame) -> go.Figure:
    """Plot true vs predicted values from walk-forward validation.
    
    Args:
        walk_forward_df: DataFrame returned by walk_forward_validation.
        
    Returns:
        Plotly Figure.
    """
    dates = walk_forward_df["Date"]
    y_true = walk_forward_df["y_true"]
    y_pred = walk_forward_df["y_pred"]
    
    return plot_predictions_vs_actual(y_true, y_pred, dates=dates)


def plot_probability_distribution(probabilities) -> go.Figure:
    """Plot histogram of predicted probabilities.
    
    Args:
        probabilities: Array-like of predicted probabilities.
        
    Returns:
        Plotly Figure.
    """
    fig = px.histogram(
        x=probabilities,
        nbins=20,
        title="Predicted Probability Distribution",
        template="plotly_dark",
        color_discrete_sequence=[COLORS["positive"]]
    )
    
    fig.update_layout(
        xaxis_title="Probability of Class 1 (Up)",
        yaxis_title="Frequency",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    
    return fig


def plot_model_scorecard(results_df: pd.DataFrame) -> go.Figure:
    """Plot a comparison of model metrics."""
    df_melt = results_df.melt(
        id_vars=["model_name"],
        value_vars=["accuracy", "precision", "recall", "f1_score", "roc_auc"],
        var_name="Metric",
        value_name="Score"
    )
    
    fig = px.bar(
        df_melt,
        x="model_name",
        y="Score",
        color="Metric",
        barmode="group",
        title="Model Performance Scorecard",
        template="plotly_dark",
        text_auto=".2f"
    )
    
    fig.update_layout(
        xaxis_title="Model",
        yaxis_title="Score",
        legend_title="Metric",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    fig.update_yaxes(range=[0, 1.1])
    return fig


def plot_walk_forward_fold_metrics(wf_df: pd.DataFrame) -> go.Figure:
    """Plot accuracy across walk-forward folds."""
    fold_metrics = wf_df.groupby("fold")[["fold_accuracy", "fold_f1", "fold_roc_auc"]].first().reset_index()
    
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=fold_metrics["fold"], y=fold_metrics["fold_accuracy"], mode="lines+markers", name="Accuracy", line=dict(color=COLORS["accent"])))
    fig.add_trace(go.Scatter(x=fold_metrics["fold"], y=fold_metrics["fold_f1"], mode="lines+markers", name="F1 Score", line=dict(color=COLORS["positive"])))
    fig.add_trace(go.Scatter(x=fold_metrics["fold"], y=fold_metrics["fold_roc_auc"], mode="lines+markers", name="ROC-AUC", line=dict(color=COLORS["neutral"])))
    
    fig.update_layout(
        title="Walk-Forward Fold Metrics",
        xaxis_title="Fold",
        yaxis_title="Score",
        template="plotly_dark",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    fig.update_yaxes(range=[0, 1.1])
    return fig


def plot_rolling_hit_rate(dates, hit_rate) -> go.Figure:
    """Plot rolling hit rate over time."""
    fig = px.line(
        x=dates, y=hit_rate,
        title="Rolling Hit Rate (Accuracy)",
        template="plotly_dark"
    )
    fig.update_traces(line_color=COLORS["accent"])
    fig.update_layout(
        xaxis_title="Date",
        yaxis_title="Hit Rate",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    fig.add_hline(y=0.5, line_dash="dash", line_color="white", opacity=0.5)
    return fig


def plot_feature_group_importance(fi: pd.DataFrame) -> go.Figure:
    """Plot aggregated feature importance by group."""
    def get_group(name):
        name = name.lower()
        if "return" in name: return "Momentum/Returns"
        if "vol" in name: return "Volatility"
        if "ma_" in name or "ema_" in name: return "Trend"
        if "volume" in name: return "Volume"
        if "rsi" in name or "macd" in name or "bollinger" in name: return "Technicals"
        if "benchmark" in name or "relative" in name or "beta" in name: return "Relative Value"
        return "Other"
        
    df = fi.copy()
    df["group"] = df["feature"].apply(get_group)
    grouped = df.groupby("group")["importance"].sum().reset_index().sort_values("importance", ascending=True)
    
    fig = px.bar(
        grouped,
        x="importance",
        y="group",
        orientation="h",
        title="Feature Group Importance",
        template="plotly_dark",
        color_discrete_sequence=[COLORS["accent"]]
    )
    fig.update_layout(
        xaxis_title="Total Importance",
        yaxis_title="Feature Group",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    return fig


def plot_signal_probability_timeline(dates, probs, bullish_thresh, bearish_thresh) -> go.Figure:
    """Plot probability timeline with thresholds."""
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=dates, y=probs,
        mode="lines",
        name="Probability (Up)",
        line=dict(color=COLORS["accent"], width=2)
    ))
    
    fig.add_hline(y=bullish_thresh, line_dash="dash", line_color=COLORS["positive"], annotation_text="Bullish")
    fig.add_hline(y=bearish_thresh, line_dash="dash", line_color=COLORS["negative"], annotation_text="Bearish")
    
    fig.update_layout(
        title="Signal Probability Timeline",
        xaxis_title="Date",
        yaxis_title="Probability",
        template="plotly_dark",
        yaxis_range=[0, 1],
        margin=dict(l=20, r=20, t=40, b=20)
    )
    return fig


def plot_price_with_signal(df, probs, bullish_thresh, bearish_thresh) -> go.Figure:
    """Plot asset price overlaying signal markers."""
    # Ensure dates is a Series or array
    if hasattr(df, "columns") and "Date" in df.columns:
        dates = df["Date"]
    else:
        dates = pd.Series(df.index) if hasattr(df, "index") else np.arange(len(df))
        
    close = df["Close"] if hasattr(df, "columns") and "Close" in df.columns else df
    
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=dates, y=close,
        mode="lines",
        name="Close Price",
        line=dict(color="white", width=2)
    ))
    
    probs = pd.Series(probs).values
    bullish_mask = probs >= bullish_thresh
    bearish_mask = probs <= bearish_thresh
    
    # Reindex dates and close to make sure boolean masking aligns properly
    dates_arr = dates.values if hasattr(dates, "values") else np.array(dates)
    close_arr = close.values if hasattr(close, "values") else np.array(close)
    
    fig.add_trace(go.Scatter(
        x=dates_arr[bullish_mask], y=close_arr[bullish_mask],
        mode="markers",
        name="Bullish Signal",
        marker=dict(color=COLORS["positive"], size=10, symbol="triangle-up")
    ))
    
    fig.add_trace(go.Scatter(
        x=dates_arr[bearish_mask], y=close_arr[bearish_mask],
        mode="markers",
        name="Bearish Signal",
        marker=dict(color=COLORS["negative"], size=10, symbol="triangle-down")
    ))
    
    fig.update_layout(
        title="Price with Signals",
        xaxis_title="Date",
        yaxis_title="Price",
        template="plotly_dark",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    return fig


def plot_confidence_distribution(probs) -> go.Figure:
    """Plot confidence distribution."""
    fig = px.histogram(
        x=probs,
        nbins=20,
        title="Signal Confidence Distribution",
        template="plotly_dark",
        color_discrete_sequence=[COLORS["accent"]]
    )
    
    fig.update_layout(
        xaxis_title="Probability of Class 1 (Up)",
        yaxis_title="Count",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    return fig
