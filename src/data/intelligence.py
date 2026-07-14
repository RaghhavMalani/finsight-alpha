"""Backend-only ingestion for evidence-backed agriculture and trade products.

Upstream failure is represented as ``UNAVAILABLE``. This module never
manufactures replacement observations or predictive-performance claims.
"""

from __future__ import annotations

import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import requests

AVAILABLE = "AVAILABLE"
PARTIAL = "PARTIAL"
UNAVAILABLE = "UNAVAILABLE"

COUNTRIES: dict[str, dict[str, Any]] = {
    "IND": {"name": "India", "latitude": 20.5937, "longitude": 78.9629, "bbox": [68.0, 6.0, 98.0, 36.0]},
    "USA": {"name": "United States", "latitude": 39.8283, "longitude": -98.5795, "bbox": [-125.0, 24.0, -66.0, 50.0]},
    "BRA": {"name": "Brazil", "latitude": -14.2350, "longitude": -51.9253, "bbox": [-74.0, -34.0, -34.0, 6.0]},
}

WORLD_BANK_LICENSE = {
    "name": "World Bank Open Data Terms of Use (CC BY 4.0 datasets unless noted)",
    "url": "https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets",
}
OPEN_METEO_LICENSE = {"name": "CC BY 4.0", "url": "https://open-meteo.com/en/licence"}
NASA_LICENSE = {
    "name": "NASA Earth Science data and imagery use policy",
    "url": "https://www.earthdata.nasa.gov/engage/open-data-services-and-software/data-and-information-policy",
}

