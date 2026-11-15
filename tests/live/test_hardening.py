"""Adversarial-review hardening: crash safety, locking, time bounds, revisions, transport, SSE gaps."""

import asyncio
import io
import json
import subprocess
import sys
import threading
import zipfile
from dataclasses import replace
from functools import partial

import pandas as pd
import pytest

from src.live import model
from src.live import store as store_module
from src.live.bus import Bus
from src.live.feeds import GDELTEvents, Kalshi, NSEEndOfDay
from src.live.feeds import base as feed_base
from src.live.feeds import geo as geo_feeds
from src.live.feeds.base import FeedError, Fetched, content_revision
from src.live.risk_live import LiveRisk
from src.live.runtime import LiveService
from src.live.scheduler import MAX_BACKOFF_S, Scheduler, failure_delay
from src.live.store import LiveStore, StoreError
from src.live.triggers import Triggers
from src.news.rss import parse_rss
from tests.live.helpers import T0, Clock, FixtureFeed, fetched, fixture_observations
from tests.live.test_routes import client, parse_sse


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def store(tmp_path, clock):
    s = LiveStore(tmp_path / "live", clock=clock)
    yield s
    s.close()


def usgs(i=0):
    return fixture_observations()["usgs"][i]


def segment(store, day=None):
    return store.segments / f"{day or T0.date().isoformat()}.jsonl"


# -- blockers: crash safety, atomic commit, seal isolation, writer lock ---------------------

def test_torn_tail_is_quarantined_and_the_store_reopens(store, clock):
    store.append_many(fixture_observations()["usgs"][:2])
    store.close()
    with segment(store).open("ab") as handle:
        handle.write(b'{"schema_version":"live-observation/1","seq":3,"id":"tor')
    reopened = LiveStore(store.root, clock=clock)
    try:
        assert segment(store).read_bytes().endswith(b"\n")
        torn = list(reopened.quarantine.glob("*.torn"))
        assert len(torn) == 1 and torn[0].read_bytes().endswith(b'"id":"tor')
        assert reopened.append(usgs(2))["seq"] == 3
        assert [r["seq"] for r in reopened.read_day(T0.date().isoformat())] == [1, 2, 3]
    finally:
        reopened.close()


def test_a_failed_write_stores_nothing_in_memory_or_on_disk(store, monkeypatch):
    store.append(usgs(0))
    size = segment(store).stat().st_size

    def full_disk(_fd):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(store_module.os, "fsync", full_disk)
    with pytest.raises(StoreError):
        store.append(usgs(1))
    monkeypatch.undo()
    assert segment(store).stat().st_size == size  # rolled back
    assert not store.has(usgs(1).source, usgs(1).source_id, usgs(1).revision)
    assert store.append(usgs(1))["seq"] == 2  # not a phantom duplicate; seq not burnt


def test_one_invalid_item_aborts_the_whole_batch(store):
    bad = {**usgs(1).as_dict(), "confidence": "SURE"}
    with pytest.raises(StoreError):
        store.append_many([usgs(0), bad])
    assert not segment(store).exists() and store.append(usgs(0))["seq"] == 1


def test_one_bad_day_does_not_block_sealing_or_startup(tmp_path, clock):
    s = LiveStore(tmp_path / "live", clock=clock)
    s.append(usgs(0))
    clock.advance(days=1)
    s.append_many([usgs(1), usgs(2)])
    s.close()
    clock.advance(days=1)
    first = segment(s, "2026-11-14")
    first.write_bytes(first.read_bytes() + b"not json\n")  # damaged mid-file, not a torn tail
    w = LiveStore(tmp_path / "live", clock=clock)  # startup survives
    try:
        assert w.append(fixture_observations()["nws"][0])["seq"] == 4  # seq never reused
        sealed = w.seal_closed_days()
        assert [m["day"] for m in sealed] == ["2026-11-15"]
        assert "2026-11-14" in w.seal_errors
        service = LiveService(w, feeds=[], risk=None, clock=clock)
        assert "2026-11-14" in service.health()["store"]["seal_errors"]
    finally:
        w.close()


def test_a_second_writer_is_refused_in_process_and_across_processes(store, tmp_path):
    with pytest.raises(StoreError, match="held by another writer"):
        LiveStore(store.root)
    LiveStore(store.root, readonly=True)  # readers never take the lock
    code = ("import sys; from src.live.store import LiveStore, StoreError\n"
            "try:\n    LiveStore(sys.argv[1])\nexcept StoreError:\n    sys.exit(3)\n")
    result = subprocess.run([sys.executable, "-c", code, str(store.root)], cwd=store_module.PROJECT_ROOT,
                            capture_output=True, timeout=120)
    assert result.returncode == 3, result.stderr[-500:]
    store.close()
    LiveStore(store.root).close()


