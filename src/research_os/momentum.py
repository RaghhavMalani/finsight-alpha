"""Frozen market-factor momentum workflow; narrow adapters, no trading engine."""
from __future__ import annotations
import numpy as np
import pandas as pd
from scipy.special import logsumexp
from scipy.stats import multivariate_normal
from threadpoolctl import threadpool_limits
from src.regime.hmm_regime import train_hmm_regime_model
from src.dynamics.market_regime import volatility_path
from src.eval.canonical import canonical_sha256
from .contracts import Preregistration
from .costs import strategy_returns
from .statistics import hac,unavailable,regression_resampling
from .power import prospective_power
from .robustness import subset_mask
from .placebos import negative_control

CONTROLS=["MKT","SMB","HML","MOM"]


def monthly_factors(frame):
    frame=frame.copy();frame["month"]=frame.Date.dt.strftime("%Y-%m")
    columns=["MKT","SMB","HML","MOM"]
    def compound(x):
        if x.isna().any() or (x<=-1).any(): return np.nan
        return float(np.expm1(np.log1p(x).sum()))
    monthly=frame.groupby("month")[columns].agg(compound)
    # A boundary capture starting after the first weekday has no complete first month.
    first=frame.Date.iloc[0];first_weekday=pd.bdate_range(first.replace(day=1),periods=1)[0]
    if first.date()>first_weekday.date(): monthly.loc[first.strftime("%Y-%m"),:]=np.nan
    full=pd.period_range(monthly.index[0],monthly.index[-1],freq="M").astype(str)
    return monthly.reindex(full)


def momentum_signal(monthly,lookback=12):
    # For month t use t-lookback through t-2, excluding the entire month t-1.
    cumulative=np.log1p(monthly.MKT).shift(2).rolling(lookback-1,min_periods=lookback-1).sum()
    return np.sign(np.expm1(cumulative))


def forward_filter(model,scaled):
    alpha=model.startprob_.copy();probabilities=[]
    for i,x in enumerate(scaled):
        prior=alpha if i==0 else alpha@model.transmat_
        log_likelihood=np.array([multivariate_normal.logpdf(x,mean=model.means_[s],cov=model.covars_[s]) for s in range(model.n_components)])
        log_alpha=np.log(np.maximum(prior,1e-300))+log_likelihood
        alpha=np.exp(log_alpha-logsumexp(log_alpha));probabilities.append(alpha.copy())
    return np.asarray(probabilities)


def hmm_regimes(monthly,split,settings):
    values=pd.DataFrame({"monthly_log_return":np.log1p(monthly.MKT),
        "trailing_rms_3":np.sqrt(monthly.MKT.pow(2).rolling(3,min_periods=3).mean())},index=monthly.index)
    finite=values.dropna();train=finite.loc[split.train_start:split.train_end]
    if len(train)<60: return pd.Series(np.nan,index=monthly.index),{"status":"UNAVAILABLE","reason":"HMM training sample too short"}
    with threadpool_limits(limits=1):
        fit=train_hmm_regime_model(train,list(values.columns),n_states=settings["hmm_states"],
            covariance_type="full",random_state=settings["hmm_seed"])
    if not fit["success"]: return pd.Series(np.nan,index=monthly.index),{"status":"UNAVAILABLE","reason":fit["message"]}
    model,scaler=fit["model"],fit["scaler"]
    history=list(model.monitor_.history);delta=history[-1]-history[-2] if len(history)>1 else None
    converged=delta is not None and abs(delta)<.01
    metadata={"status":"AVAILABLE" if converged else "UNAVAILABLE","converged":converged,
        "iterations":model.monitor_.iter,"final_likelihood_increment":delta,
        "training_start":str(train.index[0]),"training_end":str(train.index[-1]),"training_rows":len(train),
        "model_hash":canonical_sha256({"means":model.means_.tolist(),"covariance":model.covars_.tolist(),
            "transitions":model.transmat_.tolist(),"start":model.startprob_.tolist(),"scaler_mean":scaler.mean_.tolist(),"scaler_scale":scaler.scale_.tolist()}),
        "disclosure":"Train-only fit, frozen parameters, forward filtering. Fixed revised vintage; not historical availability."}
    if not converged:
        metadata["reason"]="Frozen HMM fit did not satisfy absolute likelihood increment < .01; no alternative seed/refit"
        return pd.Series(np.nan,index=monthly.index),metadata
    low_vol=int(np.argmin(model.covars_[:,0,0]))
    probabilities=forward_filter(model,scaler.transform(finite))
    states=pd.Series((probabilities.argmax(axis=1)==low_vol).astype(float),index=finite.index)
    return states.reindex(monthly.index).shift(1),metadata


