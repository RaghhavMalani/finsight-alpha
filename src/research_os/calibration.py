"""Test the tester against the committed protocol; no acceptance repair/reruns."""
from __future__ import annotations
import numpy as np
from scipy import stats
from statsmodels.stats.multitest import multipletests
from src.eval.canonical import canonical_sha256
from .statistics import welch,paired,hac,bootstrap_mean,permutation_mean
from .power import wilson


def ar1(rng,n,rho,burn):
    innovations=rng.normal(scale=np.sqrt(1-rho*rho),size=n+burn)
    values=np.zeros(n+burn)
    for i in range(1,len(values)): values[i]=rho*values[i-1]+innovations[i]
    return values[burn:]


def calibrate(settings:dict,*,worlds=None):
    count=settings["worlds"] if worlds is None else worlds
    if count not in {settings["canary_worlds"],settings["worlds"]}:
        raise ValueError("Only frozen full calibration or fixed CI canary allowed")
    cases={};seed_records=[];data_records=[]
    for index,case in enumerate(settings["cases"]):
        outcomes={"null":[],"planted":[]}
        for world in range(count):
            seed=settings["seed"]+index*1_000_000+world
            seed_records.append({"case":case,"world":world,"seed":seed})
            rng=np.random.default_rng(seed);n=settings["n"]
            rho=settings["ar1"] if "ar1" in case else 0
            a=ar1(rng,n,rho,settings["burn"]);b=ar1(rng,n,0,settings["burn"])
            x=rng.normal(size=(n,2))
            data_records.append(canonical_sha256({"a":a.tolist(),"b":b.tolist(),"x":x.tolist()}))
            for kind,effect in (("null",0),("planted",settings["planted_effect"])):
                y=a+effect;resample_seed=seed+100_000
                if case=="welch_iid": result=welch(y,b,"greater")
                elif case=="paired_iid": result=paired(y,b,"greater")
                elif case=="bootstrap_iid": result=bootstrap_mean(y,seed=resample_seed,resamples=settings["resamples"])
                elif case=="permutation_iid": result=permutation_mean(y,seed=resample_seed,resamples=settings["resamples"])
                elif case=="block_ar1": result=bootstrap_mean(y,seed=resample_seed,block_length=settings["block_length"],resamples=settings["resamples"])
                elif case=="regression_ar1": result=hac(y+.2*x[:,0]-.1*x[:,1],x,lags=settings["hac_lags"])
                else: result=hac(y,lags=settings["hac_lags"])
                outcomes[kind].append(result.p_value)
        null=wilson(sum(p<settings["alpha"] for p in outcomes["null"]),count)
        power=wilson(sum(p<settings["alpha"] for p in outcomes["planted"]),count)
        cases[case]={"null":null,"planted":power,"p_values":outcomes,
            "null_accepted":null["ci_lower"]<=settings["alpha"]<=null["ci_upper"],
            "power_accepted":power["ci_lower"]>=.8}
    family_rng=np.random.default_rng(settings["seed"]+900_000_000)
    family_p=family_rng.uniform(size=(count,46))
    family={}
    for method in ("holm","fdr_bh"):
        rate=wilson(sum(bool(multipletests(p,alpha=settings["alpha"],method=method)[0].any()) for p in family_p),count)
        family[method]={**rate,"accepted":rate["ci_upper"]<=.075}
    passed=all(r["null_accepted"] and r["power_accepted"] for r in cases.values()) and all(r["accepted"] for r in family.values())
    return {"settings_hash":canonical_sha256(settings),"worlds_per_case":count,
        "total_null_worlds":count*len(cases),"total_planted_worlds":count*len(cases),
        "seed_hash":canonical_sha256(seed_records),"generated_data_hash":canonical_sha256(data_records),
        "status":("CALIBRATED" if passed else "NOT_CALIBRATED") if count>=1000 else "CANARY_ONLY",
        "cases":cases,"family":family,"family_null_data_hash":canonical_sha256(family_p.tolist()),
        "disclosure":"Calibration applies only to this frozen Gaussian IID/AR1 protocol, not every financial distribution or circular-shift regression diagnostic."}
