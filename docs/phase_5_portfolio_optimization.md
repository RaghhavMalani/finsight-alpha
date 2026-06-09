# Phase 5: Portfolio Optimization Engine

This document explains the mathematical foundations of the Portfolio Optimization Engine built in Phase 5 of FinSight Alpha.

## What is a Portfolio?

A portfolio is simply a collection of financial assets (like stocks, bonds, or ETFs) held by an investor. Instead of putting all your money into a single stock, you divide it across multiple assets.

## What is Asset Allocation?

Asset allocation is the strategy of deciding *how much* money to put into each asset. We express this as a **weight**. For example, if you have \$10,000 and you put \$4,000 into Apple, your weight for Apple is 40% (or 0.40). The sum of all weights in a portfolio must equal 100% (or 1.0).

## Expected Return

The **expected return** is the profit or loss that an investor anticipates on an investment. In our engine, we estimate this by taking the historical average daily return of an asset and annualizing it (multiplying by 252 trading days).

**Portfolio Return Formula:**
The expected return of the whole portfolio ($R_p$) is simply the weighted average of the individual asset returns ($\mu$):

$$ R_p = w^T \mu $$

## Volatility and Covariance

**Volatility** ($\sigma$) measures the risk of an asset—how wildly its price swings up and down. We estimate this using the standard deviation of historical returns.

**Covariance** ($\Sigma$) measures how two assets move *together*. 
- A positive covariance means they tend to move in the same direction.
- A negative covariance means they tend to move in opposite directions.
**Correlation** is just a standardized version of covariance (scaled between -1 and 1).

## Why Diversification Works

When you combine assets that are not perfectly correlated, the "zig" of one asset can cancel out the "zag" of another. This means the risk (volatility) of the portfolio is actually *lower* than the weighted average risk of the individual assets. This is the magic of diversification!

**Portfolio Variance Formula:**
The variance of the portfolio ($\sigma_p^2$) depends not just on the individual variances, but also heavily on the covariances between all the assets:

$$ \sigma_p^2 = w^T \Sigma w $$

Portfolio Volatility ($\sigma_p$) is simply the square root of the variance: $\sigma_p = \sqrt{w^T \Sigma w}$

## Markowitz Modern Portfolio Theory (MPT)

Harry Markowitz won a Nobel Prize for formalizing this math in 1952. MPT states that investors are risk-averse: given two portfolios that offer the same expected return, investors will prefer the less risky one.

Therefore, an investor should construct a portfolio that maximizes expected return for a given level of risk, or minimizes risk for a given level of expected return.

### Minimum Variance Portfolio

The **Minimum Variance Portfolio** is the unique combination of assets that results in the lowest possible volatility. It focuses entirely on minimizing risk, ignoring expected returns.

### Maximum Sharpe Portfolio

The **Sharpe Ratio** measures the "excess return per unit of risk":
$$ \text{Sharpe} = \frac{R_p - R_f}{\sigma_p} $$
*(Where $R_f$ is the risk-free rate, like the yield on a Treasury bill).*

The **Maximum Sharpe Portfolio** finds the specific weights that maximize this ratio. This is often considered the "optimal" portfolio because it provides the best risk-adjusted return.

### The Efficient Frontier

If you plot thousands of different random portfolio combinations on a chart with Risk (Volatility) on the x-axis and Return on the y-axis, they form a bullet shape. The upper edge of this shape is the **Efficient Frontier**. Any portfolio on this line is "efficient" because you cannot get a higher return without taking on more risk.

## Risk Contribution and Risk Parity

Usually, we allocate capital equally (e.g., 50% in Asset A, 50% in Asset B). However, if Asset A is much more volatile than Asset B, Asset A might actually contribute 80% of the total *risk* to the portfolio!

**Risk Contribution** breaks down exactly how much of the portfolio's total volatility is coming from each asset.

A **Risk Parity** portfolio turns allocation on its head: instead of allocating equal *capital*, it finds the weights that result in equal *risk contribution*. This often means putting smaller capital weights into highly volatile assets, and larger capital weights into safer assets.

## A Simple Numerical Example

Imagine a 3-asset portfolio: AAPL, MSFT, and SPY.
- We have \$100,000.
- We choose an **Equal Weight** allocation: 33.3% in each.

If expected returns are:
- AAPL: 10%
- MSFT: 12%
- SPY: 8%

The Portfolio Return is: 
$$ (0.333 \times 10\%) + (0.333 \times 12\%) + (0.333 \times 8\%) = 10\% $$

However, the Portfolio Volatility is NOT just the average of their individual volatilities. Because AAPL and MSFT are highly correlated tech stocks, they don't offer much diversification benefit against each other. But SPY might be less correlated with the tech stocks. The covariance matrix determines the final portfolio risk. An optimization algorithm might suggest putting less money into MSFT and more into SPY to find the *Minimum Variance Portfolio*.

## Limitations of Historical Optimization

While the math of MPT is beautiful, it relies on several dangerous assumptions in practice:
1. **Garbage In, Garbage Out:** The optimizer assumes our expected returns and covariance matrix are perfectly accurate. In reality, historical returns are very noisy and notoriously bad predictors of future returns.
2. **Instability:** Because historical means are noisy, the optimizer can "overfit", creating portfolios with extreme weights (e.g., 90% in one asset) that change wildly if the historical data changes slightly.
3. **Changing Relationships:** Covariance and correlation are not constant. In a severe market crash, correlations often jump to 1.0 (everything falls together), destroying the diversification benefits exactly when you need them most.

## Connecting to Advanced Topics

This basic Mean-Variance framework is the foundation that we will build upon in future phases:
- **Phase 4 (Monte Carlo & VaR):** Helps us quantify the tail-risk (crashes) that MPT's normal-distribution assumption ignores.
- **Phase 6 (ML Forecasting):** Instead of using simple historical averages for $\mu$, we can use Machine Learning models to predict future expected returns, feeding much smarter inputs into the optimizer.
- **Phase 7 (Regime Detection):** We can use models to detect whether we are in a "calm" or "crisis" market regime, and dynamically switch to a different covariance matrix to avoid the "correlations go to 1" trap.