def volatility_regimes(frame,monthly):
    path=volatility_path(frame.MKT.tolist(),252)
    states=pd.Series([r["state"] for r in path],index=frame.Date.dt.strftime("%Y-%m"))
    last=states.groupby(level=0).last()
    binary=last.map(lambda s:np.nan if s=="UNRESOLVED" else float(s=="VOL_CLUSTER"))
    return binary.reindex(monthly.index).shift(1)


def prepare(frame,split,parameters):
    monthly=monthly_factors(frame)
    monthly["signal"]=momentum_signal(monthly)
    hmm,metadata=hmm_regimes(monthly,split,parameters);monthly["hmm"]=hmm
    monthly["vol_cluster"]=volatility_regimes(frame,monthly)
    return monthly,metadata


def evaluate(monthly,metadata,spec:Preregistration,country_index,variant,seed):
    split=spec.splits[country_index];cost=spec.costs[country_index]
    data=monthly.loc[split.holdout_start:split.holdout_end].copy()
    if variant.startswith("WINDOW_"):
        window=int(variant.split("_")[1]);data["signal"]=momentum_signal(monthly,window).reindex(data.index)
    required=[*CONTROLS,"signal"]
    regime_key="hmm" if variant in {"HMM","SHUFFLED_REGIME_HMM"} else "vol_cluster"
    regime_test=variant in {"HMM","VOL_CLUSTER","SHUFFLED_REGIME_HMM","SHUFFLED_REGIME_VOL"}
    if regime_test: required.append(regime_key)
    if "HMM" in variant and metadata["status"]!="AVAILABLE":
        return {"result":unavailable("HAC",metadata.get("reason","HMM unavailable")).model_dump(mode="json"),"hmm":metadata}
    data=data.dropna(subset=required)
    try: data=data.loc[subset_mask(data.index,variant)]
    except ValueError as exc: return {"result":unavailable("HAC",str(exc)).model_dump(mode="json")}
    if len(data)<20: return {"result":unavailable("HAC","Insufficient complete monthly observations",len(data)).model_dump(mode="json")}
    signal=data.signal.to_numpy();market=data.MKT.to_numpy();regime=data[regime_key].fillna(0).to_numpy()
    signal,market,regime=negative_control(signal,market,regime,variant,seed)
    if variant=="BASELINE": signal=np.ones(len(data))
    bps=cost.commission_bps+cost.spread_bps+cost.statutory_bps
    if variant.startswith("COST_"): bps=float(variant.split("_")[1])
    net,turnover,costs=strategy_returns(market,signal,bps)
    controls=data[CONTROLS].to_numpy();coefficient=0;alternative="greater"
    if variant=="NO_CONTROLS": controls=None
    if regime_test:
        if min(np.count_nonzero(regime==0),np.count_nonzero(regime==1))<20:
            return {"result":unavailable("HAC","Fewer than 20 observations in a regime cell",len(data)).model_dump(mode="json"),"hmm":metadata}
        controls=np.column_stack([regime,controls]);coefficient=1;alternative="two-sided"
    try:
        result=hac(net,controls,coefficient=coefficient,lags=spec.tests[0].hac_lags,alternative=alternative)
    except ValueError as exc: result=unavailable("HAC",str(exc),len(data))
    output={"result":result.model_dump(mode="json"),"country":spec.datasets[country_index].country,
        "variant":variant,"months":list(data.index),"period_start":str(data.index[0]),"period_end":str(data.index[-1]),
        "net_returns":net.tolist(),"turnover":turnover.tolist(),"costs":costs.tolist(),
        "assumed_cost_bps":bps,"mean_net_return":float(net.mean()),"hmm":metadata,
        "source_semantics":"CAPTURE_ONLY — market factor, not a ticker. Fixed revised snapshot; no historical-vintage PIT or investable alpha claim.",
        "power":prospective_power(len(data),effect=spec.minimum_effect,sigma=spec.prospective_sigma,rho=.3,alternative="two-sided" if regime_test else "greater"),
        "by_regime":{key:[{"state":state,"n":int((data[key]==state).sum()),
            "mean_net_return":float(net[data[key].to_numpy()==state].mean()) if (data[key]==state).any() else None}
            for state in (0,1)] for key in ("hmm","vol_cluster")}}
    if variant in {"PRIMARY","HMM","VOL_CLUSTER"} and result.status=="AVAILABLE":
        try: output["secondary_inference"]=regression_resampling(net,controls,seed=seed,coefficient=coefficient,
            block_length=spec.tests[1].block_length,resamples=spec.tests[1].resamples)
        except ValueError as exc: output["secondary_inference"]={"status":"UNAVAILABLE","reason":str(exc)}
    return output