# -- the four guards that did not bite ----------------------------------------------------

def test_guard_refuses_appending_into_a_sealed_day(tmp_path, clock):
    s = LiveStore(tmp_path / "live", clock=clock)
    s.append(usgs(0))
    clock.advance(days=1)
    s.seal_day("2026-11-14")
    s.close()
    clock.advance(days=-1)  # wall clock wrong after a restart: stamps would land in the sealed day
    s = LiveStore(tmp_path / "live", clock=clock)
    try:
        with pytest.raises(StoreError, match="is sealed"):
            s.append(usgs(1))
    finally:
        s.close()


def test_guard_refuses_sealing_out_of_order_or_duplicate_seq(store, clock):
    store.append_many(fixture_observations()["usgs"])
    lines = segment(store).read_bytes().splitlines()
    segment(store).write_bytes(b"\n".join([lines[1], lines[0], lines[2]]) + b"\n")
    clock.advance(days=1)
    with pytest.raises(StoreError, match="append order"):
        store.seal_day("2026-11-14")
    segment(store).write_bytes(b"\n".join([lines[0], lines[0], lines[2]]) + b"\n")
    with pytest.raises(StoreError, match="append order"):
        store.seal_day("2026-11-14")


def test_guard_refuses_sealing_a_record_from_another_day(store, clock):
    store.append_many(fixture_observations()["usgs"])
    raw = segment(store).read_bytes()
    segment(store).write_bytes(raw.replace(b'"available_at":"2026-11-14', b'"available_at":"2026-11-13', 1))
    clock.advance(days=1)
    with pytest.raises(StoreError, match="another day"):
        store.seal_day("2026-11-14")


def test_guard_refuses_nan_and_infinity(store):
    for bad in (float("nan"), float("inf")):
        row = usgs(0)
        with pytest.raises(StoreError, match="not finite"):
            store.append(replace(row, payload={**row.payload, "mag": bad}))
    assert not segment(store).exists()


# -- time bounds, clocks, manifests --------------------------------------------------------

def test_times_after_ingestion_are_clamped_within_skew_and_refused_beyond(store, clock):
    soon = model.iso(clock.now + pd.Timedelta(minutes=5))
    later = model.iso(clock.now + pd.Timedelta(hours=1))
    row = usgs(0)
    record = store.append(replace(row, observed_at=soon, effective_at=soon))
    assert record["observed_at"] == record["available_at"] == record["effective_at"]
    assert record["provenance"]["observed_at_clamped_from"] == soon
    for field in ("observed_at", "effective_at"):
        with pytest.raises(StoreError, match="after ingestion"):
            store.append(replace(usgs(1), **{field: later}))
    with pytest.raises(StoreError, match="after ingestion"):
        store.append(replace(usgs(1), provenance={**usgs(1).provenance, "fetched_at": later}))


def test_wall_clock_jump_forward_is_flagged(tmp_path, monkeypatch):
    s = LiveStore(tmp_path / "live")
    try:
        now = model.iso(model.utcnow())
        row = lambda i: replace(usgs(i), provenance={**usgs(i).provenance, "fetched_at": now})  # noqa: E731
        s.append(row(0))
        base = s._last_mono
        monkeypatch.setattr(store_module.time, "monotonic", lambda: base - 120.0)
        flagged = s.append(row(1))
        assert flagged["provenance"]["clock_jump_forward_s"] >= 119
    finally:
        s.close()


def test_manifest_cannot_point_outside_its_content_address(store, clock):
    store.append(usgs(0))
    clock.advance(days=1)
    manifest = store.seal_day("2026-11-14")
    path = store.sealed / "2026-11-14.manifest.json"
    path.write_text(json.dumps({**manifest, "file": "../segments/2026-11-14.jsonl"}), encoding="utf-8")
    with pytest.raises(StoreError, match="unexpected file"):
        store.read_day("2026-11-14")


# -- revisions -----------------------------------------------------------------------------

