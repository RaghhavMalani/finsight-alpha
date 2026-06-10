"""Feature engineering for financial time-series data.

This module provides functions to create various features from raw OHLCV data.
Important rules applied to prevent data leakage:
- Features only use past and current data (e.g., rolling windows are right-aligned).
- We use the shifted values for targets (in targets.py), not here.
"""

import pandas as pd
import numpy as np


def add_return_features(df: pd.DataFrame, price_col: str = "Close") -> pd.DataFrame:
    """Add simple return, log return, and volume change features.
    
    Args:
        df: Input DataFrame containing the price_col and 'Volume'.
        price_col: The column name for the price series.
        
    Returns:
        DataFrame with new return features added.
    """
    df = df.copy()
    if price_col not in df.columns:
        return df

    df["simple_return"] = df[price_col].pct_change()
    df["log_return"] = np.log(df[price_col] / df[price_col].shift(1))
    
    if "Volume" in df.columns:
        df["volume_change"] = df["Volume"].pct_change()
        
    return df


def add_lag_features(df: pd.DataFrame, columns: list[str], lags: list[int] = [1, 2, 3, 5, 10]) -> pd.DataFrame:
    """Add lagged versions of the specified columns.
    
    Args:
        df: Input DataFrame.
        columns: List of column names to lag.
        lags: List of integer lags to create.
        
    Returns:
        DataFrame with new lag features.
    """
    df = df.copy()
    for col in columns:
        if col not in df.columns:
            continue
        for lag in lags:
            df[f"{col}_lag_{lag}"] = df[col].shift(lag)
    return df


def add_rolling_features(df: pd.DataFrame, price_col: str = "Close", windows: list[int] = [5, 10, 20, 30]) -> pd.DataFrame:
    """Add rolling mean, rolling standard deviation, and price relative to moving average.
    
    Args:
        df: Input DataFrame.
        price_col: The price column to use.
        windows: List of integer rolling windows.
        
    Returns:
        DataFrame with new rolling features.
    """
    df = df.copy()
    if price_col not in df.columns:
        return df

    for w in windows:
        roll = df[price_col].rolling(window=w)
        df[f"rolling_mean_{w}"] = roll.mean()
        df[f"rolling_std_{w}"] = roll.std()
        # Distance of price from its moving average (ratio - 1)
        df[f"price_to_ma_{w}"] = (df[price_col] / df[f"rolling_mean_{w}"]) - 1
        
    return df


def add_momentum_features(df: pd.DataFrame, price_col: str = "Close", windows: list[int] = [5, 10, 20]) -> pd.DataFrame:
    """Add momentum features (returns over a specific window).
    
    Args:
        df: Input DataFrame.
        price_col: The price column.
        windows: List of momentum windows.
        
    Returns:
        DataFrame with new momentum features.
    """
    df = df.copy()
    if price_col not in df.columns:
        return df

    for w in windows:
        df[f"momentum_{w}"] = (df[price_col] / df[price_col].shift(w)) - 1
        
    return df


def add_volatility_features(df: pd.DataFrame, return_col: str = "log_return", windows: list[int] = [5, 10, 20, 30], trading_days: int = 252) -> pd.DataFrame:
    """Add rolling realized volatility features.
    
    Args:
        df: Input DataFrame.
        return_col: Column containing returns (e.g., log_return).
        windows: List of rolling windows for volatility.
        trading_days: Number of trading days in a year to annualize.
        
    Returns:
        DataFrame with realized volatility features.
    """
    df = df.copy()
    if return_col not in df.columns:
        return df

    for w in windows:
        # Annualized rolling standard deviation of returns
        df[f"realized_vol_{w}"] = df[return_col].rolling(window=w).std() * np.sqrt(trading_days)
        
    return df


def add_technical_indicators(df: pd.DataFrame, price_col: str = "Close") -> pd.DataFrame:
    """Add technical indicators: RSI, MACD, Bollinger Bands.
    
    Args:
        df: Input DataFrame.
        price_col: The price column.
        
    Returns:
        DataFrame with new technical indicators.
    """
    df = df.copy()
    if price_col not in df.columns:
        return df

    # RSI (14)
    delta = df[price_col].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    
    avg_gain = gain.rolling(window=14, min_periods=14).mean()
    avg_loss = loss.rolling(window=14, min_periods=14).mean()
    
    rs = avg_gain / avg_loss
    df["rsi_14"] = 100 - (100 / (1 + rs))
    
    # MACD (12, 26, 9)
    ema_12 = df[price_col].ewm(span=12, adjust=False).mean()
    ema_26 = df[price_col].ewm(span=26, adjust=False).mean()
    df["macd"] = ema_12 - ema_26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_histogram"] = df["macd"] - df["macd_signal"]
    
    # Bollinger Bands (20)
    roll_20 = df[price_col].rolling(window=20)
    ma_20 = roll_20.mean()
    std_20 = roll_20.std()
    
    df["bollinger_upper_20"] = ma_20 + (2 * std_20)
    df["bollinger_lower_20"] = ma_20 - (2 * std_20)
    df["bollinger_width_20"] = (df["bollinger_upper_20"] - df["bollinger_lower_20"]) / ma_20

    return df


def create_ml_feature_dataset(df: pd.DataFrame) -> pd.DataFrame:
    """Create a complete machine learning feature dataset.
    
    Pipeline:
    1. Sort by Date.
    2. Add return features.
    3. Add lag features.
    4. Add rolling features.
    5. Add momentum features.
    6. Add volatility features.
    7. Add technical indicators.
    8. Replace inf and -inf with NaN.
    9. Drop rows with missing feature values.
    
    Args:
        df: Raw DataFrame containing Date, Open, High, Low, Close, Volume.
        
    Returns:
        Clean ML-ready DataFrame with features.
    """
    df = df.copy()
    
    if "Date" in df.columns:
        df = df.sort_values("Date").reset_index(drop=True)
        
    # Apply feature engineering functions sequentially
    df = add_return_features(df, price_col="Close")
    
    # Create lags for the newly created returns/volume change
    lag_cols = [c for c in ["simple_return", "log_return", "volume_change"] if c in df.columns]
    df = add_lag_features(df, columns=lag_cols, lags=[1, 2, 3, 5, 10])
    
    df = add_rolling_features(df, price_col="Close", windows=[5, 10, 20, 30])
    df = add_momentum_features(df, price_col="Close", windows=[5, 10, 20])
    df = add_volatility_features(df, return_col="log_return", windows=[5, 10, 20, 30])
    df = add_technical_indicators(df, price_col="Close")
    
    # Replace infinities
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    
    # We drop NA only at the end to ensure we have a fully populated dataset for modeling
    df = df.dropna().reset_index(drop=True)
    
    return df


def get_feature_columns(df: pd.DataFrame) -> list[str]:
    """Identify columns that should be used as model features.
    
    Excludes base columns and target columns, and ensures only numeric types are used.
    
    Args:
        df: The engineered DataFrame.
        
    Returns:
        A list of feature column names.
    """
    exclude_prefixes = ("target_", "Date", "Ticker", "Open", "High", "Low", "Close", "Volume")
    
    features = []
    for col in df.columns:
        if not col.startswith(exclude_prefixes):
            if pd.api.types.is_numeric_dtype(df[col]):
                features.append(col)
            
    return features
