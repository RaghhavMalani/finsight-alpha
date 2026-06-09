# Phase 6: Machine Learning Forecasting Engine

This phase introduces a robust, professional Machine Learning Forecasting Engine to FinSight Alpha.

## Why Financial Forecasting is Hard
Financial markets are incredibly noisy. Unlike physics or image recognition, the rules of the market change over time. Participants constantly react to new information and to each other, creating a dynamic system where the signal-to-noise ratio is extremely low. Machine learning models can easily memorize historical noise (overfitting) and completely fail in live trading.

## Why Predicting Raw Price is Usually Not Ideal
If you ask an ML model to predict a stock's raw price (e.g., $150.20), it often just predicts yesterday's price. Because prices are "non-stationary" (they drift randomly over time), this looks like a great model on paper but provides zero actual trading value.

## What We Predict Instead
Instead of predicting raw price, our engine focuses on:
- **Direction**: Will the price go up or down tomorrow? (Classification)
- **Future Return**: What will the percentage return be over the next 5 days? (Regression)
- **Future Volatility**: What will the realized volatility be over the next 5 days? (Regression)

These targets are "stationary" and much more useful for trading, risk management, and portfolio construction.

## Feature Engineering
Feature engineering is the process of transforming raw OHLCV (Open, High, Low, Close, Volume) data into meaningful signals that a model can learn from. 

Examples implemented in FinSight Alpha:
- **Lag Returns**: The return from 1 day ago, 2 days ago, etc.
- **Rolling Averages**: The average price over the last 5, 10, or 20 days.
- **Volatility**: The standard deviation of recent returns.
- **Technical Indicators**: 
  - **RSI (Relative Strength Index)**: Measures overbought/oversold conditions.
  - **MACD**: Measures trend momentum.
  - **Bollinger Bands**: Measures volatility and potential price breakouts.
- **Volume Change**: Spikes in trading volume.

## Target Creation
Target creation defines exactly what we want the model to predict. We use `pandas.shift(-horizon)` to look into the future. For example, to predict the 5-day future return, we calculate the return from today to 5 days from now, and assign it to today's row as the target.

## What is Data Leakage?
> [!WARNING]
> Data Leakage is the biggest trap in financial ML.

Leakage happens when your model accidentally uses information during training that it wouldn't have in reality. 
For example, if you use a centered rolling average (which looks into the future) as a feature, the model will "cheat" and learn the future. We strictly prevent this by ensuring all features are right-aligned (using only past data) and targets are strictly separated.

## Why Random Train/Test Split is Wrong
Standard ML tutorials teach you to randomly shuffle data and split 80% for training and 20% for testing. In finance, this causes massive data leakage. If you train on data from Friday and Wednesday, and test on Thursday, the model has seen the future.

We use **Chronological Train/Test Split**: We train on the oldest data (e.g., 2020-2023) and test on the newest (e.g., 2024).

## Walk-Forward Validation
Walk-forward validation is the gold standard for backtesting financial models.
1. Train a model on past data (e.g., Days 1-100).
2. Predict the immediate future (e.g., Days 101-120).
3. Move the window forward: Train on Days 1-120.
4. Predict Days 121-140.
This accurately simulates how a model would perform in the real world as time passes and new data arrives.

## Classification Metrics
- **Accuracy**: Overall % of correct predictions.
- **Precision**: When the model predicted "Up", how often was it right? (Crucial for avoiding bad trades).
- **Recall**: Out of all the actual "Up" days, how many did the model catch?
- **F1 Score**: Harmonic mean of Precision and Recall.
- **ROC-AUC**: Measures the model's ability to distinguish between classes across all probability thresholds.

## Regression Metrics
- **MAE (Mean Absolute Error)**: Average absolute mistake in the prediction.
- **RMSE (Root Mean Squared Error)**: Standard deviation of the residuals (punishes large errors more).
- **R² Score**: How much variance the model explains compared to a flat average. In finance, even a tiny positive R² (like 0.02) can be highly profitable.
- **Directional Accuracy**: Did the predicted return have the same sign (+ or -) as the actual return?

## Limitations of ML in Finance
- **Overfitting**: Complex tree models easily memorize the past.
- **Regime Changes**: A model trained in a bull market may fail entirely in a bear market.
- **Transaction Costs**: Frequent trading eats into small predicted profits.
- **No Financial Advice**: These models are educational. Past performance does not guarantee future results.

## Preparing for the Future
Phase 6 lays the critical groundwork for:
- **Phase 7**: Market Regime Detection (using volatility models).
- **Portfolio Rebalancing**: Using expected returns and expected volatility to dynamically adjust portfolio weights (connecting Phase 5 and Phase 6).
- **AI-Assisted Research**: Combining quant signals with LLM insights.