def test_content_revisions_keep_a_return_to_an_earlier_value(store, clock):
    row = fixture_observations()["eia"][0]
    assert row.provenance["revision_basis"] == "CONTENT_HASH"
    a = row
    b = replace(row, revision=content_revision({"value": "1.0", "units": "$/BBL"}))
    stored = [store.append(x) for x in (a, a, b, b, a, a)]
    kept = [r["revision"] for r in stored if r]
    assert kept == [a.revision, b.revision, a.revision + "~1"]
    store.close()
    again = LiveStore(store.root, clock=clock)
    try:
        assert again.append(a) is None  # latest is A~1: a repeat of A is still a duplicate after restart
    finally:
        again.close()


def test_source_version_feeds_stay_idempotent_across_repeated_full_fetches(store):
    fred = fixture_observations()["fred"]
    assert len(store.append_many(fred)) == len(fred)
    assert store.append_many(fred) == []


def test_kalshi_zero_price_without_trades_is_not_measured():
    raw = json.dumps({"events": [{"category": "Economics", "title": "Synthetic", "markets": [
        {"ticker": "SYN-1", "status": "active", "last_price_dollars": "0.0000", "yes_bid_dollars": "0.0000",
         "yes_ask_dollars": "0.0300", "volume_fp": "0.00", "volume_24h_fp": "0.00",
         "updated_time": "2026-11-14T04:00:00Z"}]}]}).encode()
    obs = Kalshi().parse(Fetched(raw, "fixture:synthetic", model.iso(T0)))
    assert obs[0].payload["yes_price"] is None and obs[0].payload["yes_bid"] is None
    assert obs[0].payload["price_status"].startswith("NOT_MEASURED")
    t = Triggers()
    record = {"id": "k" * 64, "seq": 1, "type": "prediction.update", "source": "kalshi", "source_id": "SYN-1",
              "available_at": model.iso(T0), "observed_at": model.iso(T0), "licence": {"status": "UNVERIFIED"},
              "payload": obs[0].payload}
    assert t.evaluate(record) == [] and "SYN-1" not in t._last_yes


def test_nse_close_is_stamped_at_the_session_close(tmp_path, monkeypatch):
    from src.data_organ.calendars import nse_evidence

    csv = ("SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,TOTTRDQTY,TIMESTAMP\n"  # SYNTHETIC test data
           "SYNTH,EQ,10,11,9,10.5,100,2026-11-13\n")
    bhav = tmp_path / "bhav.csv"
    bhav.write_text(csv, encoding="utf-8")
    calendar = nse_evidence(b"synthetic", source_url="https://www.nseindia.com/synthetic", version="test",
                            start="2026-11-01", end="2026-11-14", session_dates=["2026-11-13"])
    cal = tmp_path / "cal.json"
    cal.write_text(json.dumps(calendar), encoding="utf-8")
    monkeypatch.setenv("FINSIGHT_NSE_BHAVCOPY", str(bhav))
    monkeypatch.setenv("FINSIGHT_NSE_CALENDAR", str(cal))
    monkeypatch.setenv("FINSIGHT_LIVE_NSE_TICKERS", "SYNTH.NS")
    obs = NSEEndOfDay().fetch()
    assert [o.observed_at for o in obs] == ["2026-11-13T10:00:00Z"]
    assert obs[0].payload["close"] == 10.5


# -- runtime: poison rows, triggers, listeners, replay of open days, risk restore -----------

def test_a_bad_row_is_rejected_alone_and_trigger_failures_do_not_stop_ingest(store, clock):
    service = LiveService(store, feeds=[], risk=None, clock=clock)
    rows = fixture_observations()["usgs"]
    bad = replace(rows[1], observed_at="not a time")
    service.triggers.evaluate = lambda record: (_ for _ in ()).throw(ValueError("trigger bug"))
    service.bus.on_event(lambda e: 1 / 0)  # a broken listener must not break ingestion either
    stored, rejected = service.ingest([rows[0], bad, rows[2]])
    assert len(stored) == 2 and rejected == 1


def test_a_revised_quake_is_suggested_once(store, clock):
    service = LiveService(store, feeds=[], risk=None, clock=clock)
    strong = replace(usgs(0), source_id="synthetic-m7", payload={**usgs(0).payload, "mag": 7.1,
                                                                 "lat": 24.5, "lon": 121.5})
    service.ingest([strong])
    clock.advance(minutes=3)
    service.ingest([replace(strong, revision=strong.revision + "1", payload={**strong.payload, "mag": 7.2})])
    assert len(store.since(None, types={"research.progress"})) == 1


