"""Point-in-time world construction for Dynamics Lab theories."""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from typing import Sequence

from src.dynamics.contracts import TheoryWorld


class TheoryWorldError(ValueError):
    """Raised when observations cannot form a valid point-in-time world."""


_SECONDS_PER_UNIT = {"minute": 60.0, "hour": 3_600.0, "day": 86_400.0}


def elapsed_in_unit(start: datetime, end: datetime, time_unit: str) -> float:
    try:
        divisor = _SECONDS_PER_UNIT[time_unit]
    except KeyError as exc:
        raise TheoryWorldError(f"unsupported time unit {time_unit!r}") from exc
    return (end - start).total_seconds() / divisor


def make_theory_world(
    values: Sequence[float],
    *,
    observable: str,
    observed_at: Sequence[datetime] | None = None,
    available_at: Sequence[datetime] | None = None,
    as_of: datetime | None = None,
    time_unit: str = "day",
    regular_dt: float = 1.0,
    source: str = "in-memory",
    revision: str = "unversioned",
) -> TheoryWorld:
    """Validate observations and bind them to an immutable PIT world hash."""

    if len(values) < 64:
        raise TheoryWorldError("at least 64 ordered observations are required")
    if len(values) > 10_000:
        raise TheoryWorldError("at most 10,000 observations may enter one theory world")
    numeric_values = tuple(float(value) for value in values)
    if not all(math.isfinite(value) for value in numeric_values):
        raise TheoryWorldError("observable values must all be finite")
    if time_unit not in _SECONDS_PER_UNIT:
        raise TheoryWorldError(f"unsupported time unit {time_unit!r}")
    if not math.isfinite(regular_dt) or regular_dt <= 0:
        raise TheoryWorldError("regular_dt must be a positive finite number")

    if observed_at is None:
        origin = datetime(2000, 1, 1, tzinfo=timezone.utc)
        unit_seconds = _SECONDS_PER_UNIT[time_unit]
        observed = tuple(
            origin + timedelta(seconds=index * regular_dt * unit_seconds)
            for index in range(len(numeric_values))
        )
    else:
        observed = tuple(observed_at)
    if len(observed) != len(numeric_values):
        raise TheoryWorldError("observed_at must match the number of values")
    if any(timestamp.tzinfo is None for timestamp in observed):
        raise TheoryWorldError("observed_at timestamps must include a timezone")
    if any(right <= left for left, right in zip(observed, observed[1:])):
        raise TheoryWorldError("observed_at timestamps must be strictly increasing")

    available = tuple(available_at) if available_at is not None else observed
    if len(available) != len(numeric_values):
        raise TheoryWorldError("available_at must match the number of values")
    if any(timestamp.tzinfo is None for timestamp in available):
        raise TheoryWorldError("available_at timestamps must include a timezone")
    if any(
        available_time < observed_time
        for observed_time, available_time in zip(observed, available)
    ):
        raise TheoryWorldError("available_at cannot precede observed_at")

    resolved_as_of = as_of or available[-1]
    if resolved_as_of.tzinfo is None:
        raise TheoryWorldError("as_of must include a timezone")
    if any(timestamp > resolved_as_of for timestamp in available):
        raise TheoryWorldError("an observation is not available in the requested as_of world")

    manifest = {
        "as_of": resolved_as_of.isoformat(),
        "observable": observable,
        "time_unit": time_unit,
        "source": source,
        "revision": revision,
        "observations": [
            {
                "value": value,
                "observed_at": observation.isoformat(),
                "available_at": availability.isoformat(),
            }
            for value, observation, availability in zip(numeric_values, observed, available)
        ],
    }
    encoded = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    world_hash = hashlib.sha256(encoded).hexdigest()
    return TheoryWorld(
        world_hash=world_hash,
        as_of=resolved_as_of,
        observable=observable,
        values=numeric_values,
        observed_at=observed,
        available_at=available,
        time_unit=time_unit,
        point_in_time_enforced=True,
        source=source,
        revision=revision,
    )
