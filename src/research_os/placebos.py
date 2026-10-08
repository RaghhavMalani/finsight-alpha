"""Predeclared negative controls, each with explicit exchangeability semantics."""
import numpy as np


def negative_control(signal,market,regime,variant,seed):
    signal,market,regime=np.asarray(signal).copy(),np.asarray(market).copy(),np.asarray(regime).copy()
    if signal.shape!=market.shape or signal.shape!=regime.shape: raise ValueError("Control alignment mismatch")
    rng=np.random.default_rng(seed)
    if variant=="WRONG_DIRECTION": signal=-signal
    elif variant=="RANDOM_SIGNAL": signal=rng.choice([-1.,1.],size=len(signal))
    elif variant=="SHUFFLED_DATES": signal=np.roll(signal,int(rng.integers(1,len(signal))))
    elif variant=="PERMUTED_OUTCOME": market=np.roll(market,int(rng.integers(1,len(market))))
    elif variant.startswith("SHUFFLED_REGIME"): regime=rng.permutation(regime)
    return signal,market,regime
