"""Explicit inference assumptions, effects and intervals; no significance-only API."""
from __future__ import annotations
import numpy as np
from scipy import stats
import statsmodels.api as sm
from .contracts import StatisticalResult

UNIT = "proportional return per month"


def sample(values, minimum=3):
    x=np.asarray(values,dtype=float)
    if x.ndim!=1 or len(x)<minimum or not np.isfinite(x).all():
        raise ValueError("Need a finite one-dimensional sample with sufficient rows")
    if np.std(x,ddof=1)<=1e-12:
        raise ValueError("Degenerate variance")
    return x


def probability(statistic, distribution, alternative):
    if alternative=="greater": return float(distribution.sf(statistic))
    if alternative=="less": return float(distribution.cdf(statistic))
    if alternative=="two-sided": return float(2*distribution.sf(abs(statistic)))
    raise ValueError("Invalid alternative")


def available(method,estimate,se,p,n,assumptions,critical=1.959963984540054):
    if not np.isfinite([estimate,se,p]).all() or se<=0:
        raise ValueError("Degenerate/non-finite inference")
    return StatisticalResult(status="AVAILABLE",method=method,estimate=estimate,
        ci_lower=estimate-critical*se,ci_upper=estimate+critical*se,p_value=p,n=n,
        unit=UNIT,assumptions=assumptions)


def unavailable(method,reason,n=0):
    return StatisticalResult(status="UNAVAILABLE",method=method,n=n,unit=UNIT,
        assumptions=(),reason=reason)


def welch(a,b,alternative="two-sided"):
    a,b=sample(a),sample(b)
    va,vb=a.var(ddof=1)/len(a),b.var(ddof=1)/len(b)
    se=np.sqrt(va+vb);df=(va+vb)**2/(va**2/(len(a)-1)+vb**2/(len(b)-1))
    reference=stats.ttest_ind(a,b,equal_var=False,alternative=alternative)
    return available("WELCH",float(a.mean()-b.mean()),float(se),float(reference.pvalue),
        len(a)+len(b),("Independent samples; unequal variances; Welch-Satterthwaite df",),
        float(stats.t.ppf(.975,df)))


def paired(a,b,alternative="two-sided"):
    a,b=np.asarray(a,dtype=float),np.asarray(b,dtype=float)
    if a.shape!=b.shape: raise ValueError("Paired samples must align exactly")
    d=sample(a-b);se=d.std(ddof=1)/np.sqrt(len(d))
    return available("PAIRED",float(d.mean()),float(se),
        float(stats.ttest_rel(a,b,alternative=alternative).pvalue),len(d),
        ("Independent pairs; pair differences approximately normal",),float(stats.t.ppf(.975,len(d)-1)))


def hac(y,controls=None,*,coefficient=0,lags=6,alternative="greater"):
    y=sample(y)
    if not isinstance(lags,int) or not 0<=lags<len(y): raise ValueError("Invalid HAC bandwidth")
    x=np.ones((len(y),1)) if controls is None else sm.add_constant(np.asarray(controls,dtype=float),has_constant="add")
    if not np.isfinite(x).all() or len(x)!=len(y) or np.linalg.matrix_rank(x)!=x.shape[1]:
        raise ValueError("Singular, non-finite or misaligned regression design")
    if len(y)<x.shape[1]+10 or not 0<=coefficient<x.shape[1]: raise ValueError("Insufficient regression degrees of freedom")
    fit=sm.OLS(y,x).fit(cov_type="HAC",cov_kwds={"maxlags":lags,"use_correction":True},use_t=False)
    estimate,se=float(fit.params[coefficient]),float(fit.bse[coefficient])
    return available("HAC",estimate,se,probability(estimate/se,stats.norm,alternative),len(y),
        ("Bartlett Newey-West; finite-sample n/(n-k) correction; asymptotic normal 95% CI",
         "Stationary weak dependence and finite moments; no causal interpretation"))


