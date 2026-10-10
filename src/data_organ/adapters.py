"""Bounded captures; existing scientific providers keep their clock semantics."""

import json
from datetime import date, datetime, timedelta
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from src.data.license_policy import derived_publication_license
from src.regime_intelligence.french import parse_zip
from src.regime_intelligence.providers import alfred_observations

from .contracts import Capture
from .service import now


def fetch(url, *, params=None, body=None):
    # Never log exception URLs: FRED credentials occur in its query string.
    try:
        response = (
            requests.post(url, json=body, timeout=(10, 35))
            if body is not None
            else requests.get(url, params=params, timeout=(10, 35))
        )
    except requests.RequestException as error:
        raise ValueError(
            "Provider transport unavailable: " + type(error).__name__
        ) from None
    if response.status_code != 200:
        raise ValueError("Provider unavailable: HTTP " + str(response.status_code))
    if len(response.content) > 32 * 1024 * 1024:
        raise ValueError("Provider capture exceeds 32 MiB bound")
    clock = now()
    directory = (
        Path(__file__).resolve().parents[2]
        / "data/exports/replay-source/data-organ-runtime/network-captures"
    )
    directory.mkdir(parents=True, exist_ok=True)
    identity = sha256(response.content).hexdigest()
    (directory / (identity + ".bin")).write_bytes(response.content)
    (directory / (identity + ".meta.json")).write_text(
        json.dumps(
            {
                "source_url": url,
                "captured_at": clock,
                "sha256": identity,
                "parameters": {
                    k: v for k, v in (params or {}).items() if k != "api_key"
                },
                "body": body,
            },
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    return response.content, clock


def capture(
    source,
    url,
    raw,
    captured_at,
    *,
    schema,
    quality,
    calendar=None,
    unit="proportional_return",
    definition="market factor excess return; not a ticker",
    feed="RESEARCH_FACTOR",
    basis="NOT_APPLICABLE",
    licence=None,
):
    return Capture(
        source,
        url,
        sha256(raw).hexdigest(),
        captured_at,
        schema,
        licence if licence is not None else derived_publication_license(source, None),
        quality,
        calendar or {"status": "NOT_APPLICABLE"},
        definition,
        unit,
        feed,
        basis,
        {
            "adapter_version": "data-organ-adapters/1",
            "cadence": "DAILY"
            if feed == "RESEARCH_FACTOR"
            else "MONTHLY"
            if feed == "BLS_U3"
            else "OPERATOR_IMPORT",
            "field_schema_units": {k: unit for k in schema},
            "availability_rule": quality,
            "source_convention": "UTC observation day for factor/macro period; original provider availability rule retained",
        },
    )


def factors(directory, country, *, network=False):
    from importlib.metadata import version

    from src.replay.factors import SOURCE_URLS

    names = (
        [("french-ff3.zip", "FF3"), ("french-mom.zip", "MOM")]
        if country == "US"
        else [("iima-daily.csv", None)]
    )
    for name, family in names:
        url = SOURCE_URLS[name]
        if network:
            raw, clock = fetch(url)
            meta = {
                "sha256": sha256(raw).hexdigest(),
                "source_url": url,
                "captured_at": clock,
            }
        else:
            raw = (Path(directory) / name).read_bytes()
            meta = json.loads((Path(directory) / (name + ".meta.json")).read_bytes())
        if meta["sha256"] != sha256(raw).hexdigest() or meta["source_url"] != url:
            raise ValueError("Factor capture bytes/URL changed")
        if country == "US":
            releases = parse_zip(
                raw,
                family=family,
                source_url=url,
                captured_at=meta["captured_at"],
                available_at=datetime.fromisoformat(
                    meta["captured_at"].replace("Z", "+00:00")
                ),
                release_identity="capture:" + meta["sha256"],
                quality="CAPTURE_ONLY",
                start=date(1926, 1, 1),
            )
            rows = []
            for r in releases:
                if r.frequency == "daily":
                    session = (
                        r.observed_at.astimezone(ZoneInfo("America/New_York")).date()
                        - timedelta(days=1)
                    ).isoformat()
                    rows.extend(
                        {
                            "asset": "US-MKT",
                            "field": k.lower(),
                            "value": v,
                            "observed_at": session + "T00:00:00Z",
                            "available_at": meta["captured_at"],
                        }
                        for k, v in r.values.items()
                    )
            schema = {k: "float" for r in rows for k in [r["field"]]}
            cal = {
                "mic": "XNYS",
                "version": version("exchange-calendars"),
                "status": "PACKAGE_EVIDENCE",
                "source_url": "https://github.com/gerrymanoim/exchange_calendars",
                "meaning": "Calendar package evidence; not an exchange publication receipt",
            }
            source = "ken-french:daily-factors"
        else:
            frame = pd.read_csv(BytesIO(raw))
            if list(frame.columns) != ["Date", "SMB", "HML", "WML", "MF", "RF"]:
                raise ValueError("Unknown IIMA captured schema")
            schema = {
                "mkt": "float",
                "smb": "float",
                "hml": "float",
                "mom": "float",
                "rf": "float",
            }
            rows = []
            for r in frame.to_dict("records"):
                for k, column in [
                    ("MKT", "MF"),
                    ("SMB", "SMB"),
                    ("HML", "HML"),
                    ("MOM", "WML"),
                    ("RF", "RF"),
                ]:
                    rows.append(
                        {
                            "asset": "IN-MKT",
                            "field": k.lower(),
                            "value": float(r[column]) / 100,
                            "observed_at": r["Date"] + "T00:00:00Z",
                            "available_at": meta["captured_at"],
                        }
                    )
            cal = {
                "mic": "XNSE",
                "status": "UNAVAILABLE",
                "reason": "No official session manifest evidenced for the selected 2024-2025 window; XBOM/weekday substitution forbidden",
            }
            source = "iima:daily-factors"
        yield (
            capture(
                source,
                url,
                raw,
                meta["captured_at"],
                schema=schema,
                quality="CAPTURE_ONLY",
                calendar=cal,
            ),
            raw,
            rows,
        )


def alfred(key, *, start="2020-01-01", end="2025-12-31"):
    if not key:
        raise ValueError("UNAVAILABLE: FRED_API_KEY is not configured")
    if start < "2020-01-01" or end > "2025-12-31" or start > end:
        raise ValueError("UNRATE v0.1 capture window is bounded to 2020-2025")
    url = "https://api.stlouisfed.org/fred/series/observations"
    raw, clock = fetch(
        url,
        params={
            "api_key": key,
            "file_type": "json",
            "series_id": "UNRATE",
            "realtime_start": "1776-07-04",
            "realtime_end": now()[:10],
            "observation_start": start,
            "observation_end": end,
            "output_type": 1,
            "limit": 100000,
        },
    )
    payload = json.loads(raw)
    observations = alfred_observations(
        payload,
        series="UNRATE",
        direction="neutral",
        source_as_of=clock,
        reference="Data Organ source bytes " + sha256(raw).hexdigest(),
    )
    rows = [
        {
            "asset": "UNRATE",
            "field": "unemployment_rate",
            "value": r.values["value"],
            "observed_at": r.observed_at.isoformat(),
            "available_at": r.available_at.isoformat(),
            "revision": r.revision,
        }
        for r in observations
    ]
    return (
        capture(
            "alfred:UNRATE",
            "https://alfred.stlouisfed.org/series?seid=UNRATE",
            raw,
            clock,
            schema={"unemployment_rate": "float"},
            quality="CONSERVATIVE_VINTAGE_DAY",
            unit="percent",
            definition="BLS U3 LNS14000000; monthly seasonally adjusted unemployment rate",
            feed="BLS_U3",
        ),
        raw,
        rows,
    )


def bls():
    url = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
    raw, clock = fetch(
        url, body={"seriesid": ["LNS14000000"], "startyear": "2020", "endyear": "2025"}
    )
    payload = json.loads(raw)
    if (
        payload.get("status") != "REQUEST_SUCCEEDED"
        or len(payload.get("Results", {}).get("series", [])) != 1
    ):
        raise ValueError("BLS request unsuccessful/incomplete")
    series = payload["Results"]["series"][0]
    if series["seriesID"] != "LNS14000000":
        raise ValueError("BLS series substitution")
    rows = [
        {
            "asset": "UNRATE",
            "field": "unemployment_rate",
            "value": float(r["value"]) if r["value"] not in {"-", "."} else r["value"],
            "observed_at": r["year"] + "-" + r["period"][1:] + "-01T00:00:00Z",
            "available_at": clock,
        }
        for r in series["data"]
        if r["period"].startswith("M") and "01" <= r["period"][1:] <= "12"
    ]
    return (
        capture(
            "bls:LNS14000000",
            url,
            raw,
            clock,
            schema={"unemployment_rate": "float"},
            quality="CAPTURE_ONLY",
            unit="percent",
            definition="BLS U3 LNS14000000; monthly seasonally adjusted unemployment rate",
            feed="BLS_U3",
        ),
        raw,
        rows,
    )


def alpaca(dataset, raw, captured_at, source_url, *, asset):
    # Existing loader owns bar completion + 900s and IEX scope; never relabel it.
    rows = [
        {
            "asset": asset,
            "field": "market_close",
            "value": r.values["close"],
            "observed_at": r.observed_at.isoformat(),
            "available_at": r.available_at.isoformat(),
            "revision": r.revision,
        }
        for r in dataset
        if r.quality == "CONSERVATIVE_MARKET_TIME"
    ]
    return (
        capture(
            "alpaca:iex",
            source_url,
            raw,
            captured_at,
            schema={"market_close": "float"},
            quality="CONSERVATIVE_MARKET_TIME",
            unit="USD",
            definition="IEX bar close",
            feed="IEX_ONLY",
            basis="UNADJUSTED",
        ),
        raw,
        rows,
    )


def market_provider(
    frame,
    raw,
    captured_at,
    *,
    source,
    source_url,
    asset,
    calendar,
    price_basis,
    cleaning_stage="CAPTURED_INPUT",
    date_only_utc_period=False,
):
    from dataclasses import replace

    from .diagnostics import market_anomalies

    def observation_clock(value):
        clock = pd.Timestamp(value)
        if clock.tzinfo is None:
            if not date_only_utc_period or clock != clock.normalize():
                raise ValueError(
                    "Naive market clock requires the explicit UTC date-only period convention"
                )
            clock = clock.tz_localize("UTC")
        return clock.isoformat()

    rows = [
        {
            "asset": asset,
            "field": "market_close",
            "value": r["Close"],
            "observed_at": observation_clock(r["Date"]),
            "available_at": captured_at,
        }
        for r in frame.to_dict("records")
    ]
    cap = capture(
        source,
        source_url,
        raw,
        captured_at,
        schema={"market_close": "float"},
        quality="CAPTURE_ONLY",
        calendar=calendar,
        unit="INR" if asset.endswith(".NS") else "USD",
        definition="EOD close",
        feed="EXCHANGE_EOD",
        basis=price_basis,
    )
    anomalies = market_anomalies(frame, price_basis=price_basis)
    anomalies["cleaning_stage"] = cleaning_stage
    cap = replace(
        cap,
        metadata={
            **cap.metadata,
            "cleaning_stage": cleaning_stage,
            "source_convention": "UTC date-only observation period"
            if date_only_utc_period
            else "Caller-supplied timezone-aware observation clock",
            "market_anomalies": anomalies,
        },
    )
    return cap, raw, rows
