"""Country macro profiles and explainable cross-market relay graphs.

World Bank Indicators are deliberately used as a slow-moving structural layer,
not mislabeled as live economic data.  Each observation retains its date and
source.  The relay engine compares the latest reading with that country's own
history, then maps standardized pressure into transparent market factors.
"""

from __future__ import annotations

import math
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import requests

from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

WORLD_BANK = "https://api.worldbank.org/v2"
_TTL = 6 * 60 * 60
_lock = threading.Lock()
_cache: dict[tuple[str, str], tuple[float, list[dict[str, Any]]]] = {}

INDICATORS: dict[str, dict[str, Any]] = {
    "NY.GDP.MKTP.KD.ZG": {
        "key": "gdp_growth",
        "label": "Real GDP growth",
        "unit": "%",
        "links": {"growth": 1.0, "equity": 0.55, "credit": -0.35},
    },
    "FP.CPI.TOTL.ZG": {
        "key": "inflation",
        "label": "CPI inflation",
        "unit": "%",
        "links": {"inflation": 1.0, "rates": 0.75, "equity": -0.30, "fx": 0.15},
    },
    "SL.UEM.TOTL.ZS": {
        "key": "unemployment",
        "label": "Unemployment",
        "unit": "%",
        "links": {"growth": -0.75, "equity": -0.35, "credit": 0.45},
    },
    "BN.CAB.XOKA.GD.ZS": {
        "key": "current_account",
        "label": "Current account / GDP",
        "unit": "% GDP",
        "links": {"fx": 0.70, "external_balance": 0.80},
    },
    "GC.DOD.TOTL.GD.ZS": {
        "key": "government_debt",
        "label": "Government debt / GDP",
        "unit": "% GDP",
        "links": {"sovereign_risk": 0.75, "rates": 0.35, "fx": -0.25},
    },
    "FR.INR.RINR": {
        "key": "real_rate",
        "label": "Real interest rate",
        "unit": "%",
        "links": {"rates": 0.80, "equity": -0.35, "fx": 0.35},
    },
    "NE.TRD.GNFS.ZS": {
        "key": "trade_openness",
        "label": "Trade / GDP",
        "unit": "% GDP",
        "links": {"external_sensitivity": 0.80, "growth": 0.20},
    },
    "NY.GDP.PCAP.CD": {
        "key": "gdp_per_capita",
        "label": "GDP per capita",
        "unit": "USD",
        "links": {"structural_growth": 0.40},
    },
}

COUNTRY_MARKETS = {
    "USA": {
        "name": "United States",
        "equity": "^GSPC",
        "currency": "DXY",
        "rates": "^TNX",
    },
    "IND": {
        "name": "India",
        "equity": "^NSEI",
        "currency": "USDINR=X",
        "rates": "IN10Y",
    },
    "GBR": {
        "name": "United Kingdom",
        "equity": "^FTSE",
        "currency": "GBPUSD=X",
        "rates": "GB10Y",
    },
    "DEU": {
        "name": "Germany",
        "equity": "^GDAXI",
        "currency": "EURUSD=X",
        "rates": "DE10Y",
    },
    "JPN": {"name": "Japan", "equity": "^N225", "currency": "JPY=X", "rates": "JP10Y"},
    "CHN": {
        "name": "China",
        "equity": "000001.SS",
        "currency": "CNY=X",
        "rates": "CN10Y",
    },
    "BRA": {"name": "Brazil", "equity": "^BVSP", "currency": "BRL=X", "rates": "BR10Y"},
    "CAN": {
        "name": "Canada",
        "equity": "^GSPTSE",
        "currency": "CAD=X",
        "rates": "CA10Y",
    },
    "AUS": {
        "name": "Australia",
        "equity": "^AXJO",
        "currency": "AUDUSD=X",
        "rates": "AU10Y",
    },
    "KOR": {
        "name": "South Korea",
        "equity": "^KS11",
        "currency": "KRW=X",
        "rates": "KR10Y",
    },
    "SGP": {
        "name": "Singapore",
        "equity": "^STI",
        "currency": "SGD=X",
        "rates": "SG10Y",
    },
    "ZAF": {
        "name": "South Africa",
        "equity": "^J203.JO",
        "currency": "ZAR=X",
        "rates": "ZA10Y",
    },
}


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _fetch_indicator(country: str, code: str, years: int) -> list[dict[str, Any]]:
    key = (country, code)
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < _TTL:
            return list(hit[1])
    response = requests.get(
        f"{WORLD_BANK}/country/{country}/indicator/{code}",
        params={
            "format": "json",
            "per_page": max(60, years + 5),
            "mrv": years,
            "gapfill": "Y",
        },
        timeout=12,
        headers={"User-Agent": "FinSight-Alpha/1.0"},
    )
    response.raise_for_status()
    payload = response.json()
    raw = (
        payload[1]
        if isinstance(payload, list) and len(payload) > 1 and payload[1]
        else []
    )
    observations = [
        {
            "date": str(row.get("date")),
            "value": _finite(row.get("value")),
            "country": row.get("country", {}).get("value"),
        }
        for row in raw
        if _finite(row.get("value")) is not None
    ]
    observations.sort(key=lambda row: row["date"])
    with _lock:
        _cache[key] = (now, observations)
    return list(observations)


