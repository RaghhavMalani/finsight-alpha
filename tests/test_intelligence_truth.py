from __future__ import annotations

import requests

from src.data import intelligence


class FakeResponse:
    def __init__(self, payload, content: bytes = b"", content_type: str = "application/json"):
        self._payload = payload
        self.content = content
        self.headers = {"content-type": content_type}

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self._payload


def test_world_bank_series_has_full_evidence_metadata(monkeypatch) -> None:
    payload = [
        {"page": 1},
        [
            {"date": "2023", "value": 3100.0},
            {"date": "2022", "value": 3000.0},
        ],
    ]
    monkeypatch.setattr(intelligence.requests, "get", lambda *args, **kwargs: FakeResponse(payload))

    result = intelligence._world_bank_series(
        "IND", intelligence.COUNTRIES["IND"], "AG.YLD.CREL.KG", "Cereal yield", "kg/hectare"
    )

    assert result["status"] == "AVAILABLE"
    metadata = result["metadata"]
    for field in (
        "dataset_id", "provider", "source_url", "license", "version", "as_of",
        "available_from", "retrieved_at", "geography", "lineage", "quality_checks",
        "customer_license_status",
    ):
        assert field in metadata
    assert metadata["version"].startswith("sha256:")
    assert metadata["customer_license_status"] == "UNVERIFIED"
    assert all(check["status"] == "PASS" for check in metadata["quality_checks"])


def test_upstream_failure_is_unavailable_without_fallback(monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise requests.ConnectionError("offline")

    monkeypatch.setattr(intelligence.requests, "get", fail)
    result = intelligence._weather_series("IND", intelligence.COUNTRIES["IND"])

    assert result["status"] == "UNAVAILABLE"
    assert result["points"] == []
    assert result["metadata"]["provider"] == "UNAVAILABLE"
    assert "offline" in result["reason"]


def test_trade_product_never_asserts_predictive_performance(monkeypatch) -> None:
    def unavailable(*args, **kwargs):
        return {
            "status": "UNAVAILABLE",
            "name": args[3],
            "reason": "test",
            "points": [],
            "metadata": {"dataset_id": "UNAVAILABLE"},
        }

    monkeypatch.setattr(intelligence, "_world_bank_series", unavailable)
    result = intelligence.trade_intelligence("IND")

    assert result["performance_claims"] == "UNAVAILABLE"
    assert "No security-return correlation" in result["performance_note"]
