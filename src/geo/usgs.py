"""USGS earthquake catalog as a point-in-time input family for signal research.

The God's Eye globe (``/globe``) shows the same USGS events live. Here they become four daily
features a network can use as its ``Geo events`` inputs. The timing rule is conservative:
an event is admitted to a row only once ``event time + lag <= row available_at``.

The catalog is retrospective. USGS revises magnitudes and locations after an event, and a
catalog downloaded today carries today's values, not the values first published. Every
trace that uses these features says so in ``geo_provenance.quality``; they are not
publication-time evidence.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from src import config

FEATURES = (
    "geo_quake_count_m5_7d",
    "geo_quake_max_mag_7d",
    "geo_quake_energy_log_30d",
    "geo_quake_near_hub_30d",
)
QUALITY = "RETROSPECTIVE_CATALOG"
# A day between an event and its use: USGS posts M5+ events within minutes, so this errs late.
LAG = timedelta(days=1)
HUB_RADIUS_KM = 1000.0
# Exchange and semiconductor-supply hubs whose disruption reaches US large-cap earnings.
HUBS = {
    "New York": (40.7069, -74.0113),
    "San Francisco Bay": (37.3875, -122.0575),
    "Los Angeles": (34.0522, -118.2437),
    "Tokyo": (35.6828, 139.7595),
    "Hsinchu": (24.8138, 120.9675),
    "Seoul": (37.5665, 126.9780),
    "Shenzhen": (22.5431, 114.0579),
    "Mexico City": (19.4326, -99.1332),
}


@dataclass(frozen=True)
class Catalog:
    """Validated events plus where and when the catalog was retrieved."""

    events: pd.DataFrame
    source: str
    query: str
    retrieved_at: str
    sha256: str
    min_magnitude: float

    def provenance(self) -> dict:
        return {"source": self.source, "query": self.query, "retrieved_at": self.retrieved_at,
                "sha256": self.sha256, "events": int(len(self.events)),
                "min_magnitude": self.min_magnitude, "quality": QUALITY,
                "lag_hours": LAG.total_seconds() / 3600,
                "disclosure": ("Magnitudes and locations are the catalog's values at retrieval, "
                               "not as first published; events enter a row one day after they occur.")}


def catalog_path() -> Path:
    return config.DATA_DIR / "geo" / "usgs_catalog.json"


def parse_catalog(raw: bytes) -> Catalog:
    """Parse an installed catalog file; any malformed event rejects the whole file."""
    payload = json.loads(raw.decode("utf-8"))
    if payload.get("schema_version") != "usgs-catalog/1":
        raise ValueError("USGS catalog schema is not usgs-catalog/1")
    rows, ids = [], set()
    for event in payload.get("events", []):
        identity = str(event.get("id") or "")
        time = pd.Timestamp(event.get("time"))
        values = [event.get(k) for k in ("mag", "lat", "lon")]
        if (not identity or identity in ids or time.tzinfo is None
                or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in values)
                or abs(values[1]) > 90 or abs(values[2]) > 180 or not -2 <= values[0] <= 10):
            raise ValueError(f"Malformed USGS event {identity or '(no id)'}")
        ids.add(identity)
        rows.append({"id": identity, "time": time.tz_convert("UTC"), "mag": float(values[0]),
                     "lat": float(values[1]), "lon": float(values[2])})
    if not rows:
        raise ValueError("USGS catalog has no events")
    events = pd.DataFrame(rows).sort_values(["time", "id"]).reset_index(drop=True)
    retrieved = pd.Timestamp(payload["retrieved_at"])
    if retrieved.tzinfo is None:
        raise ValueError("Catalog retrieval time must carry a timezone")
    return Catalog(events=events, source=str(payload["source"]), query=str(payload["query"]),
                   retrieved_at=retrieved.tz_convert("UTC").isoformat(),
                   sha256=hashlib.sha256(raw).hexdigest(),
                   min_magnitude=float(payload["min_magnitude"]))


def load_catalog(path: Path | None = None) -> Catalog:
    return parse_catalog((path or catalog_path()).read_bytes())


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 6371.0088 * 2 * np.arcsin(np.sqrt(a))


def near_hub(events: pd.DataFrame) -> np.ndarray:
    near = np.zeros(len(events), dtype=bool)
    for lat, lon in HUBS.values():
        near |= haversine_km(events["lat"].to_numpy(), events["lon"].to_numpy(), lat, lon) <= HUB_RADIUS_KM
    return near


def seismic_energy_joules(magnitude):
    """Gutenberg-Richter energy, log10 E = 1.5 M + 4.8 (joules)."""
    return np.power(10.0, 1.5 * np.asarray(magnitude, dtype=float) + 4.8)


def geo_features(available_at: pd.Series, catalog: Catalog, *, as_of: str | None = None) -> pd.DataFrame:
    """Four features per row, each from events with time + LAG <= that row's available_at.

    Rows whose windows reach before the catalog's first event are left NaN, so a short
    catalog never reads as a quiet planet.
    """
    times = pd.to_datetime(available_at, utc=True)
    events = catalog.events
    if as_of is not None:
        cutoff = pd.Timestamp(as_of).tz_convert("UTC") - LAG
        events = events[events["time"] <= cutoff]
    admitted = (events["time"] + LAG).to_numpy(dtype="datetime64[ns]")
    mags = events["mag"].to_numpy()
    energy = seismic_energy_joules(mags)
    hub = near_hub(events)
    m5 = mags >= 5.0
    first = admitted.min() if len(admitted) else None
    out = np.full((len(times), len(FEATURES)), np.nan)
    for row, at in enumerate(times.to_numpy(dtype="datetime64[ns]")):
        if first is None or at - np.timedelta64(30, "D") < first:
            continue
        upto = np.searchsorted(admitted, at, side="right")
        w7 = np.searchsorted(admitted, at - np.timedelta64(7, "D"), side="right")
        w30 = np.searchsorted(admitted, at - np.timedelta64(30, "D"), side="right")
        week = slice(w7, upto)
        month = slice(w30, upto)
        out[row, 0] = float(m5[week].sum())
        out[row, 1] = float(mags[week].max()) if upto > w7 else float(catalog.min_magnitude)
        out[row, 2] = float(np.log10(energy[month].sum() + 1.0))
        out[row, 3] = float((hub[month] & (mags[month] >= catalog.min_magnitude)).sum())
    return pd.DataFrame(out, columns=list(FEATURES), index=available_at.index)


def build_catalog_payload(features: list[dict], *, query: str, min_magnitude: float,
                          retrieved_at: datetime | None = None) -> dict:
    """Normalize USGS FDSN GeoJSON features into the installed catalog format."""
    events = []
    for feature in features:
        props = feature.get("properties") or {}
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        if props.get("mag") is None or len(coords) < 2 or props.get("time") is None:
            continue
        events.append({
            "id": str(feature.get("id")),
            "time": datetime.fromtimestamp(props["time"] / 1000, tz=timezone.utc).isoformat(),
            "mag": float(props["mag"]), "lat": float(coords[1]), "lon": float(coords[0]),
        })
    events.sort(key=lambda e: (e["time"], e["id"]))
    return {"schema_version": "usgs-catalog/1", "source": "USGS ComCat FDSN event service",
            "query": query, "min_magnitude": min_magnitude,
            "retrieved_at": (retrieved_at or datetime.now(timezone.utc)).isoformat(),
            "events": events}