def _signal(series: list[dict[str, Any]]) -> dict[str, Any]:
    if not series:
        return {
            "latest": None,
            "date": None,
            "change": None,
            "z_score": None,
            "percentile": None,
            "trend": "NO_DATA",
        }
    values = [float(row["value"]) for row in series if row.get("value") is not None]
    latest = values[-1]
    change = latest - values[-2] if len(values) > 1 else None
    baseline = values[:-1][-10:] or values
    mean = statistics.fmean(baseline)
    std = statistics.stdev(baseline) if len(baseline) > 1 else 0.0
    z = (latest - mean) / std if std > 1e-12 else 0.0
    percentile = sum(value <= latest for value in values) / len(values)
    trend = (
        "RISING"
        if change is not None and change > 0
        else "FALLING" if change is not None and change < 0 else "FLAT"
    )
    return {
        "latest": latest,
        "date": series[-1]["date"],
        "change": change,
        "z_score": z,
        "percentile": percentile,
        "trend": trend,
    }


def country_profile(country: str, years: int = 15) -> dict[str, Any]:
    iso = country.strip().upper()
    indicators = []
    failures = []

    def load_indicator(item: tuple[str, dict[str, Any]]) -> dict[str, Any]:
        code, meta = item
        try:
            series = _fetch_indicator(iso, code, years)
            return {
                "ok": True,
                "value": {
                    "code": code,
                    **meta,
                    "signal": _signal(series),
                    "series": series,
                },
            }
        except Exception as exc:
            logger.warning("World Bank %s/%s unavailable: %s", iso, code, exc)
            return {"ok": False, "value": {"code": code, "error": str(exc)}}

    with ThreadPoolExecutor(max_workers=min(4, len(INDICATORS))) as executor:
        for result in executor.map(load_indicator, INDICATORS.items()):
            (indicators if result["ok"] else failures).append(result["value"])
    market = COUNTRY_MARKETS.get(
        iso, {"name": iso, "equity": None, "currency": None, "rates": None}
    )
    latest_dates = [
        row["signal"]["date"] for row in indicators if row["signal"]["date"]
    ]
    return {
        "country": iso,
        "name": market["name"],
        "market_proxies": {
            key: value for key, value in market.items() if key != "name"
        },
        "source": "WORLD_BANK_INDICATORS_V2",
        "frequency_note": "Annual structural indicators; dates and lags vary by country and series.",
        "latest_observation": max(latest_dates) if latest_dates else None,
        "indicators": indicators,
        "failures": failures,
    }


def _similarity(left: dict[str, float], right: dict[str, float]) -> float | None:
    keys = sorted(set(left).intersection(right))
    if len(keys) < 3:
        return None
    distance = math.sqrt(sum((left[key] - right[key]) ** 2 for key in keys) / len(keys))
    return 1 / (1 + distance)


