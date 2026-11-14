"""Scheduler backoff, health, missing keys, and the live Risk adapter's transitions."""

import asyncio
import random

import pytest

from src.live.feeds import AlpacaIEX, EIASpot, FREDVintages, NSEEndOfDay, all_feeds
from src.live.feeds.base import FeedError
from src.live.risk_live import COVERED, LiveRisk
from src.live.runtime import LiveService
from src.live.scheduler import BACKOFF_BASE_S, MAX_BACKOFF_S, Scheduler, failure_delay, success_delay
from src.live.store import LiveStore
from tests.live.helpers import Clock, FixtureFeed, fixture_observations


class ZeroRng(random.Random):
    def uniform(self, a, b):
        return 0.0


def test_backoff_is_exponential_capped_and_respects_rate_limits():
    feed = FixtureFeed("x", cadence_s=900, min_interval_s=10)
    delays = [failure_delay(feed, n, ZeroRng()) for n in range(1, 8)]
    assert delays == [30, 60, 120, 240, 480, 900, 900]  # capped at the cadence
    daily = FixtureFeed("d", cadence_s=86400, min_interval_s=7200)
    assert failure_delay(daily, 1, ZeroRng()) == 7200  # never faster than the feed's rate limit
    assert failure_delay(daily, 20, ZeroRng()) == max(7200, MAX_BACKOFF_S)
    assert failure_delay(feed, 1, ZeroRng(), retry_after=600) == 600  # honours Retry-After
    assert BACKOFF_BASE_S == 30
    jittered = {round(success_delay(feed, random.Random(s))) for s in range(20)}
    assert min(jittered) >= 810 and max(jittered) <= 990 and len(jittered) > 1


def test_health_tracks_failures_down_and_recovery():
    clock = Clock()
    feed = FixtureFeed("flaky", rows=[], errors=[FeedError("HTTP 503")] * 3 + [None] * 8)
    seen = []

    async def on_result(feed, rows):
        return len(rows), 0

    async def on_health(snapshot):
        seen.append(snapshot)

    scheduler = Scheduler([feed], on_result=on_result, on_health=on_health, clock=clock, rng=ZeroRng())

    async def run(n):
        for _ in range(n):
            await scheduler.run_once("flaky")
            clock.advance(seconds=60)

    asyncio.run(run(3))
    snap = seen[-1]
    assert [s["status"] for s in seen] == ["DEGRADED", "DEGRADED", "DOWN"]
    assert snap["consecutive_failures"] == 3 and snap["error_rate"] == 1.0
    assert snap["last_error"] == "FeedError: HTTP 503" and snap["last_success_at"] is None
    assert snap["next_due_at"] == "2026-11-14T12:04:00.000000Z"  # 120 s backoff after the third failure
    asyncio.run(run(1))
    assert seen[-1]["status"] == "DEGRADED" and seen[-1]["consecutive_failures"] == 0  # 3/4 failed in window
    asyncio.run(run(8))
    assert seen[-1]["status"] == "DEGRADED" and seen[-1]["error_rate"] == 0.25  # 3 of 12
    asyncio.run(run(1))
    assert seen[-1]["status"] == "UP" and seen[-1]["error_rate"] < 0.25
    assert seen[-1]["lag_s"] == 0.0
    for key in ("feed", "status", "delay", "licence", "last_success_at", "lag_s", "error_rate",
                "consecutive_failures", "cadence_s", "next_due_at"):
        assert key in seen[-1]