def test_replay_includes_the_open_day_after_sealed_ones(tmp_path, clock):
    s = LiveStore(tmp_path / "live", clock=clock)
    s.append(usgs(0))
    clock.advance(days=1)
    s.seal_day("2026-11-14")
    s.append(usgs(1))
    s.close()
    offline = LiveService(LiveStore(tmp_path / "live", clock=clock, readonly=True), mode="offline", clock=clock)
    assert asyncio.run(offline.replay(speed=0)) == 2


def test_risk_restore_clears_a_finding_left_open_before_a_restart(tmp_path, clock):
    s = LiveStore(tmp_path / "live", clock=clock)
    service = LiveService(s, feeds=[], risk=LiveRisk(), clock=clock)
    snap = {"feed": "x", "status": "DOWN", "consecutive_failures": 3, "last_error": "HTTP 500",
            "error_rate": 1.0, "partial_errors": [], "rejected_last": 0, "lag_s": None, "cadence_s": 60}
    service.record_health({**snap, "attempts": 3, "last_attempt_at": None})
    s.close()
    s = LiveStore(tmp_path / "live", clock=clock)
    try:
        fresh = LiveRisk()
        fresh.restore(s.records({"risk.alert"}))
        up = {**snap, "status": "UP", "consecutive_failures": 0, "error_rate": 0.0}
        cleared = fresh.evaluate(up, {"seq": 99, "id": "h" * 64, "available_at": model.iso(clock.now)})
        assert [(a.payload["rule_id"], a.payload["outcome"]) for a in cleared] == [("R-DATA-ATTEMPT", "CLEAR")]
        assert LiveRisk().evaluate(up, {"seq": 99, "id": "h" * 64, "available_at": model.iso(clock.now)}) == []
    finally:
        s.close()


# -- scheduler -------------------------------------------------------------------------------

def test_retry_after_is_capped():
    feed = FixtureFeed("x", cadence_s=86400, min_interval_s=10)
    assert failure_delay(feed, 1, __import__("random").Random(0), retry_after=10 ** 7) == MAX_BACKOFF_S


def test_no_second_fetch_while_a_timed_out_one_is_still_running():
    release = threading.Event()

    class Slow(FixtureFeed):
        def fetch(self):
            self.calls += 1
            release.wait(5)
            return []

    feed = Slow("slow")

    async def nothing(*_):
        return (0, 0)

    async def go():
        scheduler = Scheduler([feed], on_result=nothing, on_health=nothing, fetch_timeout_s=0.05)
        first = await scheduler.run_once("slow")
        second = await scheduler.run_once("slow")
        release.set()
        await asyncio.sleep(0.2)
        third = await scheduler.run_once("slow")
        return first, second, third

    first, second, third = asyncio.run(go())
    assert first["last_error"].startswith("TimeoutError") and first["attempts"] == 1
    assert second["attempts"] == 1 and second["last_error"].startswith("SKIPPED")
    assert third["attempts"] == 2 and feed.calls == 2


# -- transport -------------------------------------------------------------------------------

class FakeResponse:
    def __init__(self, status=200, chunks=(b"ok",), headers=None):
        self.status_code, self._chunks, self.headers = status, chunks, headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_content(self, _size):
        yield from self._chunks


def test_http_get_never_follows_redirects_and_stops_at_the_byte_cap(monkeypatch):
    seen = {}

    def fake_get(url, **kwargs):
        seen.update(kwargs)
        return FakeResponse(status=302)

    monkeypatch.setattr(feed_base.requests, "get", fake_get)
    with pytest.raises(FeedError, match="HTTP 302"):
        feed_base.http_get("https://example.invalid/x")
    assert seen["allow_redirects"] is False and seen["stream"] is True
    monkeypatch.setattr(feed_base.requests, "get", lambda url, **kw: FakeResponse(chunks=[b"x" * 600] * 10))
    with pytest.raises(FeedError, match="exceeds 1000 bytes"):
        feed_base.http_get("https://example.invalid/x", max_bytes=1000)


def test_gdelt_follows_only_its_own_host_and_bounds_the_archive(monkeypatch):
    index = b"100 abc https://evil.example/gdeltv2/20261114060000.export.CSV.zip\n"
    monkeypatch.setattr(geo_feeds, "http_get", lambda url, **kw: Fetched(index, url, model.iso(T0)))
    with pytest.raises(FeedError, match="unexpected export entry"):
        GDELTEvents().fetch()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("a.CSV", "x")
        z.writestr("b.CSV", "y")
    with pytest.raises(FeedError, match="one bounded CSV"):
        GDELTEvents().parse(Fetched(buf.getvalue(), "fixture:", model.iso(T0)))
    small = GDELTEvents()
    small.max_csv_bytes = 100
    with pytest.raises(FeedError):
        small.parse(fetched("gdelt_export.zip"))


