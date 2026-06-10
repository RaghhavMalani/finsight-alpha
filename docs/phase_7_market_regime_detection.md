# Phase 7: Market Regime Detection Engine

## Overview

The **Market Regime Detection Engine** introduces the ability to identify hidden structural states in financial markets. Markets are not static; they shift between periods of calm growth, violent crashes, and directionless chop. A quantitative signal that performs brilliantly in a low-volatility bull market might cause catastrophic losses in a high-volatility bear regime.

This module uses **Unsupervised Machine Learning** to automatically cluster historical price action into distinct regimes without human bias.

## What is a Market Regime?

A market regime is a prolonged period where the market exhibits consistent statistical properties (like return, volatility, and correlation). 

Common regimes include:
- **Low-Volatility Bullish**: Steady upward grind with minimal pullbacks.
- **High-Volatility Bearish**: Sharp downward moves accompanied by large intraday swings.
- **Stress / Selloff**: Market crashes characterized by extreme drawdowns and panic selling.
- **Sideways / Choppy**: Range-bound markets with moderate volatility and zero net return.
- **Recovery**: Sharp upward bounces following a deep drawdown.

## How it Works

### 1. Feature Engineering
Before clustering, we transform raw prices into features that describe the "texture" of the market:
- **Returns**: Rolling 20-day returns.
- **Volatility**: Realized 20-day and 60-day volatility.
- **Drawdown**: Distance from the rolling 252-day high.
- **Volume**: Abnormal volume flags and volume Z-scores.
- **Relative Performance**: Beta and relative return against a benchmark (like the S&P 500 or Nifty 50).

### 2. Unsupervised Modeling

We use probabilistic models to cluster these features into states.

#### Hidden Markov Models (HMM)
The core engine uses `hmmlearn` to fit a Gaussian Hidden Markov Model.
- **Idea**: The true state of the market ($S_t$) is "hidden". We can only see the "emissions" ($X_t$), which are our engineered features like returns and volatility.
- **Observation Likelihood**: $P(X_t | S_t)$ tells us the probability of seeing current volatility given we are in a crash state.
- **State Transition**: $P(S_t | S_{t-1})$ gives us the probability that a crash regime today will persist into tomorrow.

#### Fallback Models (Gaussian Mixture & KMeans)
If `hmmlearn` is not installed, the engine gracefully falls back to `sklearn.mixture.GaussianMixture` or `sklearn.cluster.KMeans`.
- **GMM** assumes the data is generated from a mixture of Gaussian distributions. It provides soft probabilities for each state but lacks the sequential transition logic of HMM.
- **KMeans** provides hard cluster assignments based on Euclidean distance.

### 3. Regime Labeling

Once the model clusters the data into arbitrary states (State 0, State 1, State 2, etc.), we calculate summary statistics for each state (average return, average volatility, average drawdown). We then apply a rule-based labeling system:
- State with negative returns + high volatility + deep drawdown = **Stress / Selloff**.
- State with positive returns + low volatility = **Low-Vol Bullish**.

## Key Concepts

### Transition Matrix
The transition matrix shows the probability of moving from one regime to another. For example, if you are in a "Low-Vol Bullish" regime, what is the probability of shifting to "Stress / Selloff" tomorrow?

### Regime Duration
How long does a regime typically last? By calculating the consecutive days spent in a regime, we can estimate whether a current regime is just starting or is long in the tooth.

## Integration with ML Signal Research Lab

Regimes are not just for visualization. They actively improve the Phase 6 ML Signal Engine:
1. **Regime as a Feature**: The current regime state, duration, risk level code, and probability are fed directly into the ML model (Random Forest, XGBoost) to give it context. The **Feature Intelligence** section will show exactly how heavily the ML model relied on the regime output.
2. **Regime-Adjusted Confidence**: The final output signal is passed through a heuristic filter. If the ML model outputs a "Bullish" signal, but the market is in a "Stress / Selloff" regime, the system will downgrade the signal confidence or suppress it entirely to protect capital.

## Regime Diagnostics (Phase 7.5)
To add robustness and institutional feel, several key diagnostic metrics are incorporated:
- **Regime Stability**: Analyzes the last 20 days to see how often the model is oscillating between states. Too many flips imply a "Low" stability environment where regime signals may be less reliable.
- **Confidence Quality**: Combines assignment probability with regime duration. A regime must be active for an extended period with high probability to achieve "High" confidence quality.
- **Transition Matrix Analysis**: Explicitly details the most stable regime and the statistical probability of staying in the current state vs migrating to a new one tomorrow.

## Limitations

- **Statistical, Not Economic**: These regimes are statistical clusters. They don't know about interest rates, earnings, or news—only price action.
- **Overfitting**: Requesting too many states (e.g., 5 or 6) can cause the model to overfit and create meaningless clusters.
- **Sudden Shifts**: Regimes are identified slightly retroactively. The market might crash for 2-3 days before the model officially shifts from "Bullish" to "Stress".
- **No Financial Advice**: This is an educational and research tool. It does not provide trading advice.
