"""Narrow agriculture and trade/country intelligence products."""

from __future__ import annotations

import os
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from typing import Any

from .snapshots import ExternalJsonClient, ProviderUnavailable, SourceLineage


MANDI_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"
MANDI_SOURCE_URL = f"https://api.data.gov.in/resource/{MANDI_RESOURCE_ID}"
FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations"
WTO_DATA_URL = "https://api.wto.org/timeseries/v1/data"
COMTRADE_DATA_URL = "https://comtradeapi.un.org/data/v1/get/C/A/HS"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


COUNTRIES: dict[str, dict[str, Any]] = {
    "IND": {
        "name": "India",
        "wto_reporter_code": "356",
        "comtrade_reporter_code": 699,
        "fred": [
            {
                "id": "real_gdp_growth",
                "series_id": "INDGDPRQPSMEI",
                "label": "Real GDP growth",
                "units": "pc1",
                "unit": "% YoY",
                "frequency": "quarterly",
            },
            {
                "id": "industrial_production_growth",
                "series_id": "INDPROINDMISMEI",
                "label": "Industrial production growth",
                "units": "pc1",
                "unit": "% YoY",
                "frequency": "monthly",
            },
            {
                "id": "consumer_inflation",
                "series_id": "FPCPITOTLZGIND",
                "label": "Consumer inflation",
                "units": "lin",
                "unit": "% YoY",
                "frequency": "annual",
            },
        ],
    },
    "USA": {
        "name": "United States",
        "wto_reporter_code": "840",
        "comtrade_reporter_code": 842,
        "fred": [
            {
                "id": "real_gdp_growth",
                "series_id": "GDPC1",
                "label": "Real GDP growth",
                "units": "pc1",
                "unit": "% YoY",
                "frequency": "quarterly",
            },
            {
                "id": "industrial_production_growth",
                "series_id": "INDPRO",
                "label": "Industrial production growth",
                "units": "pc1",
                "unit": "% YoY",
                "frequency": "monthly",
            },
            {
                "id": "consumer_inflation",
                "series_id": "CPIAUCSL",
                "label": "Consumer inflation",
                "units": "pc1",
                "unit": "% YoY",
                "frequency": "monthly",
            },
        ],
    },
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _float(value: Any) -> float | None:
    try:
        if value in (None, "", "."):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_date(value: Any) -> date | None:
    text = str(value or "").strip()
    for pattern in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y%m%d"):
        try:
            return datetime.strptime(text[:10], pattern).date()
        except ValueError:
            continue
    return None


def _lineage(items: list[SourceLineage]) -> list[dict[str, Any]]:
    return [item.to_dict() for item in items]

def _freshness_score(observed: date | None, as_of: date, horizon_days: int) -> float:
    if observed is None:
        return 0.0
    age = max(0, (as_of - observed).days)
    return max(0.0, 1 - age / horizon_days)



def _issue(source: str, exc: Exception) -> dict[str, str]:
    return {"source": source, "message": str(exc)}


class AgricultureIntelligenceService:
    """Indian mandi prices plus rule-based seven-day weather alerts."""

    def __init__(self, client: ExternalJsonClient | None = None) -> None:
        self.client = client or ExternalJsonClient()

    def overview(
        self,
        *,
        state: str = "Maharashtra",
        district: str | None = None,
        commodity: str = "Onion",
        market: str | None = None,
        latitude: float = 18.5204,
        longitude: float = 73.8567,
        limit: int = 100,
    ) -> dict[str, Any]:
        lineage: list[SourceLineage] = []
        issues: list[dict[str, str]] = []
        mandi: dict[str, Any] | None = None
        weather: dict[str, Any] | None = None

        try:
            mandi, mandi_lineage = self._mandi(
                state=state,
                district=district,
                commodity=commodity,
                market=market,
                limit=limit,
            )
            lineage.append(mandi_lineage)
        except ProviderUnavailable as exc:
            issues.append(_issue("data.gov.in", exc))

        try:
            weather, weather_lineage = self._weather(
                latitude=latitude,
                longitude=longitude,
            )
            lineage.append(weather_lineage)
        except ProviderUnavailable as exc:
            issues.append(_issue("Open-Meteo", exc))

        available = int(mandi is not None) + int(weather is not None)
        cached = sum(item.cached for item in lineage)
        live = available - cached
        mandi_freshness = _freshness_score(
            _parse_date(mandi.get("latest_arrival_date")) if mandi else None,
            date.today(),
            14,
        )
        freshness = (mandi_freshness + int(weather is not None)) / 2
        confidence = round(
            100 * (0.5 * available / 2 + 0.25 * live / 2 + 0.25 * freshness)
        )
        return {
            "product": "agriculture-intelligence",
            "status": "healthy" if not issues else "degraded" if available else "unavailable",
            "generated_at": _utc_now(),
            "query": {
                "state": state,
                "district": district,
                "commodity": commodity,
                "market": market,
                "latitude": latitude,
                "longitude": longitude,
            },
            "mandi": mandi,
            "weather": weather,
            "confidence": {
                "score": confidence,
                "coverage": f"{available}/2 source groups",
                "cached_sources": cached,
                "freshness": round(freshness, 3),
                "method": "50% source coverage + 25% live availability + 25% observation freshness",
            },
            "feature_definitions": [
                {
                    "id": "modal_price_median",
                    "definition": "Median modal price across returned mandi observations.",
                    "unit": "INR per provider-reported commodity unit",
                },
                {
                    "id": "heat_alert",
                    "definition": "Triggered when any seven-day forecast maximum is at least 40°C.",
                },
                {
                    "id": "heavy_rain_alert",
                    "definition": "Triggered at 75 mm in one day or 120 mm over the forecast window.",
                },
                {
                    "id": "dryness_watch",
                    "definition": "Triggered when seven-day forecast precipitation is below 5 mm; not a drought declaration.",
                },
            ],
            "lineage": _lineage(lineage),
            "issues": issues,
        }

    def _mandi(
        self,
        *,
        state: str,
        district: str | None,
        commodity: str,
        market: str | None,
        limit: int,
    ) -> tuple[dict[str, Any], SourceLineage]:
        key = os.getenv("DATA_GOV_IN_API_KEY") or os.getenv("DATA_GOV_API_KEY")
        if not key:
            raise ProviderUnavailable("DATA_GOV_IN_API_KEY is not configured.")
        resource_id = os.getenv("DATA_GOV_IN_RESOURCE_ID", MANDI_RESOURCE_ID)
        source_url = os.getenv(
            "DATA_GOV_IN_RESOURCE_URL",
            f"https://api.data.gov.in/resource/{resource_id}",
        )
        params: dict[str, Any] = {
            "api-key": key,
            "format": "json",
            "offset": 0,
            "limit": limit,
            "filters[state]": state,
            "filters[commodity]": commodity,
        }
        if district:
            params["filters[district]"] = district
        if market:
            params["filters[market]"] = market
        payload, lineage = self.client.get(
            "data.gov.in",
            source_url,
            params=params,
            timeout=12,
        )
        if not isinstance(payload, dict) or not isinstance(payload.get("records"), list):
            raise ProviderUnavailable("data.gov.in returned an unexpected mandi payload.")

        records: list[dict[str, Any]] = []
        for item in payload["records"]:
            if not isinstance(item, dict):
                continue
            records.append(
                {
                    "state": item.get("state"),
                    "district": item.get("district"),
                    "market": item.get("market"),
                    "commodity": item.get("commodity"),
                    "variety": item.get("variety"),
                    "grade": item.get("grade"),
                    "arrival_date": item.get("arrival_date"),
                    "min_price": _float(item.get("min_price")),
                    "max_price": _float(item.get("max_price")),
                    "modal_price": _float(item.get("modal_price")),
                }
            )
        records.sort(key=lambda row: _parse_date(row["arrival_date"]) or date.min, reverse=True)
        modal = [row["modal_price"] for row in records if row["modal_price"] is not None]
        observed_dates = [
            parsed
            for parsed in (_parse_date(row["arrival_date"]) for row in records)
            if parsed is not None
        ]
        latest = max(observed_dates) if observed_dates else None
        completeness_fields = ("market", "arrival_date", "min_price", "max_price", "modal_price")
        completeness = (
            sum(row.get(field) is not None for row in records for field in completeness_fields)
            / (len(records) * len(completeness_fields))
            if records
            else 0
        )
        return {
            "resource_id": resource_id,
            "record_count": len(records),
            "latest_arrival_date": latest.isoformat() if latest else None,
            "freshness_days": (date.today() - latest).days if latest else None,
            "market_count": len({row["market"] for row in records if row["market"]}),
            "district_count": len({row["district"] for row in records if row["district"]}),
            "modal_price_median": round(statistics.median(modal), 2) if modal else None,
            "modal_price_low": min(modal) if modal else None,
            "modal_price_high": max(modal) if modal else None,
            "field_completeness": round(completeness, 3),
            "records": records,
        }, lineage

    def _weather(
        self, *, latitude: float, longitude: float
    ) -> tuple[dict[str, Any], SourceLineage]:
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
            "forecast_days": 7,
            "timezone": "auto",
        }
        payload, lineage = self.client.get(
            "Open-Meteo",
            OPEN_METEO_URL,
            params=params,
            timeout=10,
        )
        if not isinstance(payload, dict) or not isinstance(payload.get("daily"), dict):
            raise ProviderUnavailable("Open-Meteo returned an unexpected forecast payload.")
        daily = payload["daily"]
        times = daily.get("time") or []
        maximums = daily.get("temperature_2m_max") or []
        minimums = daily.get("temperature_2m_min") or []
        precipitation = daily.get("precipitation_sum") or []
        probabilities = daily.get("precipitation_probability_max") or []
        days = []
        for index, value in enumerate(times):
            days.append(
                {
                    "date": value,
                    "temperature_max_c": _float(maximums[index]) if index < len(maximums) else None,
                    "temperature_min_c": _float(minimums[index]) if index < len(minimums) else None,
                    "precipitation_mm": _float(precipitation[index]) if index < len(precipitation) else None,
                    "precipitation_probability_pct": _float(probabilities[index]) if index < len(probabilities) else None,
                }
            )
        rain = [day["precipitation_mm"] or 0 for day in days]
        heat = [day["temperature_max_c"] for day in days if day["temperature_max_c"] is not None]
        total_rain = sum(rain)
        max_rain = max(rain, default=0)
        max_heat = max(heat, default=None)
        alerts = []
        if max_heat is not None and max_heat >= 40:
            alerts.append({"type": "heat", "severity": "high", "value": max_heat, "unit": "°C"})
        if max_rain >= 75 or total_rain >= 120:
            alerts.append({"type": "heavy-rain", "severity": "high", "value": round(total_rain, 1), "unit": "mm/7d"})
        if total_rain < 5:
            alerts.append({"type": "dryness-watch", "severity": "medium", "value": round(total_rain, 1), "unit": "mm/7d"})
        return {
            "latitude": payload.get("latitude", latitude),
            "longitude": payload.get("longitude", longitude),
            "timezone": payload.get("timezone"),
            "forecast_days": days,
            "total_precipitation_mm": round(total_rain, 1),
            "maximum_temperature_c": max_heat,
            "alerts": alerts,
            "method": "Deterministic threshold alerts from the seven-day forecast; not a crop-yield model.",
        }, lineage


