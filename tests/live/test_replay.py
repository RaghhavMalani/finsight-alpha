"""Live becomes history: a recorded stream replays from its sealed segment identically."""

import asyncio

from src.live import model
from src.live.bus import Bus
from src.live.risk_live import LiveRisk
from src.live.runtime import LiveService
from src.live.scheduler import Scheduler
from src.live.store import LiveStore
from tests.live.helpers import T0, Clock, FixtureFeed, fixture_observations
from src.live.feeds.base import FeedError


def record_stream(store, clock):
    """Drive the real scheduler over fixture feeds (including a failing one) and capture the bus."""
    seen = []
    service = LiveService(store, feeds=[], risk=LiveRisk(), clock=clock)
    service.bus.on_event(seen.append)
    feeds = [FixtureFeed(name, rows) for name, rows in fixture_observations().items()]
    feeds.append(FixtureFeed("flaky", errors=[FeedError("HTTP 503")] * 3))

    async def drive():
        scheduler = Scheduler(feeds, on_result=service._on_result, on_health=service._on_health, clock=clock)
        for _ in range(3):
            for feed in feeds:
                await scheduler.run_once(feed.name)
                clock.advance(seconds=7)
    asyncio.run(drive())
    return seen


def test_replay_of_sealed_day_is_identical_to_the_live_stream(tmp_path):
    clock = Clock()
    store = LiveStore(tmp_path / "live", clock=clock)
    live = record_stream(store, clock)
    types = {e["type"] for e in live}
    assert {"geo.event", "macro.release", "prediction.update", "news.headline", "feed.health",
            "risk.alert"} <= types
    clock.advance(days=1)
    manifest = store.seal_day(T0.date().isoformat())
    assert manifest["rows"] == len(live)

    replayed = []
    offline = LiveService(LiveStore(tmp_path / "live", clock=clock, readonly=True), bus=Bus(), mode="offline",
                          clock=clock)
    offline.bus.on_event(replayed.append)
    published = asyncio.run(offline.replay(speed=0))
    assert published == len(live)
    assert [model.canonical(e) for e in replayed] == [model.canonical(e) for e in live]


def test_replay_reads_only_verified_sealed_bytes(tmp_path):
    clock = Clock()
    store = LiveStore(tmp_path / "live", clock=clock)
    record_stream(store, clock)
    clock.advance(days=1)
    manifest = store.seal_day(T0.date().isoformat())
    sealed = store.sealed / manifest["file"]
    sealed.write_bytes(sealed.read_bytes().replace(b"usgs", b"USGS", 1))
    offline = LiveService(LiveStore(tmp_path / "live", clock=clock, readonly=True), mode="offline", clock=clock)
    try:
        asyncio.run(offline.replay(speed=0))
    except ValueError as error:
        assert "does not match its manifest" in str(error)
    else:
        raise AssertionError("tampered sealed segment replayed")
