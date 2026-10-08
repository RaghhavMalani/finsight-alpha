"""Bailey/López de Prado PSR/DSR equations, with explicit unsupported assumptions."""
import numpy as np
from scipy import stats
from .statistics import sample


def psr_formula(sr,n,skew,kurtosis,benchmark=0):
    if n<3 or not np.isfinite([sr,skew,kurtosis,benchmark]).all(): raise ValueError("Invalid PSR inputs")
    denominator=1-skew*sr+(kurtosis-1)*sr**2/4
    if denominator<=0: raise ValueError("Invalid Sharpe moment variance")
    return float(stats.norm.cdf((sr-benchmark)*np.sqrt(n-1)/np.sqrt(denominator)))


def expected_max_sharpe(trials,sigma):
    if isinstance(trials,bool) or trials<1 or int(trials)!=trials or not np.isfinite(sigma) or sigma<0:
        raise ValueError("Invalid independent search count/dispersion")
    if trials==1: return 0.0
    gamma=float(np.euler_gamma)
    return float(sigma*((1-gamma)*stats.norm.ppf(1-1/trials)+gamma*stats.norm.ppf(1-1/(trials*np.e))))


def sharpe_diagnostics(returns,*,trial_sharpes,independent_trials=None,iid=False):
    y=sample(returns)
    sr=float(y.mean()/y.std(ddof=1))
    skew=float(stats.skew(y,bias=False));kurt=float(stats.kurtosis(y,fisher=False,bias=False))
    result={"sample_sharpe":sr,"units":"unannualized per-month Sharpe",
        "sample_length":len(y),"skewness":skew,"pearson_kurtosis":kurt,
        "psr_diagnostic":psr_formula(sr,len(y),skew,kurt),"counted_trials":len(trial_sharpes),
        "status":"UNAVAILABLE","dsr":None,"independent_trials":independent_trials,
        "reason":"Serial dependence and/or unknown independent trial count; diagnostic PSR is not calibrated inference"}
    if independent_trials is not None and iid:
        if len(trial_sharpes)<2 or independent_trials>len(trial_sharpes) or not np.isfinite(trial_sharpes).all():
            raise ValueError("Incomplete trial Sharpe dispersion")
        threshold=expected_max_sharpe(independent_trials,float(np.std(trial_sharpes,ddof=1)))
        result.update(status="AVAILABLE",dsr=psr_formula(sr,len(y),skew,kurt,threshold),
            benchmark=threshold,reason="IID moment and independent search-count assumptions explicitly supplied")
    return result