class CountryIntelligenceService:
    """Vintage-aware FRED pulse with WTO and UN Comtrade trade context."""

    def __init__(self, client: ExternalJsonClient | None = None) -> None:
        self.client = client or ExternalJsonClient()

    def pulse(
        self,
        country_code: str,
        *,
        as_of: date | None = None,
        trade_year: int | None = None,
        partner_code: int = 0,
        commodity_code: str = "10",
    ) -> dict[str, Any]:
        code = country_code.upper()
        if code not in COUNTRIES:
            raise ValueError(f"Unsupported country '{country_code}'. Choose IND or USA.")
        country = COUNTRIES[code]
        vintage = as_of or date.today()
        selected_trade_year = trade_year or max(2000, vintage.year - 2)
        indicators: list[dict[str, Any]] = []
        wto_series: list[dict[str, Any]] = []
        comtrade: dict[str, Any] | None = None
        lineage: list[SourceLineage] = []
        issues: list[dict[str, str]] = []

        jobs: dict[Any, tuple[str, str]] = {}
        with ThreadPoolExecutor(max_workers=6) as executor:
            for definition in country["fred"]:
                jobs[executor.submit(self._fred_indicator, definition, vintage)] = (
                    "fred",
                    definition["id"],
                )
            for flow_id, indicator_code in (
                ("exports", "ITS_MTV_MX"),
                ("imports", "ITS_MTV_MM"),
            ):
                jobs[executor.submit(
                    self._wto_series,
                    country["wto_reporter_code"],
                    flow_id,
                    indicator_code,
                    vintage,
                )] = ("wto", flow_id)
            jobs[executor.submit(
                self._comtrade,
                country["comtrade_reporter_code"],
                selected_trade_year,
                partner_code,
                commodity_code,
            )] = ("comtrade", commodity_code)

            for future in as_completed(jobs):
                source, item_id = jobs[future]
                try:
                    value, source_lineage = future.result()
                    lineage.append(source_lineage)
                    if source == "fred":
                        indicators.append(value)
                    elif source == "wto":
                        wto_series.append(value)
                    else:
                        comtrade = value
                except ProviderUnavailable as exc:
                    issues.append(_issue(f"{source}:{item_id}", exc))

        order = {definition["id"]: index for index, definition in enumerate(country["fred"])}
        indicators.sort(key=lambda item: order.get(item["id"], 999))
        wto_series.sort(key=lambda item: item["id"])
        alerts = self._country_alerts(indicators)
        expected_sources = len(country["fred"]) + 3
        cached = sum(item.cached for item in lineage)
        coverage = len(lineage) / expected_sources
        live = len(lineage) - cached
        freshness_values = self._freshness_values(
            indicators,
            wto_series,
            comtrade,
            vintage,
        )
        freshness = statistics.fmean(freshness_values) if freshness_values else 0.0
        confidence = round(
            100
            * (
                0.6 * coverage
                + 0.2 * live / expected_sources
                + 0.2 * freshness
            )
        )
        return {
            "product": "trade-country-growth-pulse",
            "status": "healthy" if not issues else "degraded" if lineage else "unavailable",
            "generated_at": _utc_now(),
            "country": {
                "code": code,
                "name": country["name"],
                "wto_reporter_code": country["wto_reporter_code"],
                "comtrade_reporter_code": country["comtrade_reporter_code"],
            },
            "as_of": vintage.isoformat(),
            "vintage_mode": True,
            "vintage_scope": "FRED/ALFRED indicators only; WTO and UN Comtrade are current releases constrained to the selected periods.",
            "indicators": indicators,
            "wto_monthly_trade": wto_series,
            "commodity_trade": comtrade,
            "alerts": alerts,
            "confidence": {
                "score": confidence,
                "coverage": f"{len(lineage)}/{expected_sources} source series",
                "cached_sources": cached,
                "freshness": round(freshness, 3),
                "method": "60% source-series coverage + 20% live availability + 20% observation freshness",
            },
            "feature_definitions": [
                {
                    "id": "known_as_of",
                    "definition": "FRED observations constrained with realtime_start=realtime_end=the selected historical date and observation_end=that date.",
                },
                {
                    "id": "monthly_trade_change",
                    "definition": "Latest WTO monthly value versus the value 12 observations earlier when available, otherwise versus the prior observation.",
                },
                {
                    "id": "commodity_trade_value",
                    "definition": "UN Comtrade primary value for the selected HS code, reporter, partner, flow and annual period.",
                },
            ],
            "lineage": _lineage(lineage),
            "issues": issues,
        }

    def _fred_indicator(
        self, definition: dict[str, str], as_of: date
    ) -> tuple[dict[str, Any], SourceLineage]:
        key = os.getenv("FRED_API_KEY")
        if not key:
            raise ProviderUnavailable("FRED_API_KEY is not configured.")
        params = {
            "api_key": key,
            "file_type": "json",
            "series_id": definition["series_id"],
            "realtime_start": as_of.isoformat(),
            "realtime_end": as_of.isoformat(),
            "observation_end": as_of.isoformat(),
            "units": definition["units"],
            "sort_order": "desc",
            "limit": 16,
        }
        payload, lineage = self.client.get(
            "FRED/ALFRED",
            FRED_OBSERVATIONS_URL,
            params=params,
            timeout=10,
            vintage_date=as_of.isoformat(),
        )
        observations = payload.get("observations", []) if isinstance(payload, dict) else []
        usable = [item for item in observations if _float(item.get("value")) is not None]
        latest = usable[0] if usable else None
        previous = usable[1] if len(usable) > 1 else None
        latest_value = _float(latest.get("value")) if latest else None
        previous_value = _float(previous.get("value")) if previous else None
        change = (
            round(latest_value - previous_value, 3)
            if latest_value is not None and previous_value is not None
            else None
        )
        return {
            "id": definition["id"],
            "series_id": definition["series_id"],
            "label": definition["label"],
            "frequency": definition["frequency"],
            "unit": definition["unit"],
            "latest_date": latest.get("date") if latest else None,
            "latest_value": latest_value,
            "previous_value": previous_value,
            "change": change,
            "observation_count": len(usable),
            "realtime_start": latest.get("realtime_start") if latest else as_of.isoformat(),
            "realtime_end": latest.get("realtime_end") if latest else as_of.isoformat(),
        }, lineage

    def _wto_series(
        self,
        reporter_code: str,
        flow_id: str,
        indicator_code: str,
        as_of: date,
    ) -> tuple[dict[str, Any], SourceLineage]:
        key = os.getenv("WTO_API_KEY")
        if not key:
            raise ProviderUnavailable("WTO_API_KEY is not configured.")
        start = as_of - timedelta(days=550)
        period = f"{start.year:04d}{start.month:02d}-{as_of.year:04d}{as_of.month:02d}"
        params = {
            "i": indicator_code,
            "r": reporter_code,
            "ps": period,
            "fmt": "json",
            "mode": "full",
            "off": 0,
            "max": 24,
        }
        payload, lineage = self.client.get(
            "WTO Timeseries",
            WTO_DATA_URL,
            params=params,
            headers={"Ocp-Apim-Subscription-Key": key},
            timeout=10,
        )
        dataset = payload.get("Dataset", []) if isinstance(payload, dict) else []
        points = []
        for item in dataset:
            value = _float(item.get("Value"))
            if value is None:
                continue
            points.append(
                {
                    "period": str(item.get("PeriodCode") or item.get("Period")),
                    "value": value,
                    "unit": item.get("Unit"),
                }
            )
        points.sort(key=lambda item: item["period"])
        latest = points[-1] if points else None
        comparison = points[-13] if len(points) >= 13 else points[-2] if len(points) >= 2 else None
        change_pct = None
        if latest and comparison and comparison["value"]:
            change_pct = round((latest["value"] / comparison["value"] - 1) * 100, 2)
        return {
            "id": flow_id,
            "indicator_code": indicator_code,
            "label": f"Monthly merchandise {flow_id}",
            "latest_period": latest["period"] if latest else None,
            "latest_value": latest["value"] if latest else None,
            "unit": latest["unit"] if latest else None,
            "change_pct": change_pct,
            "comparison": "year-over-year" if len(points) >= 13 else "previous observation",
            "points": points,
        }, lineage

    def _comtrade(
        self,
        reporter_code: int,
        period: int,
        partner_code: int,
        commodity_code: str,
    ) -> tuple[dict[str, Any], SourceLineage]:
        key = os.getenv("UN_COMTRADE_API_KEY") or os.getenv("COMTRADE_API_KEY")
        if not key:
            raise ProviderUnavailable("UN_COMTRADE_API_KEY is not configured.")
        params = {
            "reporterCode": reporter_code,
            "period": period,
            "cmdCode": commodity_code,
            "flowCode": "X",
            "partnerCode": partner_code,
            "partner2Code": 0,
            "customsCode": "C00",
            "motCode": 0,
            "maxRecords": 100,
            "subscription-key": key,
        }
        payload, lineage = self.client.get(
            "UN Comtrade",
            COMTRADE_DATA_URL,
            params=params,
            timeout=10,
        )
        if not isinstance(payload, dict) or payload.get("error"):
            raise ProviderUnavailable("UN Comtrade rejected the trade query.")
        records = []
        for item in payload.get("data", []):
            records.append(
                {
                    "period": item.get("period"),
                    "reporter": item.get("reporterDesc"),
                    "partner": item.get("partnerDesc"),
                    "flow": item.get("flowDesc"),
                    "commodity_code": item.get("cmdCode"),
                    "commodity": item.get("cmdDesc"),
                    "primary_value_usd": _float(item.get("primaryValue")),
                    "net_weight_kg": _float(item.get("netWgt")),
                    "reported": item.get("isReported"),
                    "aggregate": item.get("isAggregate"),
                }
            )
        values = [item["primary_value_usd"] for item in records if item["primary_value_usd"] is not None]
        return {
            "period": period,
            "reporter_code": reporter_code,
            "partner_code": partner_code,
            "commodity_code": commodity_code,
            "flow": "exports",
            "record_count": len(records),
            "primary_value_usd": round(sum(values), 2) if values else None,
            "records": records,
        }, lineage

    @staticmethod
    def _freshness_values(
        indicators: list[dict[str, Any]],
        wto_series: list[dict[str, Any]],
        comtrade: dict[str, Any] | None,
        as_of: date,
    ) -> list[float]:
        horizons = {"monthly": 120, "quarterly": 240, "annual": 730}
        values = [
            _freshness_score(
                _parse_date(item.get("latest_date")),
                as_of,
                horizons.get(item.get("frequency"), 365),
            )
            for item in indicators
        ]
        for item in wto_series:
            period = str(item.get("latest_period") or "")
            observed = _parse_date(f"{period[:6]}01") if len(period) >= 6 else None
            values.append(_freshness_score(observed, as_of, 180))
        if comtrade:
            observed = _parse_date(f"{comtrade.get('period')}-12-31")
            values.append(_freshness_score(observed, as_of, 1095))
        return values

    @staticmethod
    def _country_alerts(indicators: list[dict[str, Any]]) -> list[dict[str, Any]]:
        alerts = []
        values = {item["id"]: item.get("latest_value") for item in indicators}
        if values.get("real_gdp_growth") is not None and values["real_gdp_growth"] < 0:
            alerts.append({"type": "growth-contraction", "severity": "high", "value": values["real_gdp_growth"]})
        if values.get("industrial_production_growth") is not None and values["industrial_production_growth"] < 0:
            alerts.append({"type": "industrial-contraction", "severity": "medium", "value": values["industrial_production_growth"]})
        if values.get("consumer_inflation") is not None and values["consumer_inflation"] >= 6:
            alerts.append({"type": "high-inflation", "severity": "medium", "value": values["consumer_inflation"]})
        return alerts
