"""Independent bounded SciPy GARCH(1,1) used only for differential tests.

Never imported by production code. Uses the documented arch backcast
(0.94-weighted first min(75, n) squared residuals around the sample mean, fixed
before optimisation) so likelihoods are comparable.
"""

import numpy as np
from scipy.optimize import minimize


def variance_path(params, y):
    mu, omega, alpha, beta = params
    resid = y - mu
    tau = min(75, len(y))
    weights = 0.94 ** np.arange(tau)
    initial = y[:tau] - y.mean()
    backcast = float(np.sum(initial**2 * weights / weights.sum()))
    sigma2 = np.empty(len(y))
    sigma2[0] = omega + (alpha + beta) * backcast
    for t in range(1, len(y)):
        sigma2[t] = omega + alpha * resid[t - 1] ** 2 + beta * sigma2[t - 1]
    return resid, sigma2


def log_likelihood(params, y):
    resid, sigma2 = variance_path(params, y)
    return float(-0.5 * np.sum(np.log(2 * np.pi) + np.log(sigma2) + resid**2 / sigma2))


def fit(y):
    y = np.asarray(y, dtype=float)
    var = float(np.var(y))
    start = np.array([y.mean(), 0.05 * var, 0.05, 0.90])

    def objective(p):
        if p[2] + p[3] >= 0.9999:
            return 1e12
        return -log_likelihood(p, y)

    bounds = [(None, None), (1e-8 * var, 10 * var), (0.0, 1.0), (0.0, 1.0)]
    result = minimize(objective, start, method="L-BFGS-B", bounds=bounds)
    return result.x, -result.fun, result.success
