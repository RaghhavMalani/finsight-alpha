# ML Signal Research Lab

The ML Signal Research Lab provides institutional-grade machine learning diagnostics for any supported ticker. It replaces the old hardcoded Reliance Signal Research Mode with a universal architecture.

## Overview

Unlike standard ML tutorials that predict raw price (leading to near-100% fake accuracy), this lab predicts **future returns/direction**. It employs rigorous time-series cross-validation and feature engineering to combat data leakage and overfitting.

## Universal Architecture

### 1. Feature Engineering (`src/ml/signal_features.py`)
Generates 11 core feature groups dynamically:
- Return features (Simple, Log, Intraday, Gap)
- Lag returns
- Momentum (5, 10, 20, 60, 120 day)
- Moving Averages (SMA, EMA)
- Volatility ratios
- Volume abnormalities
- Technical indicators (RSI, MACD, Bollinger Bands, ATR)
- Drawdowns & distance from 52W High/Low
- Benchmark-relative metrics (Rolling Beta, Relative Momentum). Automatically detects the appropriate benchmark (e.g. `NIFTYBEES.NS` for Indian equities, `SPY` for US equities).
- Regime encodings (Trend, Volatility, Volume)

### 2. Targets (`src/ml/signal_targets.py`)
Targets are computed deterministically based on future data:
- `target_direction`: Binary classification (Up/Down)
- `target_strong_up`: Future return > 0.75%
- `target_strong_down`: Future return < -0.75%
- `target_risk_event`: Sharp downside return OR extreme volatility spike

### 3. Model Suite (`src/ml/signal_modeling.py`)
Instead of a single model, the suite evaluates:
- Logistic Regression (with StandardScaler)
- Random Forest
- Gradient Boosting
- XGBoost (if installed)
- LightGBM (if installed)

It selects the best model by prioritizing **ROC-AUC > Brier Score > F1 Score**.

### 4. Signal Engine Rules (`src/ml/signal_engine.py`)
To prevent false confidence, the engine utilizes strict thresholding:
- **Suppression:** If out-of-sample ROC-AUC < 0.55 or Model Edge < 2%, the signal is overwritten to `No Edge / Neutral` regardless of the raw prediction probability. 

## Best Practices

1. **Test Size:** Start with a 0.2 (20%) test size.
2. **Walk-Forward Validation:** Always run the Walk-Forward test to see if the model remains stable over expanding data folds.
3. **Acknowledge Noise:** A model with 52% accuracy might be profitable if it identifies strong regime shifts, but a ROC-AUC around 50% means the model is guessing.
