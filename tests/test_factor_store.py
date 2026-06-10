import pandas as pd
from src.rag.factor_store import merge_factors_with_market_data

def test_merge_factors():
    market_df = pd.DataFrame({
        "Date": ["2024-01-01", "2024-01-02", "2024-01-03"],
        "Ticker": ["AAPL", "AAPL", "AAPL"],
        "Close": [100, 101, 102]
    })
    
    factor_df = pd.DataFrame({
        "Date": ["2024-01-01"],
        "Ticker": ["AAPL"],
        "risk_score": [0.8]
    })
    
    merged = merge_factors_with_market_data(market_df, factor_df)
    
    assert merged.shape[0] == 3
    assert merged["risk_score"].iloc[0] == 0.8
    assert merged["risk_score"].iloc[2] == 0.8 # forward fill