def test_rss_with_doctype_or_entities_is_refused():
    bomb = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa">]><rss><channel><item><title>&a;</title>' \
           b'<link>https://x</link></item></channel></rss>'
    with pytest.raises(ValueError, match="DOCTYPE or ENTITY"):
        parse_rss(bomb)


def test_frontend_child_gets_no_provider_credentials():
    from finsight.live_cli import frontend_env

    env = frontend_env({"FRED_API_KEY": "x", "APCA_API_SECRET_KEY": "y", "VERCEL_OIDC_TOKEN": "z",
                        "PATH": "p", "VITE_API_BASE_URL": "http://h"}, "http://127.0.0.1:8000")
    assert set(env) == {"PATH", "VITE_API_BASE_URL", "VITE_ENABLE_LOCAL_LIVE"}


# -- SSE ---------------------------------------------------------------------------------------

def events_of(frames):
    return [(f.get("event"), json.loads(f["data"]).get("seq")) for f in frames]


@pytest.fixture
def offline_service(tmp_path, clock):
    from src.live import runtime

    bus = Bus(history=3)
    svc = LiveService(None, bus=bus, feeds=[], mode="offline", clock=clock)
    with LiveStore(tmp_path / "rec", clock=clock) as s:
        records = s.append_many(fixture_observations()["usgs"] + fixture_observations()["nws"])
    svc.records = records
    runtime.set_service(svc)
    yield svc
    runtime.set_service(None)


def test_offline_stream_dedupes_events_racing_the_backlog(monkeypatch, offline_service):
    svc, recs = offline_service, offline_service.records
    for r in recs[:3]:
        svc.bus.publish(r)
    original = svc.backlog

    def racing(after, types):
        events, first = original(after, types)
        svc.bus.publish(events[-1])  # the replay publishes it again while the client connects
        svc.bus.publish(recs[3])
        return events, first

    svc.backlog = racing
    with client(monkeypatch).stream("GET", "/live/stream?since_seq=0&max_events=4") as response:
        frames = parse_sse("".join(response.iter_text()))
    assert [s for _, s in events_of(frames) if _ != "gap"] == [1, 2, 3, 4]


def test_stream_reports_gaps_for_history_and_slow_clients(monkeypatch, offline_service):
    svc, recs = offline_service, offline_service.records
    for r in recs[:5]:
        svc.bus.publish(r)  # ring holds only seq 3..5
    with client(monkeypatch).stream("GET", "/live/stream?since_seq=0&max_events=3") as response:
        frames = parse_sse("".join(response.iter_text()))
    assert events_of(frames)[0][0] == "gap" and json.loads(frames[0]["data"])["first_available_seq"] == 3
    assert [s for e, s in events_of(frames)[1:]] == [3, 4, 5]

    svc.bus.subscribe = partial(Bus.subscribe, svc.bus, maxsize=1)
    original = svc.backlog

    def flood(after, types):
        result = original(after, types)
        for n in (101, 102, 103):  # three events into a queue of one: two are dropped
            svc.bus.publish({**recs[-1], "seq": n})
        return result

    svc.backlog = flood
    with client(monkeypatch).stream("GET", "/live/stream?since_seq=5&max_events=1") as response:
        frames = parse_sse("".join(response.iter_text()))
    assert frames[0]["event"] == "gap" and json.loads(frames[0]["data"])["dropped"] == 2
    assert json.loads(frames[1]["data"])["seq"] == 103


def test_online_backlog_older_than_the_ring_is_served_from_the_store(monkeypatch, tmp_path, clock):
    from src.live import runtime

    s = LiveStore(tmp_path / "live", clock=clock)
    svc = LiveService(s, bus=Bus(history=2), feeds=[], risk=None, clock=clock)
    svc.ingest(fixture_observations()["usgs"] + fixture_observations()["nws"][:2])
    runtime.set_service(svc)
    try:
        with client(monkeypatch).stream("GET", "/live/stream?since_seq=0&max_events=5") as response:
            frames = parse_sse("".join(response.iter_text()))
        assert [s for _, s in events_of(frames)] == [1, 2, 3, 4, 5]
    finally:
        runtime.set_service(None)
        s.close()