def block_indices(n,block_length,resamples,rng):
    if not 1<=block_length<=n or resamples<99: raise ValueError("Invalid resampling design")
    starts=rng.integers(0,n,size=(resamples,int(np.ceil(n/block_length))))
    return ((starts[:,:,None]+np.arange(block_length))%n).reshape(resamples,-1)[:,:n]


def empirical_p(observed,centered,alternative):
    if alternative=="greater": count=np.count_nonzero(centered>=observed)
    elif alternative=="less": count=np.count_nonzero(centered<=observed)
    elif alternative=="two-sided": count=np.count_nonzero(np.abs(centered)>=abs(observed))
    else: raise ValueError("Invalid alternative")
    return float((count+1)/(len(centered)+1))


def bootstrap_mean(y,*,seed,block_length=1,resamples=1999,alternative="greater"):
    y=sample(y);rng=np.random.default_rng(seed)
    indices=block_indices(len(y),block_length,resamples,rng)
    means=y[indices].mean(axis=1);estimate=float(y.mean());centered=means-estimate
    q=np.quantile(centered,[.025,.975])
    return StatisticalResult(status="AVAILABLE",method="BLOCK_BOOTSTRAP" if block_length>1 else "BOOTSTRAP",
        estimate=estimate,ci_lower=estimate-float(q[1]),ci_upper=estimate-float(q[0]),
        p_value=empirical_p(estimate,centered,alternative),n=len(y),unit=UNIT,
        assumptions=(f"Circular moving blocks length {block_length}; basic 95% interval; centered-null +1 p",
                     "IID if block length 1, otherwise stationary weak dependence"))


def permutation_mean(y,*,seed,resamples=1999,alternative="greater"):
    y=sample(y);rng=np.random.default_rng(seed)
    signs=rng.choice([-1,1],size=(resamples,len(y)))
    p=empirical_p(float(y.mean()),(signs*y).mean(axis=1),alternative)
    # CI is the independently declared t interval, not a permutation-derived CI.
    se=float(y.std(ddof=1)/np.sqrt(len(y)))
    return available("PERMUTATION",float(y.mean()),se,p,len(y),
        ("Sign-flip null requires independent symmetric observations; t-based 95% CI",),
        float(stats.t.ppf(.975,len(y)-1)))


def regression_resampling(y,controls,*,seed,coefficient=0,block_length=6,resamples=1999):
    y=sample(y);x=sm.add_constant(np.asarray(controls,dtype=float),has_constant="add")
    if len(x)!=len(y) or not np.isfinite(x).all() or np.linalg.matrix_rank(x)!=x.shape[1]:
        raise ValueError("Invalid regression bootstrap design")
    estimate=float(np.linalg.lstsq(x,y,rcond=None)[0][coefficient])
    rng=np.random.default_rng(seed)
    indices=block_indices(len(y),block_length,resamples,rng)
    coefficients=[]
    for ix in indices:
        if np.linalg.matrix_rank(x[ix])!=x.shape[1]:
            raise ValueError("Singular resample; no silent deletion of draws")
        coefficients.append(float(np.linalg.lstsq(x[ix],y[ix],rcond=None)[0][coefficient]))
    centered=np.asarray(coefficients)-estimate;q=np.quantile(centered,[.025,.975])
    bootstrap=StatisticalResult(status="AVAILABLE",method="BLOCK_BOOTSTRAP",estimate=estimate,
        ci_lower=estimate-float(q[1]),ci_upper=estimate-float(q[0]),p_value=empirical_p(estimate,centered,"two-sided"),
        n=len(y),unit=UNIT,assumptions=(f"Paired circular blocks length {block_length}; centered-null coefficient bootstrap",))
    shifts=rng.integers(1,len(y),size=resamples)
    permuted=np.array([np.linalg.lstsq(x,np.roll(y,int(s)),rcond=None)[0][coefficient] for s in shifts])
    return {"block_bootstrap":bootstrap.model_dump(mode="json"),
        "circular_permutation":{"p_value":empirical_p(estimate,permuted,"two-sided"),
            "resamples":resamples,"seed":seed,"assumptions":"Circular outcome shifts require conditional stationarity/exchangeability; diagnostic, not calibrated confirmatory inference"}}
