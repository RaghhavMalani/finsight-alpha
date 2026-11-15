"""Feed parsers on recorded fixtures, research-trigger suggestions, opt-in network smoke test."""

import os

import pytest

from src.live import model
from src.live.feeds import USGSQuakes
from src.live.runtime import LiveService
from src.live.store import LiveStore
from src.live.triggers import Triggers
from tests.live.helpers import Clock, fixture_observations


def test_parsers_label_delay_licence_and_never_invent_values():
    obs = fixture_observations()
    assert len(obs["usgs"]) == 3 and {o.confidence for o in obs["usgs"]} <= {"OFFICIAL", "PROVISIONAL"}
    zone_coded = [o for o in obs["nws"] if o.payload["lat"] is None]
    assert zone_coded and all(o.payload["location_basis"].startswith("NOT_MEASURED") for o in zone_coded)
    assert all(o.payload["quad_class"] in (3, 4) and o.payload["lat"] is not None for o in obs["gdelt"])
    # GDELT labels batches by window END and publishes early (seen live: label 06:30 fetched 06:19).
    assert {(o.payload["gdelt_dateadded"], o.observed_at) for o in obs["gdelt"]} == {
        ("20261114060000", "2026-11-14T05:45:00.000000Z")}
    assert all(o.revision.startswith("vintage:") for o in obs["fred"])
    assert all(o.payload["kind"] == "eia_spot" and o.effective_at is None for o in obs["eia"])  # no release time given
    assert [o.source_id for o in obs["polymarket"]] == ["900001"]  # sports market skipped
    assert obs["polymarket"][0].payload["yes_price"] == 0.42
    assert [o.source_id for o in obs["kalshi"]] == ["SYNTH-EV1-A"]  # category filter
    assert all(o.licence["redistribution"] == "LOCAL_ONLY" for o in obs["polymarket"] + obs["kalshi"])
    assert all(o.payload.get("title") and "body" not in o.payload for o in obs["rss"])
    for rows in obs.values():
        for o in rows:
            assert o.provenance["delay"] and o.provenance["content_sha256"]
            assert "api_key" not in o.provenance["url"]


def quake(mag, lat, lon):
    return {"id": "x" * 64, "seq": 1, "type": "geo.event", "source": "usgs", "source_id": "test",
            "available_at": "2026-11-14T12:00:00.000000Z", "observed_at": "2026-11-14T11:58:00.000000Z",
            "effective_at": None, "licence": {"status": "PUBLIC_DOMAIN"},
            "payload": {"kind": "earthquake", "mag": mag, "lat": lat, "lon": lon, "place": "test place"}}


def test_triggers_suggest_and_never_run():
    t = Triggers()
    near_tokyo = t.evaluate(quake(6.4, 35.0, 140.0))
    assert len(near_tokyo) == 1
    s = near_tokyo[0]
    assert s.type == "research.progress" and s.payload["status"] == "SUGGESTED"
    assert s.payload["hub"] == "Tokyo" and s.payload["auto_run"] is False and s.payload["cost_usd"] == 0
    assert "M6.4" in s.payload["question"]
    assert t.evaluate(quake(5.9, 35.0, 140.0)) == []  # below threshold
    assert t.evaluate(quake(7.5, -60.0, -30.0)) == []  # far from every hub
    assert t.evaluate(quake(7.5, None, None)) == []  # no location: no guess


def test_prediction_move_and_fresh_macro_revision_triggers():
    t = Triggers()
    base = {"id": "p" * 64, "seq": 1, "type": "prediction.update", "source": "kalshi", "source_id": "M1",
            "available_at": "2026-11-14T12:00:00.000000Z", "observed_at": "2026-11-14T12:00:00.000000Z",
            "licence": {"status": "UNVERIFIED"},
            "payload": {"kind": "prediction_market", "venue": "kalshi", "question": "Q?", "yes_price": 0.30}}
    assert t.evaluate(base) == []  # first sighting: no prior, no move
    moved = t.evaluate({**base, "payload": {**base["payload"], "yes_price": 0.45}})
    assert len(moved) == 1 and "15.0 pp" in moved[0].payload["question"]
    macro = {"id": "m" * 64, "seq": 2, "type": "macro.release", "source": "fred", "source_id": "UNRATE:2026-09-01",
             "available_at": "2026-11-14T12:00:00.000000Z", "observed_at": "2026-09-01T00:00:00.000000Z",
             "effective_at": "2026-11-13T05:00:00.000000Z", "licence": {"status": "PUBLIC_DOMAIN"},
             "payload": {"kind": "fred_vintage", "series": "UNRATE", "period": "2026-09-01", "value": 4.3,
                         "previous_vintage_value": 4.2, "is_revision": True, "vintage": "2026-11-12"}}
    assert len(t.evaluate(macro)) == 1
    stale = {**macro, "effective_at": "2026-01-01T05:00:00.000000Z"}
    assert t.evaluate(stale) == []  # an old revision seen for the first time is history, not news


def test_suggestions_are_stored_with_provenance_linking_their_input(tmp_path):
    clock = Clock()
    service = LiveService(LiveStore(tmp_path / "live", clock=clock), feeds=[], risk=None, clock=clock)
    usgs = fixture_observations()["usgs"][0]
    strong = usgs.__class__(**{**usgs.as_dict(), "source_id": "synthetic-m7",
                               "payload": {**usgs.payload, "mag": 7.1, "lat": 24.5, "lon": 121.5}})
    stored, _ = service.ingest([strong])
    suggestions = service.store.since(None, types={"research.progress"})
    assert len(suggestions) == 1
    assert suggestions[0]["provenance"]["inputs"][0]["id"] == stored[0]["id"]
    assert suggestions[0]["payload"]["hub"] == "Hsinchu"
    assert model.parse_iso(suggestions[0]["available_at"]) >= model.parse_iso(stored[0]["available_at"])


@pytest.mark.skipif(os.getenv("FINSIGHT_NETWORK_TESTS") != "1", reason="set FINSIGHT_NETWORK_TESTS=1 for network")
def test_live_smoke_usgs(tmp_path):
    rows = USGSQuakes().fetch()
    assert rows, "USGS 2.5_day feed returned no events"
    store = LiveStore(tmp_path / "live")
    assert len(store.append_many(rows)) == len(rows)
    assert store.append_many(rows) == []
