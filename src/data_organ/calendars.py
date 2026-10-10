"""Session evidence is bounded. XNSE never aliases XBOM or weekdays."""

import re
from datetime import date
from hashlib import sha256

from src.truth.contracts import canonical_hash


def sessions(calendar, start, end):
    start, end = date.fromisoformat(start), date.fromisoformat(end)
    if start > end:
        raise ValueError("Reversed calendar window")
    if calendar.get("mic") == "XNSE":
        if (
            not calendar.get("source_url", "").startswith(
                (
                    "https://www.nseindia.com/",
                    "https://nseindia.com/",
                    "https://nsearchives.nseindia.com/",
                )
            )
            or not re.fullmatch(r"[a-f0-9]{64}", str(calendar.get("source_sha256", "")))
            or not calendar.get("version")
            or calendar.get("status") != "EVIDENCED"
            or start < date.fromisoformat(calendar["start"])
            or end > date.fromisoformat(calendar["end"])
        ):
            raise ValueError("UNAVAILABLE: unsupported official NSE calendar window")
        rows = calendar.get("sessions")
        if (
            not isinstance(rows, list)
            or rows != sorted(set(rows))
            or canonical_hash(rows) != calendar.get("sessions_hash")
            or any(
                not date.fromisoformat(calendar["start"])
                <= date.fromisoformat(s)
                <= date.fromisoformat(calendar["end"])
                for s in rows
            )
        ):
            raise ValueError("UNAVAILABLE: NSE session evidence seal mismatch")
        return [s for s in rows if start <= date.fromisoformat(s) <= end]
    if calendar.get("mic") not in {"XNYS", "XNAS", "XBOM"}:
        raise ValueError("UNAVAILABLE: unsupported calendar")
    import importlib.metadata

    import exchange_calendars as xcals

    if calendar.get("version") != importlib.metadata.version("exchange-calendars"):
        raise ValueError("Calendar package evidence version mismatch")
    return [
        str(t.date())
        for t in xcals.get_calendar(calendar["mic"]).sessions_in_range(
            str(start), str(end)
        )
    ]


def calendar_identity(calendar):
    return canonical_hash(calendar)


def nse_evidence(raw, *, source_url, version, start, end, session_dates):
    if not source_url.startswith(
        (
            "https://nseindia.com/",
            "https://www.nseindia.com/",
            "https://nsearchives.nseindia.com/",
        )
    ):
        raise ValueError("Official NSE session evidence required")
    return {
        "mic": "XNSE",
        "status": "EVIDENCED",
        "source_url": source_url,
        "source_sha256": sha256(raw).hexdigest(),
        "version": version,
        "start": start,
        "end": end,
        "sessions": sorted(set(session_dates)),
        "sessions_hash": canonical_hash(sorted(set(session_dates))),
    }
