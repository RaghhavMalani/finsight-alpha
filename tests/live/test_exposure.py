"""Live quakes become sourced-exposure suggestions, read from the graph as of when each was stored."""
from dataclasses import replace

import pytest

from src.geo.graph import load_graph
from src.live import exposure
from src.live.runtime import LiveService
from src.live.store import LiveStore
from tests.live.helpers import Clock, fixture_observations


def quake(mag, lat, lon, *, observed="2026-11-14T11:58:00.000000Z", available="2026-11-14T12:00:00.000000Z"):
    return {"id": "x" * 64, "seq": 1, "type": "geo.event", "source": "usgs", "source_id": "test-quake",
            "available_at": available, "observed_at": observed, "effective_at": None,
            "licence": {"status": "PUBLIC_DOMAIN"},
            "payload": {"kind": "earthquake", "mag": mag, "lat": lat, "lon": lon, "place": "test place"}}


def test_a_quake_near_mapped_fabs_suggests_a_question_with_cited_tickers():
    [s] = exposure.suggest(quake(6.8, 23.9, 121.6))
    assert s.type == "research.progress" and s.source == "finsight:exposure"
    p = s.payload
    assert p["status"] == "SUGGESTED" and p["auto_run"] is False and p["model_calls"] == 0 and p["cost_usd"] == 0
    tickers = [row["ticker"] for row in p["exposure"]["securities"]]
    assert tickers[0] == "TSM" and {"NVDA", "AMD", "ADI"} <= set(tickers)
    assert all(t in p["question"] for t in ("M6.8", "TSM", "NVDA", "AMD"))
    for row in p["exposure"]["securities"]:
        assert row["hops"] and 0 < row["score"] <= 1 and row["site_precision"]
        for hop in row["hops"]:
            assert hop["source_url"].startswith("https://") and hop["mechanism"] and hop["source_date_basis"]
    graph = load_graph()
    assert s.provenance["content_sha256"] == graph.sha256 == p["exposure"]["graph"]["sha256"]
    assert s.revision == "v1"  # one suggestion per quake; the graph hash lives in provenance
    top = p["exposure"]["securities"][0]  # the question names the site carrying the strongest chain
    assert graph.nodes[top["site"]].name in p["question"] and f"{top['distance_km']} km" in p["question"]


def test_the_graph_is_cut_at_the_quake_origin_time():
    """Sabotage: cutting the graph at the storage time instead of the origin time makes this fail."""
    # Originated before any source in the graph had been checked: nothing may be suggested,
    # even when the record is stored (backfilled) days later.
    early = quake(6.8, 23.9, 121.6, observed="2026-11-13T09:58:00.000000Z", available="2026-11-13T10:00:00.000000Z")
    assert exposure.suggest(early) == []
    backfilled = quake(6.8, 23.9, 121.6, observed="2026-11-13T09:58:00.000000Z",
                       available="2026-11-16T10:00:00.000000Z")
    assert exposure.suggest(backfilled) == []
    # Originated on 14 Nov: the Apple edges were only checked on 15 Nov, so AAPL must be absent,
    # again even if the record is stored after they were known.
    for available in ("2026-11-14T12:00:00.000000Z", "2026-11-16T10:00:00.000000Z"):
        [mid] = exposure.suggest(quake(6.8, 23.9, 121.6, available=available))
        assert "AAPL" not in {r["ticker"] for r in mid.payload["exposure"]["securities"]}
    [late] = exposure.suggest(quake(6.8, 23.9, 121.6, observed="2026-11-16T09:58:00.000000Z",
                                    available="2026-11-16T10:00:00.000000Z"))
    assert "AAPL" in {r["ticker"] for r in late.payload["exposure"]["securities"]}


@pytest.mark.parametrize("record", [
    quake(4.9, 24.8, 120.97),          # below the declared threshold
    quake(7.5, -60.0, -30.0),          # no sourced site in range
    quake(7.5, None, None),            # no location: no guess
    quake(None, 24.8, 120.97),         # no magnitude: no guess
    quake("6.8", 23.9, 121.6),         # a magnitude that is not a number: no guess
    quake(float("nan"), 23.9, 121.6),  # not a finite magnitude
    quake(7.0, 26.57, 56.25),          # near Hormuz: a site, but no sourced link to a security
    {**quake(6.8, 23.9, 121.6), "type": "market.tick"},
    {**quake(6.8, 23.9, 121.6), "observed_at": "not a time"},
])
def test_no_suggestion_without_sourced_exposure(record):
    assert exposure.suggest(record) == []


def test_the_service_stores_one_exposure_suggestion_per_quake(tmp_path):
    clock = Clock()
    store = LiveStore(tmp_path / "live", clock=clock)
    service = LiveService(store, feeds=[], risk=None, clock=clock)
    base = fixture_observations()["usgs"][0]
    # The fixture quake predates the graph, so by design it would get no exposure; use a later one.
    strong = replace(base, source_id="synthetic-m7", observed_at="2026-11-14T11:58:00.000000Z",
                     effective_at="2026-11-14T11:59:00.000000Z",
                     payload={**base.payload, "mag": 7.1, "lat": 24.5, "lon": 121.5})
    service.ingest([strong])
    clock.advance(minutes=3)
    service.ingest([replace(strong, revision=strong.revision + "1", payload={**strong.payload, "mag": 7.2})])
    suggestions = store.since(None, types={"research.progress"})
    by_source = [s["source"] for s in suggestions]
    # A revised quake is the same quake. Near a hub it gets both suggestions, once each.
    assert by_source.count("finsight:exposure") == 1 and by_source.count("finsight:triggers") == 1
    stored = next(s for s in suggestions if s["source"] == "finsight:exposure")
    assert stored["payload"]["exposure"]["securities"][0]["ticker"] == "TSM"
    assert stored["available_at"] >= stored["observed_at"] and stored["licence"]["redistribution"] == "LOCAL_ONLY"
    store.close()


def test_a_failing_exposure_step_loses_neither_the_hub_trigger_nor_later_rows(tmp_path, monkeypatch):
    clock = Clock()
    store = LiveStore(tmp_path / "live", clock=clock)
    service = LiveService(store, feeds=[], risk=None, clock=clock)
    rows = fixture_observations()["usgs"]
    strong = replace(rows[0], source_id="synthetic-m7", observed_at="2026-11-14T11:58:00.000000Z",
                     effective_at="2026-11-14T11:59:00.000000Z",
                     payload={**rows[0].payload, "mag": 7.1, "lat": 24.5, "lon": 121.5})

    def broken(record):
        raise FileNotFoundError("seed unreadable")  # not one of the store error types

    monkeypatch.setattr(exposure, "suggest", broken)
    stored, rejected = service.ingest([strong, rows[1], rows[2]])
    assert len(stored) == 3 and rejected == 0
    assert [s["source"] for s in store.since(None, types={"research.progress"})] == ["finsight:triggers"]
    store.close()


def test_feed_free_text_is_bounded_and_printable():
    record = quake(6.8, 23.9, 121.6)
    record["payload"]["place"] = "near Hualien" + chr(10) + chr(0) + "x" * 500
    [s] = exposure.suggest(record)
    assert chr(10) not in s.payload["question"] and chr(0) not in s.payload["question"]
    assert len(s.payload["question"]) < 400
