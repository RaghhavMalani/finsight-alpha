"""Module 6: descriptive momentum views, kept apart from the frozen Phase 4 study.

Primary panel: the 12-1 market-factor signal itself, distributed by HMM state.
Separate panel: the published cross-sectional MOM factor by regime. Neither is a
return of a 12-1 market-timing signal, and neither carries a verdict.
"""

import numpy as np


def signal_path(returns, *, lookback=252, skip=21):
    """signal_t = prod(1 + r_i) - 1 over observations t-lookback .. t-skip-1."""
    values = np.asarray(returns, float)
    log = np.concatenate([[0.0], np.cumsum(np.log1p(values))])
    out = [None] * len(values)
    for t in range(lookback, len(values)):
        out[t] = float(np.expm1(log[t - skip] - log[t - lookback]))
    return out


def _summary(values):
    data = np.asarray(values, float)
    if not len(data):
        return {"n": 0}
    median = float(np.median(data))
    return {
        "n": int(len(data)),
        "mean": float(np.mean(data)),
        "median": median,
        "positive_fraction": float(np.mean(data > 0)),
        "mad": float(np.median(np.abs(data - median))),
        "sd": float(np.std(data, ddof=1)) if len(data) > 1 else None,
    }


def signal_by_state(signals, states):
    groups = {}
    for value, state in zip(signals, states):
        if value is not None and state is not None:
            groups.setdefault(state, []).append(value)
    return {label: _summary(v) for label, v in sorted(groups.items())}


def mom_by_state(mom, states, *, annualization, minimum=30):
    """Next-observation MOM factor grouped by the lagged filtered state."""
    groups = {}
    for i in range(len(states) - 1):
        if states[i] is not None and mom[i + 1] is not None:
            groups.setdefault(states[i], []).append(mom[i + 1])
    out = {}
    for label, values in sorted(groups.items()):
        item = _summary(values)
        sd = item.get("sd")
        if item["n"] >= minimum and sd:
            ratio = item["mean"] / sd
            item["descriptive_sharpe"] = (
                ratio * np.sqrt(annualization) if annualization > 1 else ratio
            )
            item["sharpe_unit"] = (
                f"annualised by sqrt({annualization})" if annualization > 1 else "per observation"
            )
        else:
            item["descriptive_sharpe"] = None
            item["sharpe_unit"] = f"unavailable below {minimum} observations"
        out[label] = item
    return out
