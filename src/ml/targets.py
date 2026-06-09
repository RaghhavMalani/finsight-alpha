"""Target creation for machine learning forecasting.

This module builds targets for:
1. Directional classification (will the price go up or down?)
2. Future return regression (what is the expected return over N days?)
3. Future volatility regression (what is the expected volatility over N days?)

Important: These targets inherently "look ahead" into the future. It is critical
that these columns are strictly separated from features during model training.
"""

import pandas as pd
import numpy as np


def create_direction_target(df: pd.DataFrame, price_col: str = "Close", horizon: int = 1) -> pd.DataFrame:
    """Create a binary target for price direction over a future horizon.
    
    Target is 1 if the future return is > 0, else 0.
    
    Args:
        df: Input DataFrame.
        price_col: The price column to use.
        horizon: Number of periods to look ahead.
        
    Returns:
        DataFrame with target_direction added.
    """
    df = df.copy()
    if price_col not in df.columns:
        return df

    # Shift backwards (negative shift) means looking into the future
    future_price = df[price_col].shift(-horizon)
    future_return = (future_price / df[price_col]) - 1
    
    # target_direction is 1 if positive return, 0 otherwise
    # We use np.where but keep NaNs as NaN
    target_series = np.where(future_return > 0, 1, 0)
    df["target_direction"] = pd.Series(target_series, index=df.index)
    
    # Ensure missing future data translates to NaN
    df.loc[future_return.isna(), "target_direction"] = np.nan
    
    return df


def create_future_return_target(df: pd.DataFrame, price_col: str = "Close", horizon: int = 5) -> pd.DataFrame:
    """Create a continuous target for future return over a horizon.
    
    Args:
        df: Input DataFrame.
        price_col: The price column to use.
        horizon: Number of periods to look ahead.
        
    Returns:
        DataFrame with target_return_{horizon}d added.
    """
    df = df.copy()
    if price_col not in df.columns:
        return df

    col_name = f"target_return_{horizon}d"
    future_price = df[price_col].shift(-horizon)
    df[col_name] = (future_price / df[price_col]) - 1
    
    return df


def create_future_volatility_target(
    df: pd.DataFrame, return_col: str = "log_return", horizon: int = 5, trading_days: int = 252
) -> pd.DataFrame:
    """Create a continuous target for future realized volatility.
    
    Args:
        df: Input DataFrame.
        return_col: The returns column to use.
        horizon: Number of periods to look ahead.
        trading_days: Number of trading days in a year.
        
    Returns:
        DataFrame with target_volatility_{horizon}d added.
    """
    df = df.copy()
    if return_col not in df.columns:
        return df

    # To calculate future rolling volatility:
    # We calculate the rolling volatility first, then shift it backwards.
    # A rolling std of window=horizon calculated at t+horizon covers returns from t+1 to t+horizon.
    # Shifting that result back by `horizon` aligns it with time t.
    
    col_name = f"target_volatility_{horizon}d"
    rolling_vol = df[return_col].rolling(window=horizon).std() * np.sqrt(trading_days)
    df[col_name] = rolling_vol.shift(-horizon)
    
    return df


def create_all_targets(
    df: pd.DataFrame, direction_horizon: int = 1, return_horizon: int = 5, volatility_horizon: int = 5
) -> pd.DataFrame:
    """Create all targets and drop rows with missing target values.
    
    Args:
        df: Input DataFrame.
        direction_horizon: Horizon for direction classification.
        return_horizon: Horizon for return regression.
        volatility_horizon: Horizon for volatility regression.
        
    Returns:
        DataFrame with all targets added and NaNs removed.
    """
    df = df.copy()
    
    df = create_direction_target(df, horizon=direction_horizon)
    df = create_future_return_target(df, horizon=return_horizon)
    
    # Need log_return if not present for volatility target
    if "log_return" not in df.columns and "Close" in df.columns:
        df["log_return"] = np.log(df["Close"] / df["Close"].shift(1))
        
    df = create_future_volatility_target(df, horizon=volatility_horizon)
    
    # Drop rows where any of the newly created targets are missing
    target_cols = [
        "target_direction", 
        f"target_return_{return_horizon}d", 
        f"target_volatility_{volatility_horizon}d"
    ]
    
    df = df.dropna(subset=[c for c in target_cols if c in df.columns]).reset_index(drop=True)
    
    return df
