import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
from typing import Dict, Any, List

def plot_factor_scores(factor_record: Dict[str, Any]) -> go.Figure:
    """Plot a bar chart of factor scores."""
    factors = [
        "overall_sentiment_score", "growth_score", "cash_flow_quality_score", "management_tone_score",
        "risk_score", "debt_risk_score", "capex_intensity_score", "margin_pressure_score", "regulatory_risk_score"
    ]
    
    labels = [f.replace("_score", "").replace("_", " ").title() for f in factors]
    scores = [factor_record.get(f, 0.0) for f in factors]
    
    # Color based on value and type
    colors = []
    for i, f in enumerate(factors):
        val = scores[i]
        if f in ["risk_score", "debt_risk_score", "capex_intensity_score", "margin_pressure_score", "regulatory_risk_score"]:
            colors.append('salmon' if val > 0.3 else ('lightgray' if val == 0 else 'red'))
        else:
            colors.append('green' if val > 0 else ('red' if val < 0 else 'lightgray'))
            
    fig = go.Figure(data=[
        go.Bar(
            x=labels, 
            y=scores,
            marker_color=colors,
            text=[f"{s:.2f}" for s in scores],
            textposition='auto'
        )
    ])
    
    fig.update_layout(
        title="Extracted Financial Factors",
        xaxis_title="Factor",
        yaxis_title="Score",
        yaxis=dict(range=[-1.1, 1.1]),
        template="plotly_dark",
        margin=dict(l=20, r=20, t=40, b=20)
    )
    
    return fig

def plot_risk_growth_radar(factor_record: Dict[str, Any]) -> go.Figure:
    """Plot a radar chart for key metrics."""
    categories = ['Growth', 'Sentiment', 'Cash Flow', 'Management', 'Risk', 'Debt', 'Capex', 'Margin']
    
    # Scale all to 0-1 for radar chart
    values = [
        (factor_record.get('growth_score', 0.0) + 1) / 2,
        (factor_record.get('overall_sentiment_score', 0.0) + 1) / 2,
        (factor_record.get('cash_flow_quality_score', 0.0) + 1) / 2,
        (factor_record.get('management_tone_score', 0.0) + 1) / 2,
        factor_record.get('risk_score', 0.0),
        factor_record.get('debt_risk_score', 0.0),
        factor_record.get('capex_intensity_score', 0.0),
        factor_record.get('margin_pressure_score', 0.0)
    ]
    
    # Close the polygon
    categories.append(categories[0])
    values.append(values[0])
    
    fig = go.Figure(data=[
        go.Scatterpolar(
            r=values,
            theta=categories,
            fill='toself',
            name='Company Profile'
        )
    ])
    
    fig.update_layout(
        polar=dict(
            radialaxis=dict(
                visible=True,
                range=[0, 1]
            )
        ),
        showlegend=False,
        title="Risk/Growth Radar Profile",
        template="plotly_dark"
    )
    
    return fig

def plot_factor_timeline(df: pd.DataFrame, ticker: str) -> go.Figure:
    """Plot timeline of factor scores."""
    if df.empty:
        return go.Figure()
        
    ticker_df = df[df["Ticker"] == ticker].copy()
    if ticker_df.empty:
        return go.Figure()
        
    ticker_df = ticker_df.sort_values("Date")
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(x=ticker_df["Date"], y=ticker_df["overall_sentiment_score"], mode='lines+markers', name='Sentiment'))
    fig.add_trace(go.Scatter(x=ticker_df["Date"], y=ticker_df["risk_score"], mode='lines+markers', name='Risk'))
    fig.add_trace(go.Scatter(x=ticker_df["Date"], y=ticker_df["growth_score"], mode='lines+markers', name='Growth'))
    
    fig.update_layout(
        title=f"Factor Timeline for {ticker}",
        xaxis_title="Date",
        yaxis_title="Score",
        template="plotly_dark",
        hovermode="x unified"
    )
    
    return fig

def plot_document_type_distribution(chunks: List[Dict[str, Any]]) -> go.Figure:
    """Plot pie chart of document types in the index."""
    if not chunks:
        return go.Figure()
        
    doc_types = [c.get("document_type", "unknown") for c in chunks]
    counts = pd.Series(doc_types).value_counts()
    
    fig = px.pie(
        values=counts.values, 
        names=counts.index, 
        title="Corpus Document Types",
        hole=0.4,
        template="plotly_dark"
    )
    
    return fig

def plot_retrieval_score_chart(retrieved_chunks: List[Dict[str, Any]]) -> go.Figure:
    """Plot scores of retrieved chunks."""
    if not retrieved_chunks:
        return go.Figure()
        
    scores = [c.get("hybrid_score", c.get("score", 0.0)) for c in retrieved_chunks]
    labels = [f"Chunk {i+1} ({str(c.get('source_file'))[:15]}...)" for i, c in enumerate(retrieved_chunks)]
    
    fig = go.Figure(data=[
        go.Bar(x=labels, y=scores, marker_color='teal')
    ])
    
    fig.update_layout(
        title="Retrieval Relevance Scores",
        xaxis_title="Chunk",
        yaxis_title="Score",
        template="plotly_dark"
    )
    
    return fig