_SATELLITE_CACHE: dict[tuple[str, str], tuple[bytes, dict[str, Any]]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _digest(payload: Any) -> str:
    raw = payload if isinstance(payload, bytes) else json.dumps(
        payload, sort_keys=True, separators=(",", ":"), default=str
    ).encode()
    return f"sha256:{hashlib.sha256(raw).hexdigest()}"


def _country(code: str) -> tuple[str, dict[str, Any]]:
    normalized = (code or "IND").strip().upper()
    if normalized not in COUNTRIES:
        raise ValueError(f"Unsupported country '{normalized}'. Choose from {', '.join(COUNTRIES)}.")
    return normalized, COUNTRIES[normalized]


def _quality(points: list[dict[str, Any]], retrieved_at: datetime) -> list[dict[str, str]]:
    dates = [str(point.get("date", "")) for point in points]
    values = [point.get("value") for point in points]
    finite = bool(values) and all(isinstance(v, (int, float)) and math.isfinite(v) for v in values)
    ordered = dates == sorted(dates) and len(dates) == len(set(dates))
    future = any(value > retrieved_at.date().isoformat() for value in dates if value)
    return [
        {"check": "non_empty_finite_values", "status": "PASS" if finite else "FAIL", "detail": f"{len(points)} observations"},
        {"check": "unique_monotonic_dates", "status": "PASS" if ordered else "FAIL", "detail": "Dates must be unique and increasing"},
        {"check": "no_future_observations", "status": "FAIL" if future else "PASS", "detail": "Observation date cannot exceed retrieval date"},
    ]


def _metadata(
    *, dataset_id: str, dataset_name: str, provider: str, source_url: str,
    license_: dict[str, str], payload: Any, as_of: str, retrieved_at: datetime,
    geography: dict[str, Any], frequency: str, evidence_type: str,
    transformation: str, points: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "dataset_id": dataset_id,
        "dataset_name": dataset_name,
        "provider": provider,
        "source_url": source_url,
        "license": license_,
        "customer_license_status": "UNVERIFIED",
        "version": _digest(payload),
        "as_of": as_of,
        "available_from": _iso(retrieved_at),
        "retrieved_at": _iso(retrieved_at),
        "geography": geography,
        "frequency": frequency,
        "evidence_type": evidence_type,
        "availability_note": "The upstream API does not publish a vintage timestamp; retrieval time is the conservative availability boundary.",
        "lineage": [
            {"step": "source", "system": provider, "dataset": dataset_id},
            {"step": "ingest", "system": "FinSight backend", "operation": "validated HTTP fetch"},
            {"step": "transform", "system": "FinSight backend", "operation": transformation},
        ],
        "quality_checks": _quality(points or [], retrieved_at) if points is not None else [],
    }


def _unavailable(name: str, reason: str, geography: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": UNAVAILABLE, "name": name, "reason": reason, "points": [],
        "metadata": {
            "dataset_id": UNAVAILABLE, "dataset_name": name, "provider": UNAVAILABLE,
            "source_url": None, "license": {"name": UNAVAILABLE, "url": None}, "customer_license_status": "UNVERIFIED",
            "version": UNAVAILABLE, "as_of": None, "available_from": None,
            "retrieved_at": _iso(_now()), "geography": geography,
            "frequency": UNAVAILABLE, "evidence_type": UNAVAILABLE,
            "lineage": [], "quality_checks": [],
        },
    }


def _world_bank_series(
    country_code: str, country: dict[str, Any], indicator: str, name: str, unit: str,
) -> dict[str, Any]:
    retrieved_at = _now()
    source_url = f"https://api.worldbank.org/v2/country/{country_code}/indicator/{indicator}"
    try:
        response = requests.get(source_url, params={"format": "json", "per_page": 80}, timeout=8,
                                headers={"User-Agent": "FinSight-Alpha/0.2 evidence-ingestion"})
        response.raise_for_status()
        payload = response.json()
        rows = payload[1] if isinstance(payload, list) and len(payload) > 1 else []
        points = sorted(
            [{"date": f"{row['date']}-12-31", "value": float(row["value"])}
             for row in rows if row.get("date") and row.get("value") is not None],
            key=lambda point: point["date"],
        )
        if not points or any(check["status"] == "FAIL" for check in _quality(points, retrieved_at)):
            raise ValueError("response contained no valid ordered observations")
        geography = {"country_code": country_code, "country": country["name"], "coverage": "national"}
        metadata = _metadata(
            dataset_id=f"world-bank:{indicator}", dataset_name=name,
            provider="World Bank Indicators API",
            source_url=f"{source_url}?{urlencode({'format': 'json', 'per_page': 80})}",
            license_=WORLD_BANK_LICENSE, payload=payload, as_of=points[-1]["date"],
            retrieved_at=retrieved_at, geography=geography, frequency="annual",
            evidence_type="reported statistical series",
            transformation="Removed nulls, converted values to numeric, and sorted by reported year; no imputation.",
            points=points,
        )
        return {"status": AVAILABLE, "name": name, "unit": unit, "points": points, "metadata": metadata}
    except (requests.RequestException, ValueError, TypeError, KeyError, IndexError) as exc:
        return _unavailable(name, f"World Bank ingestion failed: {exc}", {"country_code": country_code, "country": country["name"]})


def _weather_series(country_code: str, country: dict[str, Any]) -> dict[str, Any]:
    retrieved_at = _now()
    end = retrieved_at.date() - timedelta(days=7)
    start = end - timedelta(days=89)
    source_url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": country["latitude"], "longitude": country["longitude"],
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": "precipitation_sum,temperature_2m_mean,et0_fao_evapotranspiration",
        "models": "era5", "timezone": "UTC",
    }
    try:
        response = requests.get(source_url, params=params, timeout=10,
                                headers={"User-Agent": "FinSight-Alpha/0.2 evidence-ingestion"})
        response.raise_for_status()
        payload = response.json()
        daily = payload.get("daily") or {}
        dates, rain = daily.get("time") or [], daily.get("precipitation_sum") or []
        temp, et0 = daily.get("temperature_2m_mean") or [], daily.get("et0_fao_evapotranspiration") or []
        if not dates or not (len(dates) == len(rain) == len(temp) == len(et0)):
            raise ValueError("unexpected ERA5 response shape")
        points = [
            {"date": str(day), "precipitation_mm": float(rain[i]),
             "temperature_c": float(temp[i]), "et0_mm": float(et0[i]), "value": float(rain[i])}
            for i, day in enumerate(dates)
            if rain[i] is not None and temp[i] is not None and et0[i] is not None
        ]
        if not points or any(check["status"] == "FAIL" for check in _quality(points, retrieved_at)):
            raise ValueError("ERA5 response failed quality checks")
        geography = {
            "country_code": country_code, "country": country["name"],
            "coverage": "national-centroid grid cell, not a national aggregate",
            "latitude": country["latitude"], "longitude": country["longitude"],
            "nominal_resolution": "0.25 degree (~25 km)",
        }
        return {
            "status": AVAILABLE, "name": "Agricultural weather and rainfall",
            "unit": "mm/day rainfall", "points": points,
            "metadata": _metadata(
                dataset_id="open-meteo:era5:daily",
                dataset_name="ERA5 daily agricultural weather",
                provider="Open-Meteo (ERA5 reanalysis)",
                source_url=f"{source_url}?{urlencode(params)}", license_=OPEN_METEO_LICENSE,
                payload=payload, as_of=points[-1]["date"], retrieved_at=retrieved_at,
                geography=geography, frequency="daily",
                evidence_type="modeled reanalysis; not a station measurement",
                transformation="Selected the country-centroid grid cell and retained rainfall, mean temperature, and FAO-56 ET0; no imputation.",
                points=points,
            ),
        }
    except (requests.RequestException, ValueError, TypeError, KeyError, IndexError) as exc:
        return _unavailable("Agricultural weather and rainfall", f"ERA5 ingestion failed: {exc}",
                            {"country_code": country_code, "country": country["name"]})


