import pandas as pd
import numpy as np

def create_signal_research_features(
    asset_df: pd.DataFrame,
    benchmark_df: pd.DataFrame | None = None,
    ticker: str | None = None
) -> pd.DataFrame:
    """Create universal ML features for signal research."""
    df = asset_df.copy()
    
    # Ensure required columns are present
    required_cols = ["Open", "High", "Low", "Close", "Volume"]
    for col in required_cols:
        if col not in df.columns:
            return pd.DataFrame()
            
    # Sort chronologically
    if "Date" in df.columns:
        df = df.sort_values("Date").reset_index(drop=True)
        
    # 1. Return features
    df["simple_return"] = df["Close"].pct_change()
    df["log_return"] = np.log(df["Close"] / df["Close"].shift(1))
    df["intraday_return"] = df["Close"] / df["Open"] - 1
    df["overnight_gap"] = df["Open"] / df["Close"].shift(1) - 1
    df["high_low_range"] = df["High"] / df["Low"] - 1
    
    range_diff = df["High"] - df["Low"]
    df["close_position_in_range"] = np.where(range_diff == 0, 0, (df["Close"] - df["Low"]) / range_diff)
    
    # 2. Lag return features
    for lag in [1, 2, 3, 5, 10, 20]:
        df[f"log_return_lag_{lag}"] = df["log_return"].shift(lag)
        
    # 3. Momentum features
    for window in [5, 10, 20, 60, 120]:
        df[f"momentum_{window}"] = df["Close"] / df["Close"].shift(window) - 1
        
    # 4. Moving average features
    for window in [10, 20, 50, 100, 200]:
        df[f"sma_{window}"] = df["Close"].rolling(window).mean()
        
    for window in [9, 20, 50]:
        df[f"ema_{window}"] = df["Close"].ewm(span=window, adjust=False).mean()
        
    # 5. Price-location features
    df["price_to_sma_20"] = df["Close"] / df["sma_20"] - 1
    df["price_to_sma_50"] = df["Close"] / df["sma_50"] - 1
    df["price_to_sma_200"] = df["Close"] / df["sma_200"] - 1
    df["price_to_ema_20"] = df["Close"] / df["ema_20"] - 1
    
    df["price_above_sma_20"] = (df["Close"] > df["sma_20"]).astype(int)
    df["price_above_sma_50"] = (df["Close"] > df["sma_50"]).astype(int)
    df["price_above_sma_200"] = (df["Close"] > df["sma_200"]).astype(int)
    df["price_above_ema_20"] = (df["Close"] > df["ema_20"]).astype(int)
    
    # 6. Volatility features
    for window in [5, 10, 20, 30, 60]:
        df[f"realized_vol_{window}"] = df["log_return"].rolling(window).std() * np.sqrt(252)
        
    df["volatility_ratio_5_20"] = df["realized_vol_5"] / df["realized_vol_20"]
    df["volatility_ratio_20_60"] = df["realized_vol_20"] / df["realized_vol_60"]
    
    # 7. Volume features
    df["volume_change"] = df["Volume"].pct_change()
    df["volume_ma_20"] = df["Volume"].rolling(20).mean()
    df["volume_ma_60"] = df["Volume"].rolling(60).mean()
    
    vol_std_20 = df["Volume"].rolling(20).std()
    df["volume_zscore_20"] = np.where(vol_std_20 == 0, 0, (df["Volume"] - df["volume_ma_20"]) / vol_std_20)
    
    df["price_volume_trend"] = np.sign(df["simple_return"]) * df["Volume"]
    df["abnormal_volume_flag"] = (df["volume_zscore_20"] > 2).astype(int)
    
    # 8. Technical indicators
    def compute_rsi(data, window=14):
        diff = data.diff()
        gain = diff.clip(lower=0)
        loss = -1 * diff.clip(upper=0)
        ma_gain = gain.rolling(window).mean()
        ma_loss = loss.rolling(window).mean()
        rs = ma_gain / ma_loss
        return 100 - (100 / (1 + rs))

    df["rsi_14"] = compute_rsi(df["Close"], 14)
    df["rsi_30"] = compute_rsi(df["Close"], 30)
    
    ema_12 = df["Close"].ewm(span=12, adjust=False).mean()
    ema_26 = df["Close"].ewm(span=26, adjust=False).mean()
    df["macd"] = ema_12 - ema_26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_histogram"] = df["macd"] - df["macd_signal"]
    
    std_20 = df["Close"].rolling(20).std()
    df["bollinger_upper_20"] = df["sma_20"] + (std_20 * 2)
    df["bollinger_lower_20"] = df["sma_20"] - (std_20 * 2)
    df["bollinger_width_20"] = (df["bollinger_upper_20"] - df["bollinger_lower_20"]) / df["sma_20"]
    
    bb_range = df["bollinger_upper_20"] - df["bollinger_lower_20"]
    df["bollinger_percent_b"] = np.where(bb_range == 0, 0, (df["Close"] - df["bollinger_lower_20"]) / bb_range)
    
    tr1 = df["High"] - df["Low"]
    tr2 = (df["High"] - df["Close"].shift(1)).abs()
    tr3 = (df["Low"] - df["Close"].shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    df["atr_14"] = tr.rolling(14).mean()
    
    # 9. Drawdown/risk features
    df["rolling_max_252"] = df["Close"].rolling(252, min_periods=1).max()
    df["drawdown_from_252_high"] = df["Close"] / df["rolling_max_252"] - 1
    
    rolling_min_252 = df["Close"].rolling(252, min_periods=1).min()
    df["distance_from_52w_high"] = df["Close"] / df["rolling_max_252"] - 1
    df["distance_from_52w_low"] = df["Close"] / rolling_min_252 - 1
    
    down_returns = df["log_return"].copy()
    down_returns[down_returns > 0] = 0
    df["downside_vol_20"] = down_returns.rolling(20).std() * np.sqrt(252)
    
    # 10. Benchmark-relative features
    if benchmark_df is not None and not benchmark_df.empty:
        b_df = benchmark_df.copy()
        if "Date" in b_df.columns:
            b_df = b_df.sort_values("Date").reset_index(drop=True)
            b_df = b_df.set_index("Date")
        
        if "Date" in df.columns:
            aligned = df.set_index("Date")
            
            # Align benchmark Close
            df["benchmark_close"] = aligned.index.map(b_df["Close"]).values
            df["benchmark_return"] = df["benchmark_close"].pct_change()
            df["asset_minus_benchmark_return"] = df["simple_return"] - df["benchmark_return"]
            
            # Rolling Beta and Corr
            asset_ret = df["simple_return"]
            bench_ret = df["benchmark_return"]
            
            # Rolling covariance / variance
            for window in [30, 60]:
                cov = asset_ret.rolling(window).cov(bench_ret)
                var = bench_ret.rolling(window).var()
                df[f"rolling_beta_{window}"] = np.where(var == 0, np.nan, cov / var)
                df[f"rolling_corr_{window}"] = asset_ret.rolling(window).corr(bench_ret)
                
            # Relative momentum
            for window in [20, 60]:
                bench_mom = df["benchmark_close"] / df["benchmark_close"].shift(window) - 1
                df[f"relative_momentum_{window}"] = df[f"momentum_{window}"] - bench_mom
                
        else:
            _fill_nan_benchmark_features(df)
    else:
        _fill_nan_benchmark_features(df)
        
    # 11. Regime features
    # volatility_regime
    vol_terciles = pd.qcut(df["realized_vol_20"].dropna(), 3, labels=["Low", "Medium", "High"])
    df["volatility_regime"] = vol_terciles
    
    def get_trend(row):
        close = row["Close"]
        sma50 = row["sma_50"]
        sma200 = row["sma_200"]
        if pd.isna(sma50) or pd.isna(sma200):
            return "Unknown"
        if close > sma50 and sma50 > sma200:
            return "Bullish"
        if close < sma50 and sma50 < sma200:
            return "Bearish"
        return "Neutral"
        
    df["trend_regime"] = df.apply(get_trend, axis=1)
    df["volume_regime"] = np.where(df["volume_zscore_20"] > 1.5, "High Volume", "Normal")
    
    # Regime Codes
    vol_map = {"Low": 0, "Medium": 1, "High": 2, "Unknown": 1}
    trend_map = {"Bearish": -1, "Neutral": 0, "Bullish": 1, "Unknown": 0}
    vol_regime_map = {"Normal": 0, "High Volume": 1}
    
    df["volatility_regime"] = df["volatility_regime"].astype(str).fillna("Unknown")
    df["volatility_regime"] = df["volatility_regime"].replace("nan", "Unknown")
    
    df["volatility_regime_code"] = df["volatility_regime"].map(vol_map).fillna(1)
    df["trend_regime_code"] = df["trend_regime"].map(trend_map).fillna(0)
    df["volume_regime_code"] = df["volume_regime"].map(vol_regime_map).fillna(0)
    
    # Replace inf and -inf with NaN
    df = df.replace([np.inf, -np.inf], np.nan)
    
    return df

def _fill_nan_benchmark_features(df):
    cols = [
        "benchmark_close", "benchmark_return", "asset_minus_benchmark_return",
        "rolling_beta_30", "rolling_beta_60", "rolling_corr_30", "rolling_corr_60",
        "relative_momentum_20", "relative_momentum_60"
    ]
    for c in cols:
        df[c] = np.nan
