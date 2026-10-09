"""Factor exposure cost sensitivity. This is not an Indian statutory fee model."""
import numpy as np


def strategy_returns(market,positions,bps):
    market,positions=np.asarray(market,dtype=float),np.asarray(positions,dtype=float)
    if market.ndim!=1 or market.shape!=positions.shape or len(market)<1:
        raise ValueError("Misaligned strategy inputs")
    if not np.isfinite(market).all() or not np.isfinite(positions).all() or not np.isfinite(bps) or bps<0:
        raise ValueError("Invalid returns, positions or costs")
    turnover=np.abs(np.diff(np.r_[0.,positions]))
    turnover[-1]+=abs(positions[-1])
    costs=turnover*bps/10000
    return positions*market-costs,turnover,costs


def indian_statutory_costs():
    return {"status":"UNAVAILABLE","reason":"Market-factor captures provide no traded instrument, buy/sell fills, turnover category, fee schedule, borrow or spread. Phase 3 statutory Indian costs are not implemented here."}
