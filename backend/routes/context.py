"""External context routes used by the React terminal."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from fastapi import APIRouter, HTTPException, Query

from src import config

router = APIRouter(prefix="/context", tags=["context"])

_WEATHER_LABELS = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle",
    55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers",
    81: "Heavy showers", 82: "Violent showers", 95: "Thunderstorm",
    96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
}


def _get_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        response = requests.get(
            url, params=params, timeout=8,
            headers={"User-Agent": "FinSight-Alpha/0.1"},
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Unexpected response shape")
        return payload
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"External context API failed: {exc}") from exc


@router.get("/weather")
def weather(city: str = Query("Mumbai", min_length=2, max_length=80)) -> dict[str, Any]:
    """Current conditions for an operating/market city via Open-Meteo."""
    geo = _get_json(
        "https://geocoding-api.open-meteo.com/v1/search",
        {"name": city, "count": 1, "language": "en", "format": "json"},
    )
    results = geo.get("results") or []
    if not results:
        raise HTTPException(status_code=404, detail=f"No weather location found for '{city}'.")
    place = results[0]
    latitude = float(place["latitude"])
    longitude = float(place["longitude"])
    forecast = _get_json(
        "https://api.open-meteo.com/v1/forecast",
        {
            "latitude": latitude, "longitude": longitude,
            "current": "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
            "timezone": "auto",
        },
    )
    current = forecast.get("current") or {}
    code = int(current.get("weather_code", -1))
    precipitation = float(current.get("precipitation", 0) or 0)
    wind = float(current.get("wind_speed_10m", 0) or 0)
    risk = "elevated" if precipitation >= 5 or wind >= 45 or code >= 95 else "normal"
    return {
        "city": place.get("name", city), "region": place.get("admin1"),
        "country": place.get("country"), "latitude": latitude, "longitude": longitude,
        "temperature_c": current.get("temperature_2m"), "apparent_c": current.get("apparent_temperature"),
        "precipitation_mm": current.get("precipitation"), "wind_kph": current.get("wind_speed_10m"),
        "condition": _WEATHER_LABELS.get(code, "Unknown"), "is_day": bool(current.get("is_day", 1)),
        "operational_risk": risk, "observed_at": current.get("time"), "source": "Open-Meteo",
    }


def _dataset_root() -> Path:
    configured = os.getenv("KAGGLE_DATA_DIR")
    return Path(configured).expanduser() if configured else config.DATA_DIR / "kaggle"


@router.get("/datasets")
def datasets() -> dict[str, Any]:
    """Inventory research datasets downloaded into ``KAGGLE_DATA_DIR``."""
    root = _dataset_root()
    supported = {".csv", ".parquet", ".json", ".jsonl", ".feather"}
    items: list[dict[str, Any]] = []
    if root.exists():
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in supported:
                continue
            stat = path.stat()
            items.append({
                "name": path.name, "format": path.suffix.lower().lstrip("."),
                "size_mb": round(stat.st_size / 1_048_576, 2),
                "updated_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                "relative_path": str(path.relative_to(root)).replace("\\", "/"),
            })
            if len(items) >= 100:
                break
    return {
        "configured": root.exists(), "root": str(root), "count": len(items), "datasets": items,
        "message": ("Kaggle datasets are available for research." if items else
                    "Download Kaggle datasets into this folder, then refresh the terminal."),
    }


@router.get("/providers")
def providers() -> dict[str, Any]:
    """Report which live/data integrations can actually be used."""
    return {
        "market_data": {"provider": config.MARKET_DATA_PROVIDER, "configured": True},
        "finnhub": {"configured": bool(os.getenv("FINNHUB_API_KEY")), "purpose": "live quotes"},
        "polygon": {"configured": bool(os.getenv("POLYGON_API_KEY")), "purpose": "market data"},
        "alpha_vantage": {"configured": bool(os.getenv("ALPHA_VANTAGE_API_KEY")), "purpose": "market data"},
        "weather": {"configured": True, "provider": "Open-Meteo"},
        "kaggle": {"configured": _dataset_root().exists(), "purpose": "offline research datasets"},
    }
