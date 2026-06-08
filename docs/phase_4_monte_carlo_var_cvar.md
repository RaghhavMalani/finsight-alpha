# Phase 4: Monte Carlo Simulation & VaR/CVaR

## 1. What is Monte Carlo Simulation?
Monte Carlo simulation is a mathematical technique that models the probability of different outcomes in a process that cannot easily be predicted due to the intervention of random variables. It relies on repeated random sampling to compute their results.

## 2. Why is it used in Finance?
In finance, asset prices tomorrow are impossible to predict perfectly. Instead of picking a single expected price, Monte Carlo generates thousands of possible "parallel universes" (price paths) allowing us to see the entire distribution of potential outcomes—especially the catastrophic downside tails.

## 3. What is Geometric Brownian Motion (GBM)?
GBM is the standard model used to simulate asset prices. It assumes that the percentage returns of a stock are normally distributed and independent over time, meaning the stock price itself follows a lognormal distribution. This ensures the asset price can never drop below zero.

## 4. The GBM Formula
The discrete-time formula for simulating the next day's price ($S_{t+1}$) based on today's price ($S_t$) is:
$$ S_{t+1} = S_t \exp\left( (\mu - \frac{1}{2}\sigma^2)dt + \sigma \sqrt{dt} Z \right) $$

## 5. What does $\mu$ mean?
$\mu$ (mu) is the **expected annual return** (drift). It represents the long-term directional pull of the asset.

## 6. What does $\sigma$ mean?
$\sigma$ (sigma) is the **annualized volatility**. It measures how wildly the asset swings around its expected drift.

## 7. What is $Z$?
$Z$ is a **random shock** drawn from a standard normal distribution (mean 0, standard deviation 1). This is where the randomness of the simulation comes from. Some days $Z$ is positive (good news), some days it is negative (bad news).

## 8. What is Value-at-Risk (VaR)?
VaR answers the question: "How bad can things get?" 
It is the maximum expected loss over a specific time horizon at a given confidence level.
*Example: A 95% 1-year VaR of 15% means we are 95% confident that the asset will not lose more than 15% of its value over the next year.*

## 9. What is Conditional Value-at-Risk (CVaR)?
Also known as Expected Shortfall (ES). CVaR answers the question: "If things DO get worse than the VaR, exactly how bad are they expected to be?"
It calculates the average loss in the worst-case tail beyond the VaR threshold.

## 10. Methods for calculating VaR
- **Historical VaR**: Looks at actual past returns and simply finds the 5th percentile worst day. (Assumes the past perfectly predicts the future).
- **Parametric VaR**: Assumes returns are perfectly a bell curve (Normal Distribution) and calculates the loss using standard deviations and Z-scores: $VaR = -(\mu + Z_{\alpha}\sigma)$.
- **Monte Carlo VaR**: Runs the GBM simulation to generate completely new synthetic futures, and finds the 5th percentile worst outcome among them.

## 11. Why CVaR is better for tail risk
VaR only tells you the "doorway" to the worst-case scenarios, but it doesn't tell you what's inside the room. If an asset has a 95% VaR of 10%, the worst 5% of days could all be 11% losses, or they could all be 90% losses. VaR treats both the same. CVaR averages those tail losses, making it much more sensitive to catastrophic "black swan" risk.

## 12. Limitations of VaR
- Gives a false sense of security regarding extreme events.
- Is not "sub-additive" (combining two portfolios can mathematically result in a higher VaR, which violates diversification principles).

## 13. Limitations of GBM
- Assumes constant volatility. Real markets have volatility clusters (calm periods followed by panic).
- Assumes normal returns. Real markets have "fat tails" (extreme events happen far more often than a bell curve predicts).
- Assumes continuous price movements (ignores overnight gaps or sudden market crashes).

## 14. Connection to FinSight Alpha's Architecture
- **Black-Scholes**: The mathematical foundation of GBM ($\mu$, $\sigma$, $Z$) is the exact same stochastic calculus used to derive the Black-Scholes option pricing model in Phase 3.
- **Portfolio Optimization (Phase 5)**: Knowing the individual VaR/CVaR allows us to optimize portfolios to minimize Expected Shortfall rather than just minimizing volatility.
- **Stress Testing**: By artificially bumping $\sigma$ or dropping $\mu$, we can stress-test how an asset behaves in a synthetic recession.
- **ML Forecasting**: In the future, instead of using historical $\sigma$, we can use Machine Learning to predict tomorrow's $\sigma$ and feed that directly into the Monte Carlo engine!
