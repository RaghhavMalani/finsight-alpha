"""Module 7: aggregate event pressure only from an admitted event stream.

No admitted stream means EVENT PRESSURE - UNAVAILABLE. Synthetic event worlds
exist only as test fixtures; graphs, edges and causal readings are never shown.
"""

from src.dynamics.market_regime import _event_fit

UNAVAILABLE_REASON = "No admitted event stream with genuine observation and availability clocks"


def admitted_streams(signals):
    streams = sorted({s.source for s in signals if s.name == "event_time"})
    if any(s.startswith(("synthetic", "test:", "fixture")) for s in streams):
        raise ValueError("Synthetic event streams cannot enter real regime views")
    return streams


def aggregate_pressure(times, horizon, *, minimum=30):
    """Univariate exponential Hawkes aggregate diagnostics (D0.4.1 estimator)."""
    times = tuple(sorted(float(t) for t in times))
    if len(times) < minimum:
        return {"status": "UNAVAILABLE", "reason": f"Fewer than {minimum} admitted events"}
    fit = _event_fit(times, float(horizon))
    if fit["status"] != "AVAILABLE":
        return {"status": "UNAVAILABLE", "reason": "Existing Hawkes optimizer did not return a usable fit"}
    rho = fit["fitted_rho"]
    return {
        "status": "AVAILABLE",
        "baseline_intensity": fit["mu"],
        "branching_ratio_diagnostic": rho,
        "near_criticality_diagnostic": "NEAR_CRITICAL" if rho >= 0.9 else "SUBCRITICAL",
        "aggregate_intensity": len(times) / float(horizon),
        "excitation_share_diagnostic": rho,
        "graph_status": "NOT_TRUSTED",
        "edge_confidence_status": "NOT_TRUSTED",
        "causal_status": "NOT_ESTABLISHED",
        "criticality_status": "UNRESOLVED",
    }
