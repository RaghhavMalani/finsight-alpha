import pandas as pd
import numpy as np

def create_reliance_signal_features(
    reliance_df: pd.DataFrame,
    benchmark_df: pd.DataFrame | None = None
) -> pd.DataFrame:
    """Create extensive features tailored for Reliance Signal Research.
    
    Args:
        reliance_df: Raw OHLCV DataFrame for RELIANCE.NS.
        benchmark_df: Optional Raw OHLCV DataFrame for benchmark (e.g., NIFTYBEES.NS).
        
    Returns:
        DataFrame with advanced engineered features.
    """
    df = reliance_df.copy()
    if "Date" in df.columns:
        df = df.sort_values("Date").reset_index(drop=True)
        
    if "Close" not in df.columns or df.empty:
        return df

    # 1. Return Features
    df["simple_return"] = df["Close"].pct_change()
    df["log_return"] = np.log(df["Close"] / df["Close"].shift(1))
    
    if "Open" in df.columns:
        df["intraday_return"] = (df["Close"] / df["Open"]) - 1
        df["overnight_gap"] = (df["Open"] / df["Close"].shift(1)) - 1
        
    if "High" in df.columns and "Low" in df.columns:
        df["high_low_range"] = (df["High"] - df["Low"]) / df["Close"].shift(1)
        # Handle zero division
        range_diff = df["High"] - df["Low"]
        df["close_position_in_range"] = np.where(
            range_diff == 0, 0.5, (df["Close"] - df["Low"]) / range_diff
        )

    # 2. Lag return features
    for lag in [1, 2, 3, 5, 10, 20]:
        df[f"log_return_lag_{lag}"] = df["log_return"].shift(lag)

    # 3. Momentum features
    for w in [5, 10, 20, 60, 120]:
        df[f"momentum_{w}"] = (df["Close"] / df["Close"].shift(w)) - 1

    # 4. Moving average features
    for w in [10, 20, 50, 100, 200]:
        df[f"sma_{w}"] = df["Close"].rolling(window=w).mean()
        
    for w in [9, 20, 50]:
        df[f"ema_{w}"] = df["Close"].ewm(span=w, adjust=False).mean()

    # 5. Price-location features
    for w in [20, 50, 200]:
        df[f"price_to_sma_{w}"] = (df["Close"] / df[f"sma_{w}"]) - 1
        df[f"price_above_sma_{w}"] = (df["Close"] > df[f"sma_{w}"]).astype(int)
        
    df["price_to_ema_20"] = (df["Close"] / df["ema_20"]) - 1
    df["price_above_ema_20"] = (df["Close"] > df["ema_20"]).astype(int)

    # 6. Volatility features
    for w in [5, 10, 20, 30, 60]:
        df[f"realized_vol_{w}"] = df["log_return"].rolling(window=w).std() * np.sqrt(252)
        
    df["volatility_ratio_5_20"] = df["realized_vol_5"] / df["realized_vol_20"]
    df["volatility_ratio_20_60"] = df["realized_vol_20"] / df["realized_vol_60"]

    # 7. Volume features
    if "Volume" in df.columns:
        df["volume_change"] = df["Volume"].pct_change()
        df["volume_ma_20"] = df["Volume"].rolling(window=20).mean()
        df["volume_ma_60"] = df["Volume"].rolling(window=60).mean()
        
        vol_std_20 = df["Volume"].rolling(window=20).std()
        df["volume_zscore_20"] = np.where(
            vol_std_20 > 0, (df["Volume"] - df["volume_ma_20"]) / vol_std_20, 0
        )
        
        df["price_volume_trend"] = df["log_return"] * df["Volume"]
        df["abnormal_volume_flag"] = (df["volume_zscore_20"] > 2).astype(int)

    # 8. Technical indicators
    # RSI (14, 30)
    delta = df["Close"].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    
    for w in [14, 30]:
        avg_gain = gain.rolling(window=w, min_periods=w).mean()
        avg_loss = loss.rolling(window=w, min_periods=w).mean()
        rs = avg_gain / avg_loss
        df[f"rsi_{w}"] = 100 - (100 / (1 + rs))

    # MACD
    ema_12 = df["Close"].ewm(span=12, adjust=False).mean()
    ema_26 = df["Close"].ewm(span=26, adjust=False).mean()
    df["macd"] = ema_12 - ema_26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_histogram"] = df["macd"] - df["macd_signal"]

    # Bollinger Bands
    roll_20 = df["Close"].rolling(window=20)
    ma_20 = roll_20.mean()
    std_20 = roll_20.std()
    df["bollinger_upper_20"] = ma_20 + (2 * std_20)
    df["bollinger_lower_20"] = ma_20 - (2 * std_20)
    df["bollinger_width_20"] = (df["bollinger_upper_20"] - df["bollinger_lower_20"]) / ma_20
    df["bollinger_percent_b"] = np.where(
        std_20 > 0, (df["Close"] - df["bollinger_lower_20"]) / (4 * std_20), 0
    )

    # ATR (14)
    if "High" in df.columns and "Low" in df.columns:
        tr1 = df["High"] - df["Low"]
        tr2 = (df["High"] - df["Close"].shift(1)).abs()
        tr3 = (df["Low"] - df["Close"].shift(1)).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        df["atr_14"] = tr.rolling(window=14).mean()

    # 9. Drawdown/risk features
    df["rolling_max_252"] = df["Close"].rolling(window=252).max()
    df["drawdown_from_252_high"] = (df["Close"] / df["rolling_max_252"]) - 1
    
    df["rolling_min_252"] = df["Close"].rolling(window=252).min()
    df["distance_from_52w_high"] = df["drawdown_from_252_high"]
    df["distance_from_52w_low"] = (df["Close"] / df["rolling_min_252"]) - 1
    
    # Downside volatility 20
    down_returns = df["log_return"].where(df["log_return"] < 0, 0)
    df["downside_vol_20"] = down_returns.rolling(window=20).std() * np.sqrt(252)

    # 10. Benchmark-relative features
    if benchmark_df is not None and not benchmark_df.empty and "Date" in df.columns and "Date" in benchmark_df.columns:
        b_df = benchmark_df[["Date", "Close"]].copy()
        b_df = b_df.rename(columns={"Close": "Benchmark_Close"})
        b_df["benchmark_return"] = b_df["Benchmark_Close"].pct_change()
        
        df = df.merge(b_df, on="Date", how="left")
        df["reliance_minus_benchmark_return"] = df["simple_return"] - df["benchmark_return"]
        
        for w in [30, 60]:
            # rolling_corr
            df[f"rolling_corr_{w}"] = df["simple_return"].rolling(w).corr(df["benchmark_return"])
            
            # rolling_beta
            cov = df["simple_return"].rolling(w).cov(df["benchmark_return"])
            var = df["benchmark_return"].rolling(w).var()
            df[f"rolling_beta_{w}"] = np.where(var > 0, cov / var, np.nan)
            
        for w in [20, 60]:
            df[f"relative_momentum_{w}"] = df[f"momentum_{w}"] - ((df["Benchmark_Close"] / df["Benchmark_Close"].shift(w)) - 1)
            
        df = df.drop(columns=["Benchmark_Close"])

    # 11. Regime features
    if "realized_vol_20" in df.columns:
        vol_terciles = df["realized_vol_20"].quantile([0.33, 0.66])
        df["volatility_regime"] = np.where(
            df["realized_vol_20"] < vol_terciles[0.33], "Low",
            np.where(df["realized_vol_20"] > vol_terciles[0.66], "High", "Medium")
        )
        # Codes: Low=0, Medium=1, High=2
        df["volatility_regime_code"] = df["volatility_regime"].map({"Low": 0, "Medium": 1, "High": 2})
        
    df["trend_regime"] = "Neutral"
    if "sma_50" in df.columns and "sma_200" in df.columns:
        bullish_mask = (df["Close"] > df["sma_50"]) & (df["sma_50"] > df["sma_200"])
        bearish_mask = (df["Close"] < df["sma_50"]) & (df["sma_50"] < df["sma_200"])
        df.loc[bullish_mask, "trend_regime"] = "Bullish"
        df.loc[bearish_mask, "trend_regime"] = "Bearish"
        
    # Codes: Bearish=-1, Neutral=0, Bullish=1
    df["trend_regime_code"] = df["trend_regime"].map({"Bearish": -1, "Neutral": 0, "Bullish": 1})
    
    if "volume_zscore_20" in df.columns:
        df["volume_regime"] = np.where(df["volume_zscore_20"] > 1.5, "High Volume", "Normal")
        df["volume_regime_code"] = np.where(df["volume_regime"] == "High Volume", 1, 0)

    # Cleanup
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    
    # We drop NA only at the end to ensure we have a fully populated dataset for modeling
    df = df.dropna().reset_index(drop=True)

    return df