def test_missing_keys_report_unavailable_and_are_never_polled(monkeypatch, tmp_path):
    for name in ("FRED_API_KEY", "EIA_API_KEY", "APCA_API_KEY_ID", "ALPACA_API_KEY_ID", "ALPACA_API_KEY",
                 "APCA_API_SECRET_KEY", "ALPACA_API_SECRET_KEY", "ALPACA_SECRET_KEY",
                 "FINSIGHT_NSE_BHAVCOPY", "FINSIGHT_NSE_CALENDAR"):
        monkeypatch.delenv(name, raising=False)
    assert FREDVintages().unavailable_reason() == "UNAVAILABLE: no key (FRED_API_KEY)"
    assert EIASpot().unavailable_reason() == "UNAVAILABLE: no key (EIA_API_KEY)"
    assert AlpacaIEX().unavailable_reason().startswith("UNAVAILABLE: no key (APCA_API_KEY_ID")
    assert NSEEndOfDay().unavailable_reason().startswith("UNAVAILABLE: operator bhavcopy")

    clock = Clock()
    store = LiveStore(tmp_path / "live", clock=clock)
    fred = FREDVintages()
    fred.fetch = lambda: pytest.fail("a feed without a key must not be fetched")
    ok = FixtureFeed("usgs", fixture_observations()["usgs"])
    service = LiveService(store, feeds=[fred, ok], risk=LiveRisk(), clock=clock)

    async def go():
        await service.start()
        await service.scheduler.run_once("usgs")
        await service.stop()
    asyncio.run(go())
    health = {f["feed"]: f for f in service.health()["feeds"]}
    assert health["fred"]["status"] == "UNAVAILABLE"
    assert health["fred"]["reason"] == "UNAVAILABLE: no key (FRED_API_KEY)"
    assert health["fred"]["last_success_at"] is None and health["fred"]["lag_s"] is None  # missing is not zero
    assert health["usgs"]["status"] == "UP" and health["usgs"]["rows_new_last"] == 3
    stored = store.since(None, types={"feed.health"})
    assert any(r["source_id"] == "fred" and r["payload"]["status"] == "UNAVAILABLE" for r in stored)


def test_every_registered_feed_declares_cadence_licence_and_delay():
    for feed in all_feeds():
        d = feed.describe()
        assert d["cadence_s"] > 0 and d["min_interval_s"] > 0
        assert d["delay"] and d["delay"] != "UNKNOWN"
        assert d["licence"]["status"] and d["licence"]["redistribution"] in ("PUBLIC", "LOCAL_ONLY", "NONE")


def test_risk_alerts_follow_feed_state_and_write_no_publication(tmp_path):
    clock = Clock()
    store = LiveStore(tmp_path / "live", clock=clock)
    feed = FixtureFeed("flaky", rows=[], errors=[FeedError("HTTP 500")] * 3 + [None] * 12)
    service = LiveService(store, feeds=[feed], risk=LiveRisk(), clock=clock)
    alerts = []
    service.bus.on_event(lambda e: e["type"] == "risk.alert" and alerts.append(e))

    async def go(n):
        scheduler = service.scheduler or Scheduler([feed], on_result=service._on_result,
                                                   on_health=service._on_health, clock=clock)
        service.scheduler = scheduler
        for _ in range(n):
            await scheduler.run_once("flaky")
            clock.advance(seconds=60)
    asyncio.run(go(15))
    seen = [(a["payload"]["rule_id"], a["payload"]["outcome"]) for a in alerts]
    assert seen == [("R-DATA-HEALTH", "FINDING"), ("R-DATA-ATTEMPT", "FINDING"), ("R-DATA-HEALTH", "CLEAR"),
                    ("R-DATA-ATTEMPT", "CLEAR"), ("R-DATA-HEALTH", "FINDING"), ("R-DATA-HEALTH", "CLEAR")]
    down = alerts[1]
    assert down["payload"]["severity"] == "HIGH" and down["payload"]["reason_code"] == "SOURCE_ATTEMPT_FAILED"
    assert down["provenance"]["policy_sha256"] == service.risk.policy["sha256"]
    health_ids = {r["id"] for r in store.since(None, types={"feed.health"})}
    assert all(a["provenance"]["inputs"][0]["id"] in health_ids for a in alerts)  # evidence-backed
    assert "NONE" in down["payload"]["publication"]
    coverage = service.risk.coverage()
    assert coverage["covered"] == list(COVERED) and not coverage["writes_publication_artifacts"]
    assert "R-MODEL-AGE" in coverage["not_covered"]
