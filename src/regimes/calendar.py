"""Explicitly bounded session evidence. XNSE never aliases XBOM or weekdays.

The exchange-calendars package builds a rolling default window (about twenty
years back from today), which is neither stable nor long enough for a 2000
analysis window. Phase 5 therefore requests explicit bounds and binds package
version, bounds and the session hash into the computation identity.
"""

from importlib.metadata import version

import pandas as pd

from src.truth.contracts import canonical_hash


def session_evidence(calendar, observed_dates):
    """Return session semantics for observed dates, or why they are unavailable."""
    dates = sorted({pd.Timestamp(d).date().isoformat() for d in observed_dates})
    if not dates:
        return {"status": "UNAVAILABLE", "reason": "No observations", "unit": "observation"}
    mic = calendar.get("mic")
    if mic != "XNYS" or calendar.get("status") != "PACKAGE_EVIDENCE":
        return {
            "status": "UNAVAILABLE",
            "mic": mic,
            "unit": "observation",
            "reason": calendar.get("reason")
            or "No evidenced session calendar for this market; observation steps only",
            "identity": canonical_hash({"mic": mic, "status": "UNAVAILABLE"}),
        }
    import exchange_calendars as xcals

    start, end = dates[0], dates[-1]
    sessions = [
        d.strftime("%Y-%m-%d")
        for d in xcals.get_calendar("XNYS", start=start, end=end).sessions_in_range(
            start, end
        )
    ]
    expected, observed = set(sessions), set(dates)
    evidence = {
        "mic": "XNYS",
        "package": "exchange-calendars",
        "package_version": version("exchange-calendars"),
        "start": start,
        "end": end,
        "sessions_hash": canonical_hash(sessions),
    }
    missing, extra = sorted(expected - observed), sorted(observed - expected)
    return {
        "status": "VERIFIED" if not missing and not extra else "PARTIAL",
        "unit": "session" if not extra else "observation",
        "identity": canonical_hash(evidence),
        "evidence": evidence,
        "expected_sessions": len(sessions),
        "missing_sessions": len(missing),
        "unexpected_dates": len(extra),
        "missing_examples": missing[:5],
        "unexpected_examples": extra[:5],
        "meaning": "Calendar package evidence with explicit bounds; not an exchange publication receipt",
    }
