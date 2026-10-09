"""Declared synthetic processes; no market captures or selected-method inputs."""
from __future__ import annotations
import numpy as np
from scipy.signal import lfilter
from .protocol import seed


def generate(p, phase, setting, world):
    rng = np.random.default_rng(seed(p,phase,setting["id"],world,"data"))
    n, burn = setting["n"], p["burn"]
    size = n+burn
    latent = lfilter([np.sqrt(1-.5**2)],[1,-.5],rng.normal(size=(size,2)),axis=0)[burn:]
    x = np.column_stack((np.ones(n),latent+np.asarray(p["controls"]["means"]))) if setting["controls"] else np.ones((n,1))
    kind, rho = setting["error"], setting["rho"]
    if kind == "t5": innovations = rng.standard_t(5,size=size)*np.sqrt(3/5)
    else: innovations = rng.normal(size=size)
    if kind == "garch":
        g = p["garch"]; values = np.zeros(size); variance=g["initial_variance"]
        for t in range(size):
            if t: variance = g["omega"]+g["alpha"]*values[t-1]**2+g["beta"]*variance
            values[t] = np.sqrt(variance)*innovations[t]
        error=values[burn:]
    else:
        error=lfilter([np.sqrt(1-rho*rho)],[1,-rho],innovations)[burn:]
        if kind == "xhetero": error *= np.sqrt(.5+.5*latent[:,0]**2)
    nuisance=x[:,1:]@np.asarray(p["controls"]["coefficients"]) if setting["controls"] else np.zeros(n)
    y=error+nuisance
    if not np.isfinite(x).all() or not np.isfinite(y).all(): raise ValueError("Nonfinite frozen world")
    return x,y
