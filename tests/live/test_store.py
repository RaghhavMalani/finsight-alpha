"""Append-only store: provenance completeness, idempotency, backdating sabotage, sealing."""

import json

import pytest

from src.live import model
from src.live.runtime import LiveService
from src.live.store import LiveStore, StoreError
from tests.live.helpers import T0, Clock, fixture_observations


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def store(tmp_path, clock):
    return LiveStore(tmp_path / "live", clock=clock)


def test_every_stored_row_has_every_provenance_field(store, clock):
    service = LiveService(store, feeds=[], risk=None)
    total = 0
    for name, rows in fixture_observations().items():
        stored, rejected = service.ingest(rows)
        assert rejected == 0, name
        assert stored, f"{name} produced no rows"
        total += len(rows)
        clock.advance(seconds=1)
    records = store.read_day(T0.date().isoformat())
    assert len(records) >= total  # plus any trigger suggestions
    for r in records:
        assert set(model.REQUIRED_FIELDS) <= set(r), r["source"]
        for key in ("source", "source_id", "revision", "observed_at", "available_at", "confidence", "type"):
            assert r[key] not in (None, ""), (r["source"], key)
        assert r["confidence"] in model.CONFIDENCE
        assert r["type"] in model.EVENT_TYPES
        assert all(r["licence"].get(k) for k in model.LICENCE_FIELDS), r["source"]
        assert all(k in r["provenance"] for k in model.PROVENANCE_FIELDS), r["source"]
        assert r["provenance"]["delay"], "every row carries its delay label"
        assert r["id"] == model.record_id(r["source"], r["source_id"], r["revision"])
        stamp = model.parse_iso(r["available_at"])
        assert stamp >= model.parse_iso(r["observed_at"])  # nothing is known before it is ingested
        assert r["effective_at"] is None or stamp >= model.parse_iso(r["effective_at"])
        assert stamp >= model.parse_iso(r["provenance"]["fetched_at"])
    seqs = [r["seq"] for r in records]
    assert seqs == list(range(1, len(records) + 1))


def test_same_source_id_revision_is_stored_once(store, clock):
    row = fixture_observations()["usgs"][0]
    assert store.append(row) is not None
    clock.advance(minutes=5)
    assert store.append(row) is None
    assert store.append(row.as_dict()) is None
    store.close()
    reopened = LiveStore(store.root, clock=clock)  # idempotent across restarts too
    assert reopened.append(row) is None
    lines = (store.segments / f"{T0.date()}.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    revised = row.__class__(**{**row.as_dict(), "revision": row.revision + "-next"})
    assert reopened.append(revised)["seq"] == 2  # a new revision is a new row, never an overwrite


def test_backdating_feed_cannot_set_available_at(store, clock):
    """Sabotage: a feed claims it knew this in 2020. The store stamps ingestion time."""
    row = fixture_observations()["usgs"][0].as_dict()
    row["available_at"] = "2020-01-01T00:00:00Z"
    record = store.append(row)
    assert record["available_at"] == model.iso(clock.now)
    assert record["provenance"]["feed_claimed_available_at"] == "2020-01-01T00:00:00Z"
    on_disk = json.loads((store.segments / f"{T0.date()}.jsonl").read_text(encoding="utf-8"))
    assert on_disk["available_at"] == model.iso(clock.now)
    assert not (store.segments / "2020-01-01.jsonl").exists()


def test_stamps_never_go_backwards_when_the_wall_clock_does(store, clock):
    rows = fixture_observations()["celestrak"]
    first = store.append(rows[0])
    clock.advance(hours=-1)
    second = store.append(rows[1])
    assert second["available_at"] == first["available_at"]


def test_future_observation_is_refused(store, clock):
    row = fixture_observations()["usgs"][0].as_dict()
    row["observed_at"] = model.iso(clock.now.replace(year=2027))
    with pytest.raises(StoreError):
        store.append(row)


def test_incomplete_provenance_is_refused(store):
    row = fixture_observations()["usgs"][0].as_dict()
    row["provenance"] = {k: v for k, v in row["provenance"].items() if k != "content_sha256"}
    with pytest.raises(StoreError):
        store.append(row)
    row = fixture_observations()["usgs"][0].as_dict()
    row["licence"] = {**row["licence"], "terms_url": ""}
    with pytest.raises(StoreError):
        store.append(row)


def test_store_refuses_a_root_inside_the_repository():
    from src.live.store import PROJECT_ROOT

    with pytest.raises(StoreError):
        LiveStore(PROJECT_ROOT / "data" / "live")


def test_seal_day_is_content_addressed_idempotent_and_tamper_evident(store, clock):
    store.append_many(fixture_observations()["usgs"])
    day = T0.date().isoformat()
    with pytest.raises(StoreError):
        store.seal_day(day)  # still open
    clock.advance(days=1)
    manifest = store.seal_day(day)
    assert manifest["rows"] == 3 and manifest["day"] == day
    assert manifest["file"] == f"{day}.{manifest['sha256'][:16]}.jsonl"
    assert model.sha256_hex((store.sealed / manifest["file"]).read_bytes()) == manifest["sha256"]
    assert store.seal_day(day) == manifest
    assert store.read_day(day) == [json.loads(l) for l in
                                   (store.segments / f"{day}.jsonl").read_text(encoding="utf-8").splitlines()]
    (store.sealed / manifest["file"]).write_bytes(b"{}\n")
    with pytest.raises(StoreError):
        store.read_day(day)
    with (store.segments / f"{day}.jsonl").open("a", encoding="utf-8") as handle:
        handle.write("{}\n")
    with pytest.raises(StoreError):
        store.seal_day(day)
