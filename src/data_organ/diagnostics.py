"""Raw-before-cleaning health and comparison without source substitution."""

import math
import statistics
from collections import Counter
from hashlib import sha256
from itertools import pairwise
from pathlib import Path

from finsight.plugins.contracts import utc
from src.truth.contracts import canonical_hash

from .calendars import calendar_identity, sessions
from .contracts import preserved_json


def health(rows, capture, *, start, end, quarantined=()):
    selected = [
        r
        for r in rows
        if isinstance(r.get("observed_at"), str)
        and start <= r["observed_at"][:10] <= end
    ]
    clocks = [r["observed_at"] for r in selected]
    values = [
        r["value"]
        for r in selected
        if type(r.get("value")) in (int, float) and math.isfinite(r["value"])
    ]
    counts = Counter(
        canonical_hash(
            preserved_json(
                {k: r.get(k) for k in ("asset", "field", "observed_at", "revision")}
            )
        )
        for r in selected
    )
    duplicates = sum(n - 1 for n in counts.values())
    zero = sum(v == 0 for v in values)
    # Distinct factor definitions/units must not share a pooled MAD denominator.
    groups = {}
    for row in selected:
        if type(row.get("value")) in (int, float) and math.isfinite(row["value"]):
            groups.setdefault((row.get("asset"), row.get("field")), []).append(
                row["value"]
            )
    outliers = 0
    for group in groups.values():
        median = statistics.median(group)
        mad = statistics.median(abs(v - median) for v in group)
        outliers += sum(abs(v - median) > 10 * mad for v in group) if mad else 0
    missing, calendar_status, reason = (
        None,
        "UNAVAILABLE",
        "Source has no evidenced session calendar",
    )
    if capture.calendar.get("mic"):
        try:
            expected = set(sessions(capture.calendar, start, end))
            observed = {r["observed_at"][:10] for r in selected}
            missing, calendar_status, reason = (
                len(expected - observed),
                "AVAILABLE",
                None,
            )
        except (ValueError, KeyError, TypeError) as error:
            reason = str(error)
    if capture.calendar.get("status") == "NOT_APPLICABLE":
        calendar_status, reason = "NOT_APPLICABLE", None
    publication_lags = []
    if capture.clock_quality != "CAPTURE_ONLY":
        for row in selected:
            try:
                if type(row.get("value")) in (int, float) and math.isfinite(
                    row["value"]
                ):
                    lag = (
                        utc(row["available_at"]) - utc(row["observed_at"])
                    ).total_seconds()
                    if lag >= 0:
                        publication_lags.append(lag)
            except (ValueError, TypeError, KeyError):
                continue
    valid_clocks = []
    for clock in clocks:
        try:
            valid_clocks.append(utc(clock))
        except (ValueError, TypeError):
            pass
    age = (
        (utc(capture.captured_at) - max(valid_clocks)).total_seconds()
        if valid_clocks
        else None
    )
    contract = {
        "version": "data-health/1",
        "source_version": capture.identity,
        "window": [start, end],
        "calendar_hash": calendar_identity(capture.calendar),
        "input_hash": canonical_hash(preserved_json(rows)),
        "quarantine_hash": canonical_hash(list(quarantined)),
        "threshold_profile": "health-thresholds/2; per asset/field robust 10*MAD; daily freshness 7 days; monthly 65 days",
        "computation_source_hash": sha256(
            Path(__file__).read_bytes().replace(b"\r\n", b"\n")
        ).hexdigest(),
    }
    return {
        "diagnostic_id": canonical_hash(contract),
        "contract": contract,
        "source": capture.source,
        "status": "PARTIAL"
        if not selected or quarantined or calendar_status == "UNAVAILABLE"
        else "AVAILABLE",
        "window_start": start,
        "window_end": end,
        "rows": len(selected),
        "library_start": min(
            r["observed_at"] for r in rows if isinstance(r.get("observed_at"), str)
        )[:10]
        if rows
        else None,
        "duplicates": duplicates,
        "quarantined": len(quarantined),
        "non_monotonic": sum(a > b for a, b in pairwise(clocks)),
        "zero_observations": zero,
        "robust_outliers": outliers,
        "missing_sessions": missing,
        "calendar_status": calendar_status,
        "calendar_reason": reason,
        "cleaning_stage": (capture.metadata or {}).get(
            "cleaning_stage", "CAPTURED_INPUT"
        ),
        "clock_quality": capture.clock_quality,
        "finding": "Anomaly counts are descriptive checks, not economic confirmations",
        "observation_age_seconds": age,
        "capture_age_seconds": 0,
        "age_reference": capture.captured_at,
        "publication_lag_status": "UNAVAILABLE"
        if capture.clock_quality == "CAPTURE_ONLY"
        else "AVAILABLE"
        if publication_lags
        else "UNAVAILABLE",
        "publication_lag_median_seconds": statistics.median(publication_lags)
        if publication_lags
        else None,
        "publication_lag_max_seconds": max(publication_lags)
        if publication_lags
        else None,
        "adjustment_evidence_status": "NOT_APPLICABLE"
        if capture.price_basis == "NOT_APPLICABLE"
        else "UNAVAILABLE",
        "ohlcv_status": (capture.metadata or {})
        .get("market_anomalies", {})
        .get("status", "UNAVAILABLE"),
        "freshness_status": "HISTORICAL_WINDOW"
        if end < capture.captured_at[:10]
        else "STALE"
        if age is not None
        and age > (65 if capture.feed_scope == "BLS_U3" else 7) * 86400
        else "UNKNOWN"
        if age is None
        else "WITHIN_PROFILE",
    }


