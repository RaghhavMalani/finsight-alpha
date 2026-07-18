"""Offline tests for the agriculture, country, and ticker intelligence products."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from src.intelligence.services import (
    COMTRADE_DATA_URL,
    FRED_OBSERVATIONS_URL,
    OPEN_METEO_URL,
    WTO_DATA_URL,
    AgricultureIntelligenceService,
    CompanyIntelligenceService,
    CountryIntelligenceService,
)
from src.intelligence.snapshots import SnapshotStore, SourceLineage


class StubClient:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def get(self, provider: str, source_url: str, **kwargs: Any):
        params = kwargs.get("params", {})
        self.calls.append({"provider": provider, "url": source_url, **kwargs})
        lineage = SourceLineage(
            provider=provider,
            source_url=source_url,
            snapshot_id="a" * 64,
            content_hash="a" * 64,
            request_fingerprint="b" * 64,
            retrieved_at="2026-07-18T00:00:00+00:00",
            vintage_date=kwargs.get("vintage_date"),
        )
        if source_url == OPEN_METEO_URL:
            return {
                "latitude": 18.52,
                "longitude": 73.85,
                "timezone": "Asia/Kolkata",
                "daily": {
                    "time": ["2026-07-18", "2026-07-19"],
                    "temperature_2m_max": [41.0, 37.0],
                    "temperature_2m_min": [25.0, 24.0],
                    "precipitation_sum": [80.0, 45.0],
                    "precipitation_probability_max": [90, 80],
                },
            }, lineage
        if "api.data.gov.in/resource" in source_url:
            return {
                "records": [
                    {
                        "state": "Maharashtra",
                        "district": "Pune",
                        "market": "Pune",
                        "commodity": "Onion",
                        "variety": "Local",
                        "grade": "FAQ",
                        "arrival_date": "17/07/2026",
                        "min_price": "1800",
                        "max_price": "2400",
                        "modal_price": "2200",
                    },
                    {
                        "state": "Maharashtra",
                        "district": "Nashik",
                        "market": "Lasalgaon",
                        "commodity": "Onion",
                        "variety": "Local",
                        "grade": "FAQ",
                        "arrival_date": "18/07/2026",
                        "min_price": "1900",
                        "max_price": "2500",
                        "modal_price": "2300",
                    },
                ]
            }, lineage
        if source_url == FRED_OBSERVATIONS_URL:
            return {
                "observations": [
                    {"date": "2024-01-01", "value": "5.2", "realtime_start": params["realtime_start"], "realtime_end": params["realtime_end"]},
                    {"date": "2023-10-01", "value": "4.9", "realtime_start": params["realtime_start"], "realtime_end": params["realtime_end"]},
                ]
            }, lineage
        if source_url == WTO_DATA_URL:
            direction = "exports" if params["i"] == "ITS_MTV_MX" else "imports"
            base = 100 if direction == "exports" else 90
            return {
                "Dataset": [
                    {"PeriodCode": "202401", "Value": base, "Unit": "Million US dollar"},
                    {"PeriodCode": "202501", "Value": base + 10, "Unit": "Million US dollar"},
                ]
            }, lineage
        if source_url == COMTRADE_DATA_URL:
            return {
                "count": 1,
                "error": "",
                "data": [
                    {
                        "period": "2024",
                        "reporterDesc": "India",
                        "partnerDesc": "World",
                        "flowDesc": "Export",
                        "cmdCode": "10",
                        "cmdDesc": "Cereals",
                        "primaryValue": 125000000,
                        "netWgt": 42000000,
                        "isReported": True,
                        "isAggregate": True,
                    }
                ],
            }, lineage
        raise AssertionError(f"Unexpected URL: {source_url}")


def test_snapshot_store_is_immutable_and_strips_secrets(tmp_path: Path) -> None:
    store = SnapshotStore(tmp_path)
    snapshot = store.record(
        "Example Provider",
        "https://example.test/data",
        {"series": "GDP", "api_key": "super-secret"},
        {"value": 42},
        vintage_date="2024-01-31",
    )
    assert snapshot.public_params == {"series": "GDP"}
    restored = store.get("Example Provider", snapshot.lineage.snapshot_id)
    assert restored is not None
    assert restored.payload == {"value": 42}
    assert "super-secret" not in next(tmp_path.rglob("*.json")).read_text(encoding="utf-8")


def test_agriculture_overview_normalizes_prices_and_alerts(monkeypatch) -> None:
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", "test-key")
    service = AgricultureIntelligenceService(client=StubClient())
    result = service.overview(state="Maharashtra", commodity="Onion")

    assert result["status"] == "healthy"
    assert result["mandi"]["latest_arrival_date"] == "2026-07-18"
    assert result["mandi"]["modal_price_median"] == 2250
    assert result["mandi"]["records"][0]["market"] == "Lasalgaon"
    assert {alert["type"] for alert in result["weather"]["alerts"]} == {"heat", "heavy-rain"}
    assert len(result["lineage"]) == 2


def test_country_pulse_is_vintage_aware_and_uses_separate_reporter_codes(monkeypatch) -> None:
    monkeypatch.setenv("FRED_API_KEY", "fred-test")
    monkeypatch.setenv("WTO_API_KEY", "wto-test")
    monkeypatch.setenv("UN_COMTRADE_API_KEY", "comtrade-test")
    client = StubClient()
    result = CountryIntelligenceService(client=client).pulse(
        "IND",
        as_of=date(2025, 2, 15),
        trade_year=2024,
    )

    assert result["status"] == "healthy"
    assert result["country"]["wto_reporter_code"] == "356"
    assert result["country"]["comtrade_reporter_code"] == 699
    assert result["commodity_trade"]["primary_value_usd"] == 125000000
    assert len(result["indicators"]) == 3
    fred_calls = [call for call in client.calls if call["url"] == FRED_OBSERVATIONS_URL]
    assert all(call["params"]["realtime_start"] == "2025-02-15" for call in fred_calls)
    assert all(call["params"]["realtime_end"] == "2025-02-15" for call in fred_calls)
    assert all(call["params"]["observation_end"] == "2025-02-15" for call in fred_calls)


def test_nvda_profile_selects_semiconductor_evidence_from_ticker(monkeypatch) -> None:
    monkeypatch.setenv("FRED_API_KEY", "fred-test")
    monkeypatch.setenv("UN_COMTRADE_API_KEY", "comtrade-test")
    client = StubClient()

    result = CompanyIntelligenceService(client=client).overview(
        "nvda",
        as_of=date(2025, 2, 15),
        trade_year=2024,
    )

    assert result["ticker"] == "NVDA"
    assert result["country"] == {"code": "USA", "name": "United States"}
    assert result["industry"] == "Semiconductors"
    assert result["trade_product"]["hs_code"] == "8542"
    assert {
        indicator["series_id"] for indicator in result["indicators"]
    } == {"IPG3344S", "PCU33443344", "A34SNO"}

    comtrade_calls = [
        call for call in client.calls if call["url"] == COMTRADE_DATA_URL
    ]
    assert len(comtrade_calls) == 2
    assert {
        call["params"]["flowCode"] for call in comtrade_calls
    } == {"X", "M"}
    assert all(call["params"]["cmdCode"] == "8542" for call in comtrade_calls)