def macro_relay(countries: list[str], years: int = 15) -> dict[str, Any]:
    profiles = [country_profile(country, years) for country in countries]
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    vectors: dict[str, dict[str, float]] = {}
    country_impulses: dict[str, dict[str, float]] = {}

    for profile in profiles:
        iso = profile["country"]
        nodes.append(
            {"id": f"country:{iso}", "type": "COUNTRY", "label": profile["name"]}
        )
        vectors[iso] = {}
        impulses: dict[str, float] = {}
        for indicator in profile["indicators"]:
            signal = indicator["signal"]
            z = signal.get("z_score")
            if z is None:
                continue
            clipped = max(-3.0, min(3.0, float(z)))
            vectors[iso][indicator["key"]] = clipped
            indicator_id = f"indicator:{iso}:{indicator['key']}"
            nodes.append(
                {
                    "id": indicator_id,
                    "type": "INDICATOR",
                    "label": indicator["label"],
                    "country": iso,
                    "value": signal["latest"],
                    "date": signal["date"],
                    "z_score": clipped,
                }
            )
            edges.append(
                {
                    "source": f"country:{iso}",
                    "target": indicator_id,
                    "kind": "OBSERVES",
                    "weight": abs(clipped),
                }
            )
            for factor, weight in indicator["links"].items():
                effect = clipped * float(weight)
                impulses[factor] = impulses.get(factor, 0.0) + effect
                factor_id = f"factor:{factor}"
                if not any(node["id"] == factor_id for node in nodes):
                    nodes.append(
                        {
                            "id": factor_id,
                            "type": "FACTOR",
                            "label": factor.replace("_", " ").title(),
                        }
                    )
                edges.append(
                    {
                        "source": indicator_id,
                        "target": factor_id,
                        "kind": "MACRO_RELAY",
                        "weight": effect,
                        "direction": "POSITIVE" if effect >= 0 else "NEGATIVE",
                    }
                )
        country_impulses[iso] = {
            key: value / max(1, len(profile["indicators"]))
            for key, value in impulses.items()
        }
        for proxy_type, symbol in profile["market_proxies"].items():
            if not symbol:
                continue
            market_id = f"market:{symbol}"
            nodes.append(
                {
                    "id": market_id,
                    "type": "MARKET",
                    "label": symbol,
                    "country": iso,
                    "proxy_type": proxy_type,
                }
            )
            linked_factor = (
                "equity"
                if proxy_type == "equity"
                else "fx" if proxy_type == "currency" else "rates"
            )
            edges.append(
                {
                    "source": f"factor:{linked_factor}",
                    "target": market_id,
                    "kind": "MARKET_PROXY",
                    "weight": country_impulses[iso].get(linked_factor, 0.0),
                }
            )

    similarities = []
    for index, left in enumerate(profiles):
        for right in profiles[index + 1 :]:
            score = _similarity(vectors[left["country"]], vectors[right["country"]])
            if score is not None:
                similarities.append(
                    {
                        "left": left["country"],
                        "right": right["country"],
                        "similarity": score,
                    }
                )
                edges.append(
                    {
                        "source": f"country:{left['country']}",
                        "target": f"country:{right['country']}",
                        "kind": "MACRO_SIMILARITY",
                        "weight": score,
                    }
                )

    ranked = []
    for iso, impulses in country_impulses.items():
        for factor, value in impulses.items():
            ranked.append(
                {
                    "country": iso,
                    "factor": factor,
                    "impulse": value,
                    "direction": "UP" if value > 0 else "DOWN",
                }
            )
    ranked.sort(key=lambda row: abs(row["impulse"]), reverse=True)
    narratives = [
        f"{row['country']} {row['factor'].replace('_', ' ')} pressure is {row['direction'].lower()} ({row['impulse']:+.2f} standardized relay)."
        for row in ranked[:8]
    ]
    return {
        "countries": [profile["country"] for profile in profiles],
        "profiles": profiles,
        "factor_impulses": country_impulses,
        "similarities": similarities,
        "graph": {"nodes": nodes, "edges": edges},
        "narratives": narratives,
        "methodology": "Latest annual reading standardized against up to ten prior observations, then passed through disclosed directional factor weights.",
    }
