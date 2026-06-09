# Reliance Signal Research Lab

## Overview

The **Reliance Signal Research Lab** is an institutional-grade machine learning module within FinSight Alpha. It goes far beyond the naive "will it go up or down?" classification of the General ML Lab by implementing advanced feature engineering, target generation, walk-forward validation, and ensemble modeling to isolate true predictive edge for India's largest stock, Reliance Industries (`RELIANCE.NS`).

### Why Did the Baseline Model Only Achieve ~50% ROC-AUC?

Financial markets are highly efficient and noisy. A baseline Logistic Regression model predicting next-day direction using raw daily returns and prices will almost always yield a ~50% ROC-AUC (random chance).

To extract alpha (edge) in institutional quant finance, you need:
1. **Stationary, Cross-Sectional Features:** Not raw prices, but relative strength against the benchmark (NIFTY), rolling drawdowns, and regime classifications.
2. **Proper Validation:** Random K-Fold cross-validation leaks future data into the past. We use **expanding-window walk-forward validation**.
3. **Non-Linear Models:** Tree-based models (Random Forest, Gradient Boosting, XGBoost, LightGBM) can capture conditional logic (e.g., "if momentum is high AND volume is low AND correlation to NIFTY is dropping").
4. **Signal Thresholds:** We only act when the probability crosses a statistical threshold (e.g., >57% for Bullish, <43% for Bearish), avoiding trades in the "neutral noise" zone.

## Key Features

- **Feature Intelligence:** Over 40 advanced features grouped into Returns, Momentum, Moving Averages, Volatility, Volume, Technicals, Risk/Drawdown, Benchmark-Relative, and Regimes.
- **Ensemble Modeling:** Automatically tests Logistic Regression, Random Forest, Gradient Boosting, XGBoost, and LightGBM, extracting the best model based on out-of-sample ROC-AUC.
- **Signal Engine:** Translates raw probabilities into discrete Bullish/Neutral/Bearish signals with associated institutional confidence bands.
- **Walk-Forward Diagnostics:** Plots fold-by-fold accuracy and rolling hit rate, clearly showing how the model's edge evolves over time.

## How to Use

1. Launch FinSight Alpha and navigate to the **ML Forecasting Lab**.
2. Select **Reliance Signal Research Mode** from the radio buttons.
3. The dashboard will automatically fetch `RELIANCE.NS` and its benchmark `NIFTYBEES.NS` or `^NSEI`.
4. Use the sidebar controls to tweak target horizon, prediction target, and threshold bounds.
5. Click **Run Reliance Signal Research** to generate the institutional signal tear sheet.

## Disclaimer

This module is an educational quantitative research tool. The generated signals, probabilities, and confidences are backtested mathematical outputs and **do not constitute financial advice**. Financial machine learning is highly susceptible to overfitting and regime changes.
