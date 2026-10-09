"""Simultaneous practical gate, fixed discovery selection and retained power."""
from __future__ import annotations
import numpy as np
from scipy import stats
from .protocol import METHODS, digest, json_bytes


def bound(successes,total,tail,upper):
    if not 0<=successes<=total or total<=0 or not 0<tail<1: raise ValueError("Invalid binomial bound")
    if upper: return 1. if successes==total else float(stats.beta.ppf(1-tail,successes+1,total-successes))
    return 0. if successes==0 else float(stats.beta.ppf(tail,successes,total-successes+1))


def summarize(values,p,*,simultaneous=True):
    # Columns: estimate, reported SE, lower, upper, HAC studentization SE, four greater p, four two-sided p.
    a=np.asarray(values,dtype=float)
    if a.ndim!=2 or a.shape[1]!=13 or len(a)<2 or not np.isfinite(a).all(): raise ValueError("Incomplete/nonfinite world family")
    w=len(a);sd=float(a[:,0].std(ddof=1));bias=float(a[:,0].mean())
    if sd<=0: raise ValueError("Degenerate world coefficient variance")
    cfg=p["confirmation_acceptance"]
    tail=cfg["binomial_family_alpha"]/cfg["binomial_bounds"] if simultaneous else .025
    greater=int(np.count_nonzero(a[:,5]<=p["alpha"]));two=int(np.count_nonzero(a[:,9]<=p["alpha"]))
    coverage=int(np.count_nonzero((a[:,2]<=0)&(a[:,3]>=0)))
    bias_upper=(abs(bias)+stats.t.ppf(1-cfg["bias_family_alpha"]/(2*len(p["settings"])),w-1)*sd/np.sqrt(w))/sd
    metrics={"worlds":w,"greater_rejects":greater,"two_sided_rejects":two,"covered":coverage,
        "greater_size":greater/w,"two_sided_size":two/w,"coverage":coverage/w,
        "greater_size_upper":bound(greater,w,tail,True),"two_sided_size_upper":bound(two,w,tail,True),
        "coverage_lower":bound(coverage,w,tail,False),"bias":bias,"bias_mcse":sd/np.sqrt(w),
        "standardized_bias":abs(bias)/sd,"standardized_bias_upper":float(bias_upper),
        "empirical_sd":sd,"mean_reported_se":float(a[:,1].mean()),
        "reported_se_over_empirical_sd":float(a[:,1].mean()/sd),
        "empirical_sd_over_reported_se":float(sd/a[:,1].mean()),
        "mean_studentization_se":float(a[:,4].mean()),"interval_width":float((a[:,3]-a[:,2]).mean()),
        "power":[]}
    for i,effect in enumerate(p["effect_grid"]):
        g=int(np.count_nonzero(a[:,5+i]<=p["alpha"]));t=int(np.count_nonzero(a[:,9+i]<=p["alpha"]))
        metrics["power"].append({"effect":effect,"greater":g/w,"two_sided":t/w,
            "greater_ci":[bound(g,w,.025,False),bound(g,w,.025,True)],
            "two_sided_ci":[bound(t,w,.025,False),bound(t,w,.025,True)]})
    metrics["accepted"]=(metrics["greater_size_upper"]<=cfg["size_upper_max"]
        and metrics["two_sided_size_upper"]<=cfg["size_upper_max"]
        and metrics["coverage_lower"]>=cfg["coverage_lower_min"]
        and metrics["standardized_bias_upper"]<=cfg["standardized_bias_upper_max"])
    return metrics


def select(discovery,p):
    if set(discovery)!=set(p["candidates"]): raise ValueError("Incomplete discovery candidate family")
    expected={s["id"] for s in p["settings"]};ranking=[]
    for order,name in enumerate(METHODS):
        rows=discovery[name]
        if set(rows)!=expected: raise ValueError("Missing discovery setting")
        if any(r.get("failed_worlds",0) for r in rows.values()): continue
        if any(r["worlds"]!=p["discovery_worlds"] for r in rows.values()): raise ValueError("Incomplete discovery worlds")
        violations=sum((r["greater_size"]>.07)+(r["two_sided_size"]>.07)+(r["coverage"]<.92)+(r["standardized_bias"]>.10) for r in rows.values())
        power=float(np.mean([point["greater"] for r in rows.values() for point in r["power"][1:]]))
        worst=max(max(r["greater_size"],r["two_sided_size"]) for r in rows.values())
        ranking.append({"method":name,"point_violations":violations,"average_greater_power":power,"worst_null_size":worst,"order":order})
    ranking.sort(key=lambda r:(r["point_violations"],-r["average_greater_power"],r["worst_null_size"],r["order"]))
    return {"selected":ranking[0]["method"] if ranking else None,"ranking":ranking,
            "discovery_hash":digest(json_bytes(discovery)),"status":"SELECTION_ONLY_NOT_CERTIFIED"}
