# Phase 3: Black-Scholes Option Pricing and Greeks

## 1. What is an Option?
An option is a financial derivative that gives the buyer the right, but not the obligation, to buy or sell an underlying asset at a specified price on or before a specified date. 

## 2. Call vs. Put Options
- **Call Option**: Gives the holder the right to *buy* the underlying asset. A call option gains value when the underlying asset's price goes up.
- **Put Option**: Gives the holder the right to *sell* the underlying asset. A put option gains value when the underlying asset's price goes down.

## 3. Strike Price (K)
The strike price is the predetermined price at which the underlying asset can be bought (for a call) or sold (for a put) if the option is exercised.

## 4. Maturity (T)
Time to maturity is the remaining time until the option expires, usually expressed in years. After this date, the option becomes worthless if not exercised.

## 5. Volatility ($\sigma$)
Volatility represents the annualized standard deviation of the underlying asset's returns. It measures how much the asset's price fluctuates. Higher volatility increases the probability of the option expiring in-the-money, thus making the option more expensive.

## 6. Risk-Free Rate (r)
The risk-free rate is the theoretical return of an investment with zero risk, typically represented by the yield on government bonds (like US Treasuries). It affects the present value of the strike price.

## 7. Dividend Yield (q)
The continuous dividend yield represents the dividends paid by the underlying asset, expressed as a percentage of the asset price. Dividends cause the stock price to drop, which decreases call prices and increases put prices.

---

## 8. The Black-Scholes Formula
The Black-Scholes-Merton model calculates the theoretical fair value of European-style options. 

For a **Call Option** ($C$):
$$ C = S e^{-qT} N(d_1) - K e^{-rT} N(d_2) $$

For a **Put Option** ($P$):
$$ P = K e^{-rT} N(-d_2) - S e^{-qT} N(-d_1) $$

Where $S$ is the spot price and $N(\cdot)$ is the cumulative distribution function of the standard normal distribution.

## 9. Intuition behind $d_1$ and $d_2$

$$ d_1 = \frac{\ln(S/K) + (r - q + 0.5 \sigma^2) T}{\sigma \sqrt{T}} $$
$$ d_2 = d_1 - \sigma \sqrt{T} $$

- **$N(d_1)$**: Roughly represents the probability-weighted expected value of the asset price given that the option expires in-the-money. It is also the **Delta** of a non-dividend paying call option.
- **$N(d_2)$**: The actual probability that the option will expire in-the-money in a risk-neutral world.

---

## 10. The Greeks
Greeks measure the sensitivity of an option's price to various underlying factors.

- **Delta ($\Delta$)**: The rate of change of the option price with respect to the underlying asset's price. Delta ranges from 0 to 1 for calls, and -1 to 0 for puts.
- **Gamma ($\Gamma$)**: The rate of change of Delta with respect to the underlying asset's price. It measures the curvature or convexity of the option's value. Gamma is highest for at-the-money options.
- **Vega ($\nu$)**: The sensitivity of the option price to a 1% change in implied volatility. Higher volatility makes options more expensive.
- **Theta ($\Theta$)**: The rate of change of the option price with respect to the passage of time (time decay). Options lose value as expiration approaches.
- **Rho ($\rho$)**: The sensitivity of the option price to changes in the risk-free interest rate.

## 11. Implied Volatility
Implied Volatility (IV) is the market's forecast of a likely movement in a security's price. It is calculated by taking the market price of an option and plugging it back into the Black-Scholes formula using a root-finding algorithm (like Brent's method) to solve for $\sigma$.

---

## 12. Black-Scholes Assumptions
1. **European options**: The options can only be exercised at expiration.
2. **Constant volatility and risk-free rate**: The model assumes $\sigma$ and $r$ do not change over the life of the option.
3. **No arbitrage**: It is impossible to make a riskless profit.
4. **Lognormal stock prices**: The returns of the underlying asset are normally distributed, meaning prices cannot fall below zero.
5. **Frictionless markets**: No transaction costs, taxes, or liquidity issues. Short selling is permitted.

## 13. Limitations of Black-Scholes
- Volatility is rarely constant; it exhibits "smiles" or "skews".
- Extreme market movements (fat tails) happen more frequently than a normal distribution predicts.
- American options (which can be exercised early) are harder to price accurately with this model.

## 14. Preparing for the Future
Implementing the Black-Scholes pricing engine lays the mathematical foundation for more advanced features in Phase 4 and beyond:
- **Monte Carlo Simulation**: Option pricing will be extended to simulate thousands of asset paths to price complex or path-dependent derivatives.
- **VaR/CVaR**: By understanding asset distributions and drift/volatility dynamics, we can calculate Value at Risk for portfolios.
- **Portfolio Risk**: Combining options with underlying equities requires Greeks-based risk aggregation (Delta-neutral or Gamma-neutral portfolios).
- **Options Strategy Analysis**: Traders can combine multiple calls and puts to analyze strategies like straddles, iron condors, and spreads.
- **Volatility Modeling**: Future models can relax the constant volatility assumption and introduce GARCH models or local volatility surfaces.
