from datetime import datetime, timedelta, timezone
import hashlib
import json

import pytest

from src.data import license_policy
from src.replay.publication import ReplayPublisher, assert_derived, first_party_license, weekly_market_series

CUTOFF = "2026-01-30T22:00:00Z"


def rows(scale=1):
    # Synthetic numbers are test inputs only. No fixture is used as product Replay evidence.
    start = datetime(2026, 1, 1, 21, tzinfo=timezone.utc)
    return [{"observed_at": (start + timedelta(days=i)).isoformat(),
             "available_at": (start + timedelta(days=i, minutes=15)).isoformat(),
             "close": scale * (100 + i + (i % 4) * 2)} for i in range(30)]


def test_display_grant_does_not_authorize_publication(monkeypatch):
    monkeypatch.setattr(license_policy, "resolve_dataset_licenses", lambda *a, **kw: {
        "vendor": {"status": "ACTIVE", "permitted_uses": ["display", "model_training"]}})
    result = license_policy.derived_publication_license("vendor", 1)
    assert result["status"] == "NOT_GRANTED"
    assert result["permitted_uses"] == []


def test_explicit_publication_grant_and_unknown_source(monkeypatch):
    monkeypatch.setattr(license_policy, "resolve_dataset_licenses", lambda *a, **kw: {
        "vendor": {"status": "ACTIVE", "permitted_uses": ["publish_derived"]}})
    assert license_policy.derived_publication_license("vendor", 1)["permitted_uses"] == ["publish_derived"]
    assert license_policy.derived_publication_license("vendor", None)["status"] == "UNVERIFIED"
    assert license_policy.derived_publication_license("unknown", 1)["status"] == "UNVERIFIED"
    assert license_policy.derived_publication_license("usgs:comcat", None)["status"] == "PUBLIC_DOMAIN"


def test_weekly_series_scale_and_future_append_invariance():
    a = weekly_market_series("A", rows(), CUTOFF)
    b = weekly_market_series("A", rows(13.7), CUTOFF)
    for left, right in zip(a["weeks"], b["weeks"]):
        assert left["relative_performance"] == pytest.approx(right["relative_performance"])
        assert left["drawdown"] == pytest.approx(right["drawdown"])
        if left["realized_volatility"] is None:
            assert right["realized_volatility"] is None
        else:
            assert left["realized_volatility"] == pytest.approx(right["realized_volatility"])
    future = rows() + [{"observed_at": "2099-01-01T21:00:00Z", "available_at": "2099-01-01T22:00:00Z", "close": 999999}]
    assert weekly_market_series("A", future, CUTOFF) == a
    assert a["weeks"][0]["relative_performance"] == 100
    assert len(a["weeks"]) == 5
    assert_derived(a)


@pytest.mark.parametrize("mutate", [lambda r: r.append(dict(r[-1])), lambda r: r[1].update(close=0), lambda r: r[1].update(available_at="2025-01-01T00:00:00Z")])
def test_market_series_rejects_bad_source_input(mutate):
    data = rows()
    mutate(data)
    with pytest.raises(ValueError):
        weekly_market_series("A", data, CUTOFF)


@pytest.mark.parametrize("payload", [{"nested": {"close": 10}}, {"result": {"prices": [1, 2]}}, {"text": 'raw_prices: [1,2]'}, {"spot": 2}, {"confidence": {"high": 3}}, {"price": "123 USD"}, {"bid": None}])
def test_raw_price_sabotage(payload):
    with pytest.raises(ValueError):
        assert_derived(payload)
    assert_derived({"auc_ci95": {"low": 0.4, "high": 0.6}})


def test_publisher_deny_has_no_url_or_payload(tmp_path):
    publisher = ReplayPublisher(tmp_path, CUTOFF)
    publisher.market("A", rows(), source="YFINANCE", dataset_key="yfinance:daily", organization_id=None, input_hash="a" * 64)
    publisher.finish()
    value = json.loads((tmp_path / "replay-manifest.json").read_text())
    entry = value["artifacts"]["market:A"]
    assert entry["status"] == "UNAVAILABLE" and entry["url"] is None
    assert not (tmp_path / "artifacts").exists()


def test_publication_hashes_exact_bytes_and_rejects_future_and_expiry(tmp_path):
    publisher = ReplayPublisher(tmp_path, CUTOFF)
    args = dict(kind="projection", sources=["FinSight"], licence=first_party_license("finsight:research"), observed_at=CUTOFF, available_at=CUTOFF, input_hash="b" * 64)
    publisher.publish("sample", {"result": -0.1}, **args)
    publisher.finish()
    entry = publisher.manifest["artifacts"]["sample"]
    raw = (tmp_path / entry["url"].lstrip("/")).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == entry["sha256"]
    assert len(raw) == entry["bytes"]
    with pytest.raises(ValueError):
        publisher.publish("future", {}, **{**args, "available_at": "2099-01-01T00:00:00Z"})
    with pytest.raises(PermissionError):
        publisher.publish("expired", {}, **{**args, "licence": {**args["licence"], "valid_through": "2025-01-01T00:00:00Z"}})


def test_weekly_regime_alignment_and_late_vintage_exclusion():
    data = rows()
    result = weekly_market_series("A", data, CUTOFF)
    date = result["weeks"][-1]["week"]
    shaded = weekly_market_series("A", data, CUTOFF, {date: "Stress / Selloff"})
    assert shaded["weeks"][-1]["regime"] == "Stress / Selloff"
    assert all(w["regime"] is None for w in shaded["weeks"][:-1])
    late = {"observed_at": "2026-01-31T00:00:00Z", "available_at": "2099-01-01T00:00:00Z", "close": 1}
    assert weekly_market_series("A", data + [late], CUTOFF) == result


def test_unlisted_or_revoked_static_payload_is_removed(tmp_path):
    directory = tmp_path / "artifacts/replay"
    directory.mkdir(parents=True)
    stale = directory / "market-A.json"
    stale.write_text('{"relative_performance":100}')
    publisher = ReplayPublisher(tmp_path, CUTOFF)
    publisher.market("A", [], source="YFINANCE", dataset_key="yfinance:daily", organization_id=None, input_hash="a" * 64)
    publisher.finish()
    assert not stale.exists()


def test_colliding_artifact_names_are_rejected(tmp_path):
    publisher = ReplayPublisher(tmp_path, CUTOFF)
    args = dict(kind="projection", sources=["FinSight"], licence=first_party_license("finsight:research"), observed_at=CUTOFF, available_at=CUTOFF, input_hash="b" * 64)
    publisher.publish("a:b", {"result":1}, **args)
    with pytest.raises(ValueError, match="collision"):
        publisher.publish("a-b", {"result":2}, **args)