def _satellite(country_code: str, country: dict[str, Any], requested_date: date | None = None) -> dict[str, Any]:
    retrieved_at = _now()
    imagery_date = requested_date or (retrieved_at.date() - timedelta(days=3))
    date_string = imagery_date.isoformat()
    cache_key = (country_code, date_string)
    if cache_key in _SATELLITE_CACHE:
        image, metadata = _SATELLITE_CACHE[cache_key]
        return {"status": AVAILABLE, "name": "MODIS Terra corrected-reflectance imagery",
                "image_path": f"/intelligence/agriculture/satellite?country={country_code}&as_of={date_string}",
                "metadata": metadata, "_image": image}

    source_url = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
    params = {
        "SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.1.1",
        "LAYERS": "MODIS_Terra_CorrectedReflectance_TrueColor", "STYLES": "",
        "FORMAT": "image/jpeg", "TRANSPARENT": "FALSE", "HEIGHT": 512, "WIDTH": 768,
        "SRS": "EPSG:4326", "BBOX": ",".join(str(value) for value in country["bbox"]),
        "TIME": date_string,
    }
    try:
        response = requests.get(source_url, params=params, timeout=10,
                                headers={"User-Agent": "FinSight-Alpha/0.2 evidence-ingestion"})
        response.raise_for_status()
        image = response.content
        content_type = response.headers.get("content-type", "").lower()
        if "image" not in content_type or len(image) < 5_000:
            raise ValueError("NASA GIBS did not return a non-empty image")
        geography = {"country_code": country_code, "country": country["name"],
                     "coverage": "bounding box", "bbox_wgs84": country["bbox"]}
        metadata = _metadata(
            dataset_id="nasa-gibs:MODIS_Terra_CorrectedReflectance_TrueColor",
            dataset_name="MODIS Terra corrected-reflectance true-color imagery",
            provider="NASA Global Imagery Browse Services (GIBS)",
            source_url=f"{source_url}?{urlencode(params)}", license_=NASA_LICENSE,
            payload=image, as_of=date_string, retrieved_at=retrieved_at, geography=geography,
            frequency="daily when an eligible swath is available",
            evidence_type="satellite imagery; visual context, not a derived vegetation metric",
            transformation="NASA GIBS WMS country bounding-box render; pixels are not interpreted or scored by FinSight.",
        )
        metadata["quality_checks"] = [
            {"check": "image_content_type", "status": "PASS", "detail": content_type},
            {"check": "minimum_payload_size", "status": "PASS", "detail": f"{len(image)} bytes"},
        ]
        _SATELLITE_CACHE[cache_key] = (image, metadata)
        return {"status": AVAILABLE, "name": "MODIS Terra corrected-reflectance imagery",
                "image_path": f"/intelligence/agriculture/satellite?country={country_code}&as_of={date_string}",
                "metadata": metadata, "_image": image}
    except (requests.RequestException, ValueError) as exc:
        return _unavailable("MODIS Terra corrected-reflectance imagery",
                            f"NASA GIBS ingestion failed for {date_string}: {exc}",
                            {"country_code": country_code, "country": country["name"], "bbox_wgs84": country["bbox"]})


