import numpy as np
import pandas as pd
from typing import Optional, List

def calculate_rolling_returns(df: pd.DataFrame, price_col: str = "Close") -> pd.DataFrame:
    """Calculate basic and rolling returns."""
    out = pd.DataFrame(index=df.index)
    
    # Basic returns
    out["simple_return"] = df[price_col].pct_change()
    out["log_return"] = np.log(df[price_col] / df[price_col].shift(1))
    out["abs_return"] = out["simple_return"].abs()
    out["squared_return"] = out["simple_return"] ** 2
    
    # Rolling returns
    for window in [5, 20, 60]:
        out[f"rolling_return_{window}"] = (df[price_col] / df[price_col].shift(window)) - 1
        
    return out

def calculate_rolling_volatility(df: pd.DataFrame, return_col: str = "log_return") -> pd.DataFrame:
    """Calculate rolling volatility features."""
    out = pd.DataFrame(index=df.index)
    
    # Assuming daily data, annualized volatility
    sqrt_252 = np.sqrt(252)
    
    for window in [5, 20, 60]:
        out[f"realized_vol_{window}"] = df[return_col].rolling(window=window).std() * sqrt_252
        
    # Volatility ratios to detect volatility expansions/contractions
    out["volatility_ratio_5_20"] = out["realized_vol_5"] / out["realized_vol_20"]
    out["volatility_ratio_20_60"] = out["realized_vol_20"] / out["realized_vol_60"]
    
    return out

def calculate_drawdown_features(df: pd.DataFrame, price_col: str = "Close") -> pd.DataFrame:
    """Calculate drawdown and trend features."""
    out = pd.DataFrame(index=df.index)
    
    # Drawdown features
    out["rolling_max_252"] = df[price_col].rolling(window=252, min_periods=1).max()
    out["drawdown_from_252_high"] = (df[price_col] / out["rolling_max_252"]) - 1
    
    rolling_max_60 = df[price_col].rolling(window=60, min_periods=1).max()
    drawdown_60 = (df[price_col] / rolling_max_60) - 1
    out["max_drawdown_60"] = drawdown_60.rolling(window=60, min_periods=1).min()
    
    # Trend features
    for window in [20, 50, 200]:
        out[f"sma_{window}"] = df[price_col].rolling(window=window).mean()
        
    out["price_to_sma_50"] = (df[price_col] / out["sma_50"]) - 1
    out["price_to_sma_200"] = (df[price_col] / out["sma_200"]) - 1
    out["trend_strength_50_200"] = (out["sma_50"] / out["sma_200"]) - 1
    
    return out

def calculate_volume_regime_features(df: pd.DataFrame, volume_col: str = "Volume") -> pd.DataFrame:
    """Calculate volume-based regime features."""
    out = pd.DataFrame(index=df.index)
    
    if volume_col in df.columns:
        out["volume_change"] = df[volume_col].pct_change()
        vol_mean_20 = df[volume_col].rolling(window=20).mean()
        vol_std_20 = df[volume_col].rolling(window=20).std()
        out["volume_zscore_20"] = (df[volume_col] - vol_mean_20) / vol_std_20
        out["abnormal_volume_flag"] = (out["volume_zscore_20"] > 2.0).astype(int)
    else:
        out["volume_change"] = np.nan
        out["volume_zscore_20"] = np.nan
        out["abnormal_volume_flag"] = np.nan
        
    return out

