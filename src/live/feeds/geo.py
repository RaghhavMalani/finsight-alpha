"""Geo feeds: USGS earthquakes, GDELT 2.0 events, NWS alerts, CelesTrak elements."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from datetime import datetime, timedelta, timezone

from .. import model
from .base import Feed, FeedError, Fetched, http_get


class USGSQuakes(Feed):
    name = "usgs"
    event_type = "geo.event"
    cadence_s = 120
    min_interval_s = 60
    delay = "NEAR_REAL_TIME: USGS summary feed refreshes about every minute; automatic solutions are revised"
    parser = "live-usgs/1"
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
    licence = model.licence(
        "PUBLIC_DOMAIN", "U.S. Geological Survey, Earthquake Hazards Program",
        "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits", "PUBLIC")

    def fetch(self):
        return self.parse(http_get(self.url))

    def parse(self, fetched: Fetched):
        payload = json.loads(fetched.raw.decode("utf-8"))
        out = []
        for feature in payload.get("features") or []:
            props = feature.get("properties") or {}
            coords = (feature.get("geometry") or {}).get("coordinates") or []
            if not feature.get("id") or props.get("time") is None or props.get("updated") is None:
                continue
            out.append(self.observation(
                source_id=feature["id"], revision=str(props["updated"]),
                observed_at=model.from_epoch_ms(props["time"]),
                effective_at=model.from_epoch_ms(props["updated"]),
                fetched=fetched,
                # Reviewed solutions are the network's published values; automatic ones are provisional.
                confidence="OFFICIAL" if props.get("status") == "reviewed" else "PROVISIONAL",
                payload={
                    "kind": "earthquake",
                    "mag": props.get("mag"), "mag_type": props.get("magType"),
                    "place": props.get("place"), "title": props.get("title"),
                    "lon": coords[0] if len(coords) > 0 else None,
                    "lat": coords[1] if len(coords) > 1 else None,
                    "depth_km": coords[2] if len(coords) > 2 else None,
                    "status": props.get("status"), "tsunami": props.get("tsunami"),
                    "alert": props.get("alert"), "sig": props.get("sig"), "url": props.get("url"),
                },
            ))
        return out


# GDELT 2.0 event table columns used here (0-based, of 61).
G_ID, G_DAY, G_A1, G_A1C, G_A2, G_A2C, G_IS_ROOT, G_CODE, G_ROOT, G_QUAD, G_GOLD = 0, 1, 6, 7, 16, 17, 25, 26, 28, 29, 30
G_MENTIONS, G_SOURCES, G_ARTICLES, G_TONE = 31, 32, 33, 34
G_PLACE, G_CC, G_LAT, G_LON, G_ADDED, G_URL = 52, 53, 56, 57, 59, 60
BATCH = timedelta(minutes=15)


class GDELTEvents(Feed):
    name = "gdelt"
    event_type = "geo.event"
    cadence_s = 900
    min_interval_s = 300
    delay = "15_MIN_BATCH: GDELT publishes machine-coded events from news every 15 minutes"
    confidence = "UNOFFICIAL"
    parser = "live-gdelt/1"
    index_url = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"
    keep = 60  # most-mentioned conflict events with a location per batch
    licence = model.licence(
        "OPEN_WITH_CITATION", "The GDELT Project (gdeltproject.org)",
        "https://www.gdeltproject.org/about.html#termsofuse", "PUBLIC",
        "Unlimited use with citation; events are machine-coded from news, not verified facts")

    def fetch(self):
        index = http_get(self.index_url)
        line = next((l for l in index.raw.decode("utf-8").splitlines() if l.endswith(".export.CSV.zip")), None)
        if not line:
            raise FeedError("GDELT lastupdate lists no export file")
        size, md5, url = line.split()
        archive = http_get(url, max_bytes=8 * 1024 * 1024)
        if hashlib.md5(archive.raw).hexdigest() != md5:  # noqa: S324 - GDELT publishes md5
            raise FeedError("GDELT export checksum mismatch")
        return self.parse(archive, listed_md5=md5)

    def parse(self, fetched: Fetched, listed_md5: str | None = None):
        with zipfile.ZipFile(io.BytesIO(fetched.raw)) as archive:
            text = archive.read(archive.namelist()[0]).decode("utf-8", errors="replace")
        rows = [r for r in csv.reader(io.StringIO(text), delimiter="\t") if len(r) == 61]
        chosen = []
        for r in rows:
            if r[G_QUAD] not in ("3", "4") or not r[G_LAT] or not r[G_LON]:
                continue
            chosen.append(r)
        chosen.sort(key=lambda r: (-int(r[G_MENTIONS] or 0), r[G_ID]))
        out = []
        for r in chosen[: self.keep]:
            added = r[G_ADDED]
            label = datetime.strptime(added, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
            # GDELT labels a batch by the END of its 15-minute window and publishes it before
            # that instant, so the label is in the future at fetch time. The window start is
            # the latest instant the batch can honestly claim.
            stamp = model.iso(label - BATCH)
            num = lambda v: float(v) if v not in ("", None) else None  # noqa: E731
            out.append(self.observation(
                source_id=r[G_ID], revision=added, observed_at=stamp, effective_at=None, fetched=fetched,
                listed_md5=listed_md5,
                payload={
                    "kind": "gdelt_event", "event_day": r[G_DAY], "gdelt_dateadded": added,
                    "observed_basis": "GDELT batch window start (DATEADDED minus 15 min)", "event_code": r[G_CODE],
                    "root_code": r[G_ROOT], "is_root_event": r[G_IS_ROOT] == "1",
                    "quad_class": int(r[G_QUAD]),
                    "goldstein": num(r[G_GOLD]), "num_mentions": int(r[G_MENTIONS] or 0),
                    "num_sources": int(r[G_SOURCES] or 0), "num_articles": int(r[G_ARTICLES] or 0),
                    "avg_tone": num(r[G_TONE]), "actor1": r[G_A1] or None, "actor1_country": r[G_A1C] or None,
                    "actor2": r[G_A2] or None, "actor2_country": r[G_A2C] or None,
                    "place": r[G_PLACE] or None, "country": r[G_CC] or None,
                    "lat": num(r[G_LAT]), "lon": num(r[G_LON]), "url": r[G_URL] or None,
                },
            ))
        return out


def _centroid(geometry):
    """Mean vertex of the outer ring(s); None when the alert has no geometry (zone-coded)."""
    if not geometry:
        return None, None
    rings = geometry.get("coordinates") or []
    if geometry.get("type") == "Polygon":
        rings = rings[:1]
    elif geometry.get("type") == "MultiPolygon":
        rings = [poly[0] for poly in rings if poly]
    else:
        return None, None
    points = [p for ring in rings for p in ring]
    if not points:
        return None, None
    return (sum(p[1] for p in points) / len(points), sum(p[0] for p in points) / len(points))


class NWSAlerts(Feed):
    name = "nws"
    event_type = "geo.event"
    cadence_s = 300
    min_interval_s = 60
    delay = "NEAR_REAL_TIME: active alerts as issued by NWS offices"
    confidence = "OFFICIAL"
    parser = "live-nws/1"
    url = "https://api.weather.gov/alerts/active"
    params = {"status": "actual", "severity": "Extreme,Severe"}
    licence = model.licence(
        "PUBLIC_DOMAIN", "U.S. National Weather Service (NOAA)",
        "https://www.weather.gov/disclaimer", "PUBLIC")

    def fetch(self):
        return self.parse(http_get(self.url, params=self.params, headers={"Accept": "application/geo+json"}))

    def parse(self, fetched: Fetched):
        payload = json.loads(fetched.raw.decode("utf-8"))
        out = []
        for feature in payload.get("features") or []:
            p = feature.get("properties") or {}
            if not p.get("id") or not p.get("sent"):
                continue
            lat, lon = _centroid(feature.get("geometry"))
            out.append(self.observation(
                source_id=p["id"], revision=p["sent"], observed_at=p["sent"],
                effective_at=p.get("effective"), fetched=fetched,
                payload={
                    "kind": "nws_alert", "event": p.get("event"), "severity": p.get("severity"),
                    "certainty": p.get("certainty"), "urgency": p.get("urgency"),
                    "message_type": p.get("messageType"), "headline": p.get("headline"),
                    "area": p.get("areaDesc"), "sender": p.get("senderName"),
                    "onset": p.get("onset"), "expires": p.get("expires"),
                    "lat": lat, "lon": lon,
                    "location_basis": "POLYGON_MEAN_VERTEX" if lat is not None else "NOT_MEASURED: zone-coded alert",
                },
            ))
        return out


class CelesTrak(Feed):
    name = "celestrak"
    event_type = "geo.event"
    cadence_s = 86400
    min_interval_s = 7200  # CelesTrak usage policy: a group at most once per two hours
    delay = "DAILY: general-perturbation element sets; epoch is the element-set time"
    confidence = "OFFICIAL"
    parser = "live-celestrak/1"
    url = "https://celestrak.org/NORAD/elements/gp.php"
    params = {"GROUP": "stations", "FORMAT": "json"}
    licence = model.licence(
        "ATTRIBUTION_REQUIRED", "CelesTrak; USSPACECOM / 18th Space Defense Squadron; Space-Track.org",
        "https://celestrak.org/usage-policy.php", "PUBLIC",
        "Cited basic SSA redistribution; fetch a group at most once per two hours; stop on non-200")

    def fetch(self):
        return self.parse(http_get(self.url, params=self.params))

    def parse(self, fetched: Fetched):
        rows = json.loads(fetched.raw.decode("utf-8"))
        out = []
        for row in rows if isinstance(rows, list) else []:
            if row.get("NORAD_CAT_ID") is None or not row.get("EPOCH"):
                continue
            epoch = row["EPOCH"] if row["EPOCH"].endswith("Z") else row["EPOCH"] + "Z"
            out.append(self.observation(
                source_id=str(row["NORAD_CAT_ID"]), revision=epoch, observed_at=epoch, effective_at=epoch,
                fetched=fetched,
                payload={"kind": "orbital_elements", "name": row.get("OBJECT_NAME"),
                         "object_id": row.get("OBJECT_ID"), "group": self.params["GROUP"],
                         "omm": {k: row[k] for k in sorted(row)}},
            ))
        return out