def market_anomalies(frame, *, price_basis, adjustment_evidence=None):
    """Local pre-standardization scan. Jumps flag investigation, never auto-adjust."""
    import pandas as pd

    required = {"Date", "Open", "High", "Low", "Close", "Volume"}
    if not required <= set(frame):
        return {"status": "UNAVAILABLE", "reason": "OHLCV fields unsupported"}
    rows = frame.to_dict("records")
    impossible, invalid_volume, invalid_numeric, jumps = 0, 0, 0, 0
    previous = None
    for row in rows:
        prices = [row[k] for k in ("Open", "High", "Low", "Close")]
        valid = all(
            type(v) in (int, float) and math.isfinite(v) and v > 0 for v in prices
        )
        if not valid:
            invalid_numeric += 1
        elif row["High"] < max(row["Open"], row["Close"], row["Low"]) or row[
            "Low"
        ] > min(row["Open"], row["Close"], row["High"]):
            impossible += 1
        volume = row["Volume"]
        invalid_volume += not (
            type(volume) in (int, float) and math.isfinite(volume) and volume >= 0
        )
        if valid and previous and abs(row["Close"] / previous - 1) > 0.30:
            jumps += 1
        previous = row["Close"] if valid else None
    return {
        "status": "AVAILABLE",
        "rows": len(rows),
        "impossible_ohlc": impossible,
        "invalid_volume": invalid_volume,
        "invalid_numeric": invalid_numeric,
        "large_jumps": jumps,
        "threshold": "absolute adjacent close return > 30%; descriptive only",
        "duplicates": int(frame.Date.duplicated().sum()),
        "non_monotonic": int(not pd.to_datetime(frame.Date).is_monotonic_increasing),
        "price_basis": price_basis,
        "adjustment_evidence_status": "EVIDENCED"
        if adjustment_evidence
        else "UNAVAILABLE",
        "cleaning_stage": "CAPTURED_INPUT",
    }


def disagreement(a, b, capture_a, capture_b, *, mirror=False):
    keys = ("field_definition", "unit", "feed_scope", "price_basis")
    reasons = [k for k in keys if getattr(capture_a, k) != getattr(capture_b, k)]
    if reasons:
        return {
            "status": "INCOMPATIBLE",
            "reasons": reasons,
            "pairs": 0,
            "meaning": "Providers preserved separately; no splice",
        }
    # Only exact observation and information vintages are comparable.
    indexed = {
        (r["asset"], r["field"], r["observed_at"], r["available_at"]): r for r in b
    }
    pairs = [
        (r, indexed[(r["asset"], r["field"], r["observed_at"], r["available_at"])])
        for r in a
        if (r["asset"], r["field"], r["observed_at"], r["available_at"]) in indexed
    ]
    deltas = [x["value"] - y["value"] for x, y in pairs]
    return {
        "status": "AVAILABLE" if pairs else "UNAVAILABLE",
        "pairs": len(pairs),
        "different": sum(abs(d) > 1e-12 for d in deltas),
        "max_absolute_delta": max(map(abs, deltas), default=None),
        "meaning": "Mirror consistency check; same BLS upstream, not independent economic confirmation"
        if mirror
        else "Compatible provider discrepancy; no automatic source selection",
        "local_pairs": [
            {"a": x, "b": y, "delta": x["value"] - y["value"]} for x, y in pairs
        ],
    }
