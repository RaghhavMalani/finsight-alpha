"""Module 1: frozen D0.4.2 descriptive volatility plus ARCH-LM and GARCH(1,1)."""

from src.dynamics.market_regime import volatility_path

from .garch import arch_lm, fit_garch


def describe(frame, *, settings, tail=250):
    """Per-observation volatility (no annualisation); states are scale-free."""
    returns = frame.value.astype(float).tolist()
    path = volatility_path(returns, 1)
    stamps = [t.isoformat() for t in frame.observed_at]
    garch = fit_garch(returns, minimum=settings["garch"]["minimum"])
    lm = arch_lm(
        returns,
        lags=settings["arch_lm"]["lags"],
        minimum=settings["arch_lm"]["minimum"],
    )
    current = path[-1]
    states = [p["state"] for p in path]
    counts = {s: states.count(s) for s in sorted(set(states))}
    conditional = garch.get("conditional_vol") if garch["status"] == "AVAILABLE" else None
    rows = []
    for i in range(max(0, len(path) - tail), len(path)):
        c = path[i]["components"]
        rows.append(
            {
                "observed_at": stamps[i],
                "state": path[i]["state"],
                "rv_5": c.get("rv_5"),
                "rv_20": c.get("rv_20"),
                "rv_60": c.get("rv_60"),
                "ewma_vol": c.get("ewma_vol"),
                "garch_vol": conditional[i] if conditional else None,
                "cluster_score": path[i].get("cluster_score"),
                "vol_z": c.get("vol_z"),
            }
        )
    return {
        "path": path,
        "stamps": stamps,
        "current": current,
        "state_counts": counts,
        "tail": rows,
        "garch": {k: v for k, v in garch.items() if k != "conditional_vol"},
        "garch_conditional": conditional,
        "arch_lm": lm,
    }
