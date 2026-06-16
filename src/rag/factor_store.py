import pandas as pd
import os
from pathlib import Path
from typing import Dict, Any

def save_factor_record(factor_record: Dict[str, Any], output_path: str = "data/factors/factor_records.csv"):
    """Save or append factor record to CSV."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    
    flat_record = {
        "Date": factor_record.get("as_of_date"),
        "Ticker": factor_record.get("ticker"),
        "overall_sentiment_score": factor_record.get("overall_sentiment_score", 0.0),
        "risk_score": factor_record.get("risk_score", 0.0),
        "growth_score": factor_record.get("growth_score", 0.0),
        "debt_risk_score": factor_record.get("debt_risk_score", 0.0),
        "capex_intensity_score": factor_record.get("capex_intensity_score", 0.0),
        "margin_pressure_score": factor_record.get("margin_pressure_score", 0.0),
        "cash_flow_quality_score": factor_record.get("cash_flow_quality_score", 0.0),
        "management_tone_score": factor_record.get("management_tone_score", 0.0),
        "regulatory_risk_score": factor_record.get("regulatory_risk_score", 0.0)
    }
    
    df_new = pd.DataFrame([flat_record])
    
    if path.exists():
        df_existing = pd.read_csv(path)
        
        # Determine if we should replace or append
        mask = (df_existing["Date"] == flat_record["Date"]) & (df_existing["Ticker"] == flat_record["Ticker"])
        
        if mask.any():
            # Replace
            idx = df_existing.index[mask].tolist()[0]
            for col in df_new.columns:
                df_existing.loc[idx, col] = df_new.loc[0, col]
            df_existing.to_csv(path, index=False)
        else:
            # Append
            df_new.to_csv(path, mode='a', header=False, index=False)
    else:
        df_new.to_csv(path, index=False)

def load_factor_records(path: str = "data/factors/factor_records.csv") -> pd.DataFrame:
    """Load factor records."""
    if not os.path.exists(path):
        return pd.DataFrame()
        
    df = pd.read_csv(path)
    df["Date"] = pd.to_datetime(df["Date"]).dt.date
    return df

def merge_factors_with_market_data(
    market_df: pd.DataFrame,
    factor_df: pd.DataFrame,
    date_col: str = "Date",
    ticker_col: str = "Ticker"
) -> pd.DataFrame:
    """Merge factors into market data and forward-fill."""
    if market_df.empty or factor_df.empty:
        return market_df
        
    # Standardize dates
    market_df_copy = market_df.copy()
    factor_df_copy = factor_df.copy()
    
    market_df_copy[date_col] = pd.to_datetime(market_df_copy[date_col]).dt.date
    factor_df_copy[date_col] = pd.to_datetime(factor_df_copy[date_col]).dt.date
    
    merged = pd.merge(market_df_copy, factor_df_copy, on=[date_col, ticker_col], how='left')
    
    # Sort and forward-fill by Ticker
    merged = merged.sort_values([ticker_col, date_col])
    
    factor_cols = [c for c in factor_df_copy.columns if c not in [date_col, ticker_col]]
    for col in factor_cols:
        merged[col] = merged.groupby(ticker_col)[col].ffill().fillna(0.0)
        
    # Reconvert market date back to datetime
    merged[date_col] = pd.to_datetime(merged[date_col])
        
    return merged