def agriculture_intelligence(country_code: str = "IND") -> dict[str, Any]:
    code, country = _country(country_code)
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [
            executor.submit(_weather_series, code, country),
            executor.submit(_world_bank_series, code, country, "AG.YLD.CREL.KG", "Cereal yield", "kg/hectare"),
            executor.submit(_world_bank_series, code, country, "AG.PRD.CREL.MT", "Cereal production", "metric tons"),
            executor.submit(_satellite, code, country),
        ]
        weather, crop_yield, production, satellite = [future.result() for future in futures]
    satellite.pop("_image", None)
    products = [weather, crop_yield, production, satellite]
    count = sum(item["status"] == AVAILABLE for item in products)
    status = AVAILABLE if count == len(products) else PARTIAL if count else UNAVAILABLE
    return {
        "status": status, "product": "Agriculture Intelligence", "generated_at": _iso(_now()),
        "geography": {"country_code": code, "country": country["name"]},
        "weather": weather, "crop_yield": crop_yield, "production": production,
        "satellite": satellite, "performance_claims": UNAVAILABLE,
        "performance_note": "No predictive-performance claim is shown until a versioned feature set, target, availability calendar, and out-of-sample validation run are registered.",
    }


TRADE_INDICATORS = [
    ("NY.GDP.MKTP.KD.ZG", "Real GDP growth", "% annual"),
    ("NE.TRD.GNFS.ZS", "Trade openness", "% of GDP"),
    ("NE.EXP.GNFS.CD", "Exports of goods and services", "current US$"),
    ("NE.IMP.GNFS.CD", "Imports of goods and services", "current US$"),
]


def trade_intelligence(country_code: str = "IND") -> dict[str, Any]:
    code, country = _country(country_code)
    with ThreadPoolExecutor(max_workers=len(TRADE_INDICATORS)) as executor:
        series = [future.result() for future in [
            executor.submit(_world_bank_series, code, country, indicator, name, unit)
            for indicator, name, unit in TRADE_INDICATORS
        ]]
    count = sum(item["status"] == AVAILABLE for item in series)
    status = AVAILABLE if count == len(series) else PARTIAL if count else UNAVAILABLE
    return {
        "status": status, "product": "Trade & Country Growth Pulse", "generated_at": _iso(_now()),
        "geography": {"country_code": code, "country": country["name"]}, "series": series,
        "performance_claims": UNAVAILABLE,
        "performance_note": "These are descriptive country indicators. No security-return correlation, lead, hit rate, or forecast skill is asserted.",
    }


def satellite_image(country_code: str, as_of: str) -> tuple[bytes, dict[str, Any]]:
    code, country = _country(country_code)
    try:
        requested = date.fromisoformat(as_of)
    except ValueError as exc:
        raise ValueError("as_of must be an ISO date") from exc
    result = _satellite(code, country, requested)
    image = result.get("_image")
    if result["status"] != AVAILABLE or not isinstance(image, bytes):
        raise RuntimeError(result.get("reason") or "Satellite imagery unavailable")
    return image, result["metadata"]
