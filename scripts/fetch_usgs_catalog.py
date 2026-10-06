"""Install the USGS earthquake catalog the neural Geo events inputs read.

Downloads M4.5+ worldwide events from the USGS ComCat FDSN event service one calendar year
at a time and writes ``$FINSIGHT_DATA_DIR/geo/usgs_catalog.json``. USGS data is U.S. public
domain. The file records the exact queries and the retrieval time, because the catalog is
retrospective: re-fetching later can return revised magnitudes.

    python scripts/fetch_usgs_catalog.py --start 2018-01-01
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import json

import requests

from src.geo import usgs

ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query"
LIMIT = 20000


def fetch_year(year: int, end: date, min_magnitude: float) -> tuple[list[dict], str]:
    start = date(year, 1, 1)
    stop = min(date(year + 1, 1, 1), end)
    params = {"format": "geojson", "starttime": start.isoformat(), "endtime": stop.isoformat(),
              "minmagnitude": min_magnitude, "orderby": "time-asc", "limit": LIMIT}
    response = requests.get(ENDPOINT, params=params, timeout=120)
    response.raise_for_status()
    features = response.json().get("features", [])
    if len(features) >= LIMIT:
        raise SystemExit(f"{year}: hit the {LIMIT}-event limit; raise --min-magnitude")
    return features, response.url


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2018-01-01")
    parser.add_argument("--end", default=date.today().isoformat())
    parser.add_argument("--min-magnitude", type=float, default=4.5)
    args = parser.parse_args()
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    features, queries = [], []
    for year in range(start.year, end.year + 1):
        rows, url = fetch_year(year, end, args.min_magnitude)
        rows = [f for f in rows if f.get("properties", {}).get("time") is not None
                and datetime.fromtimestamp(f["properties"]["time"] / 1000, tz=timezone.utc).date() >= start]
        features.extend(rows)
        queries.append(url)
        print(year, len(rows), "events", flush=True)
    payload = usgs.build_catalog_payload(features, query=" ; ".join(queries),
                                         min_magnitude=args.min_magnitude)
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    catalog = usgs.parse_catalog(raw)
    path = usgs.catalog_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    print(f"Installed {len(catalog.events)} events at {path} (sha256 {catalog.sha256})")


if __name__ == "__main__":
    main()
