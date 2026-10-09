"""Prospective power only; measured effect never sets the planning alternative."""
import numpy as np
from scipy import optimize,stats
from statsmodels.stats.power import TTestPower


def prospective_power(n,*,effect,sigma,alpha=.05,rho=0,alternative="greater"):
    if n<3 or effect<=0 or sigma<=0 or not -1<rho<1 or not np.isfinite([effect,sigma,rho]).all():
        raise ValueError("Invalid prospective assumptions")
    effective_n=n*(1-rho)/(1+rho)
    if effective_n<=2: raise ValueError("Insufficient effective sample")
    direction={"greater":"larger","less":"smaller","two-sided":"two-sided"}[alternative]
    signed=-effect if alternative=="less" else effect
    power=float(TTestPower().power(signed/sigma,nobs=effective_n,alpha=alpha,alternative=direction))
    planning_direction="larger" if alternative=="less" else direction
    def planning_power(e):
        return TTestPower().power(e/sigma,nobs=effective_n,alpha=alpha,alternative=planning_direction)
    upper=sigma/np.sqrt(effective_n)
    while planning_power(upper)<.8: upper*=2
    mde=float(optimize.brentq(lambda e:planning_power(e)-.8,1e-12,upper,xtol=1e-12))
    required=float(TTestPower().solve_power(effect_size=effect/sigma,alpha=alpha,power=.8,alternative="larger" if alternative=="less" else direction))*(1+rho)/(1-rho)
    return {"power":power,"n":n,"effective_n":float(effective_n),"assumed_rho":rho,
        "prespecified_effect":effect,"prespecified_sigma":sigma,"mde_80":mde,
        "required_n_80":int(np.ceil(required)),"status":"ADEQUATE" if power>=.8 else "UNDERPOWERED",
        "disclosure":"Prospective standardized-effect model and AR1 effective-n approximation; not observed-power evidence of absence"}


def wilson(successes,trials,confidence=.95):
    if not 0<=successes<=trials or trials<1: raise ValueError("Invalid binomial counts")
    z=stats.norm.ppf((1+confidence)/2);p=successes/trials;d=1+z*z/trials
    center=(p+z*z/(2*trials))/d
    half=z*np.sqrt(p*(1-p)/trials+z*z/(4*trials*trials))/d
    return {"rate":p,"ci_lower":float(center-half),"ci_upper":float(center+half),
        "successes":successes,"trials":trials,"confidence":confidence}
