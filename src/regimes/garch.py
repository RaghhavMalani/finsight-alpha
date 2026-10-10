"""GARCH(1,1) through the mature `arch` estimator; inference stays diagnostic."""

import math
import warnings

import numpy as np

BOUNDARY = 1e-4


def fit_garch(returns, *, minimum=500):
    """Fit a constant-mean Gaussian GARCH(1,1) on percent returns.

    Returns per-observation quantities. Robust (Bollerslev-Wooldridge) standard
    errors and p-values are asymptotic diagnostics, never calibrated inference.
    """
    values = np.asarray(returns, dtype=float)
    if len(values) < minimum:
        return {
            "status": "UNAVAILABLE",
            "reason": f"{len(values)} observations < {minimum} required for GARCH(1,1)",
        }
    if not np.isfinite(values).all() or np.std(values) < 1e-12:
        return {"status": "UNAVAILABLE", "reason": "Non-finite or constant returns"}
    from arch import arch_model
    import arch

    percent = 100 * values
    model = arch_model(
        percent, mean="Constant", vol="GARCH", p=1, q=1, dist="normal", rescale=False
    )
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        result = model.fit(disp=False, cov_type="robust", show_warning=True)
    params = result.params
    mu, omega = float(params["mu"]), float(params["omega"])
    alpha, beta = float(params["alpha[1]"]), float(params["beta[1]"])
    persistence = alpha + beta
    converged = int(result.convergence_flag) == 0
    boundary = alpha < BOUNDARY or beta < BOUNDARY or persistence >= 1 - BOUNDARY
    status = "UNCONVERGED" if not converged else "BOUNDARY" if boundary else "CONVERGED"
    if not converged or boundary or not 0 < persistence < 1:
        half_life, domain = None, (
            "INVALID_DOMAIN: optimizer did not converge"
            if not converged
            else "INVALID_DOMAIN: ARCH/GARCH coefficient at its boundary; persistence not identified"
            if boundary
            else "INVALID_DOMAIN: alpha+beta outside (0,1)"
        )
    else:
        half_life, domain = math.log(0.5) / math.log(persistence), "VALID"
    errors = result.std_err
    pvalues = result.pvalues
    conditional = np.asarray(result.conditional_volatility, dtype=float) / 100
    unconditional = (
        math.sqrt(omega / (1 - persistence)) / 100 if 0 < persistence < 1 else None
    )
    return {
        "status": "AVAILABLE",
        "fit_status": status,
        "estimator": f"arch {arch.__version__} arch_model(mean=Constant, vol=GARCH, p=1, q=1, dist=normal); fit(cov_type=robust)",
        "units": "per observation; parameters on percent returns",
        "observations": len(values),
        "mu_percent": mu,
        "omega_percent2": omega,
        "alpha": alpha,
        "beta": beta,
        "persistence": persistence,
        "half_life_observations": half_life,
        "half_life_domain": domain,
        "unconditional_vol": unconditional,
        "log_likelihood": float(result.loglikelihood),
        "converged": converged,
        "optimizer_message": str(getattr(result.optimization_result, "message", "")),
        "warnings": sorted({str(w.message)[:200] for w in caught}),
        "robust_std_err": {k: float(v) for k, v in errors.items()},
        "robust_pvalues": {k: float(v) for k, v in pvalues.items()},
        "inference": "DIAGNOSTIC_ASYMPTOTIC",
        "conditional_vol": conditional.tolist(),
    }


def arch_lm(returns, *, lags=5, minimum=100):
    values = np.asarray(returns, dtype=float)
    if len(values) < minimum:
        return {
            "status": "UNAVAILABLE",
            "reason": f"{len(values)} observations < {minimum} required for ARCH-LM",
        }
    if np.std(values) < 1e-12:
        return {"status": "UNAVAILABLE", "reason": "Constant returns"}
    from statsmodels.stats.diagnostic import het_arch

    statistic, pvalue, fstat, fpvalue = het_arch(values - values.mean(), nlags=lags)
    return {
        "status": "AVAILABLE",
        "lags": lags,
        "observations": len(values),
        "lm_statistic": float(statistic),
        "lm_pvalue": float(pvalue),
        "f_statistic": float(fstat),
        "f_pvalue": float(fpvalue),
        "inference": "DIAGNOSTIC_ASYMPTOTIC",
        "semantics": "statsmodels het_arch chi-square asymptotics on demeaned returns; one preregistered lag choice; not calibrated",
    }