def calculate_benchmark_relative_regime_features(
    asset_df: pd.DataFrame, 
    benchmark_df: pd.DataFrame, 
    asset_price_col: str = "Close",
    bench_price_col: str = "Close",
    date_col: str = "Date"
) -> pd.DataFrame:
    """Calculate relative performance vs benchmark."""
    out = pd.DataFrame(index=asset_df.index)
    
    if benchmark_df.empty:
        return out
        
    # Merge on Date to align
    bench_sub = benchmark_df[[date_col, bench_price_col]].rename(columns={bench_price_col: "bench_close"})
    merged = pd.merge(asset_df[[date_col, asset_price_col]], bench_sub, on=date_col, how="left")
    
    asset_ret = merged[asset_price_col].pct_change()
    bench_ret = merged["bench_close"].pct_change()
    
    out["benchmark_return"] = bench_ret.values
    out["asset_minus_benchmark_return"] = asset_ret.values - bench_ret.values
    
    # Rolling covariance / variance for beta
    cov_60 = asset_ret.rolling(60).cov(bench_ret)
    var_60 = bench_ret.rolling(60).var()
    out["rolling_beta_60"] = (cov_60 / var_60).values
    out["rolling_corr_60"] = asset_ret.rolling(60).corr(bench_ret).values
    
    return out

def create_regime_features(
    asset_df: pd.DataFrame,
    benchmark_df: Optional[pd.DataFrame] = None,
    trading_days: int = 252
) -> pd.DataFrame:
    """
    Generate all regime detection features.
    
    Returns a clean DataFrame with all engineered features.
    Missing values (NaN) at the beginning of the series due to rolling windows
    are dropped only after all features are created.
    """
    df = asset_df.copy()
    if "Date" in df.columns:
        df = df.sort_values("Date").reset_index(drop=True)
        
    # Create sub-feature dataframes
    ret_df = calculate_rolling_returns(df)
    
    # Need to insert log_return into df to pass to calculate_rolling_volatility
    df["log_return"] = ret_df["log_return"]
    vol_df = calculate_rolling_volatility(df, return_col="log_return")
    dd_df = calculate_drawdown_features(df)
    volum_df = calculate_volume_regime_features(df)
    
    # Concatenate standard features
    features = pd.concat([ret_df, vol_df, dd_df, volum_df], axis=1)
    
    # Add benchmark features if provided
    if benchmark_df is not None and not benchmark_df.empty:
        bench_df = calculate_benchmark_relative_regime_features(df, benchmark_df)
        features = pd.concat([features, bench_df], axis=1)
        
    # Merge with original dataframe
    result = pd.concat([df, features.drop(columns=["log_return"], errors="ignore")], axis=1)
    
    # Replace infinite values with NaN
    result.replace([np.inf, -np.inf], np.nan, inplace=True)
    
    # Drop rows with NaN values (from rolling windows)
    result.dropna(inplace=True)
    
    return result

def get_regime_feature_columns(df: pd.DataFrame, feature_set: str = "Basic") -> List[str]:
    """
    Return columns to be used for unsupervised regime models based on the selected feature set.
    """
    if feature_set == "Basic":
        suggested = [
            "log_return",
            "realized_vol_20",
            "rolling_return_20",
            "drawdown_from_252_high",
            "volume_zscore_20"
        ]
    elif feature_set == "With Benchmark":
        suggested = [
            "log_return",
            "realized_vol_20",
            "rolling_return_20",
            "drawdown_from_252_high",
            "volume_zscore_20",
            "benchmark_return",
            "asset_minus_benchmark_return",
            "rolling_beta_60",
            "rolling_corr_60"
        ]
    else:  # Full
        suggested = [
            "log_return",
            "abs_return",
            "squared_return",
            "rolling_return_5",
            "rolling_return_20",
            "rolling_return_60",
            "realized_vol_5",
            "realized_vol_20",
            "realized_vol_60",
            "volatility_ratio_5_20",
            "volatility_ratio_20_60",
            "drawdown_from_252_high",
            "max_drawdown_60",
            "price_to_sma_50",
            "price_to_sma_200",
            "trend_strength_50_200",
            "volume_zscore_20",
            "abnormal_volume_flag",
            "benchmark_return",
            "asset_minus_benchmark_return",
            "rolling_beta_60",
            "rolling_corr_60"
        ]
        
    # Only return columns that exist and are not entirely NaN
    valid_cols = []
    for col in suggested:
        if col in df.columns:
            if not df[col].isna().all():
                valid_cols.append(col)
                
    return valid_cols
