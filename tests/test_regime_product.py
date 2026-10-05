"""Product contracts using SIMULATED publications, never real-market evidence."""

from __future__ import annotations

import copy
from datetime import timedelta
import json

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from backend.main import app
from backend.routes import regime_product as routes
from src.dynamics.market_regime_fixture import demo_world
from src.dynamics.market_regime_inputs import digest, utc, vintage
from src.dynamics.market_regime_projection import RegimeEvidenceError
from src.regime_intelligence.contracts import PITDataset, to_world, visible_payload
from src.regime_intelligence.providers import (
    FredVintageProvider,
    VersionedExportProvider,
    alfred_observations,
    publication_csv,
)
from src.regime_intelligence import service


@pytest.fixture(scope="module")
def dataset():
    world = demo_world(sessions=160).payload()
    rows = []
    for stream in ("daily", "intraday", "factors", "macro", "events"):
        for index, item in enumerate(world[stream]):
            values = {
                k: v
                for k, v in item.items()
                if k not in ("observed_at", "available_at", "revision")
            }
            if stream in ("daily", "intraday"):
                values.update(
                    open=values["close"], high=values["close"], low=values["close"]
                )
            rows.append(
                {
                    "stream": stream,
                    "observed_at": item["observed_at"],
                    "available_at": item["available_at"],
                    "as_of": "2026-01-01T00:00:00Z",
                    "source": "SIMULATED CONTRACT TEST — NOT REAL MARKET DATA",
                    "revision": item.get("revision", f"test-publication:{index}"),
                    "quality": "PUBLICATION_TIMESTAMP",
                    "publication_evidence": "Deterministic test fixture, not provider evidence",
                    "values": values,
                }
            )
    return PITDataset.model_validate(
        {
            "asset": "SPY",
            "price_basis": "UNADJUSTED",
            "calendar_note": "SIMULATED weekdays; no exchange holidays; not market history",
            "definitions": {
                "liquidity": "Simulated test depth",
                "spread_bps": "Simulated quote spread",
                "factors": "Seven simulated decimal factor returns",
                "events": "Simulated aggregate timestamps",
            },
            "observations": rows,
        }
    )


@pytest.fixture(autouse=True)
def clear_product_cache():
    service._cache.clear()
    yield
    service._cache.clear()


def prefix(dataset, cutoff):
    return PITDataset.model_validate(visible_payload(dataset, cutoff))


def test_future_append_is_identical_and_does_not_refit(dataset, monkeypatch, tmp_path):
    cutoff = (
        to_world(dataset.model_dump(mode="json")).daily[130].available_at.isoformat()
    )
    initial = prefix(dataset, cutoff)
    service.install_dataset(initial, tmp_path)
    monkeypatch.setattr(service, "data_root", lambda: tmp_path)
    calls = []
    compile_original = service.compile_world

    def counted(*args, **kwargs):
        calls.append(1)
        return compile_original(*args, **kwargs)

    monkeypatch.setattr(service, "compile_world", counted)
    before = routes.snapshot("SPY", cutoff, "real")
    service.install_dataset(dataset, tmp_path)
    after = routes.snapshot("SPY", cutoff, "real")
    assert json.dumps(before, sort_keys=True) == json.dumps(after, sort_keys=True)
    assert before["snapshot_hash"] == after["snapshot_hash"] and len(calls) == 1
    # Mutating a response never corrupts a shared cache entry.
    after["analysis"]["current"]["vector"]["V"] = 999
    assert routes.snapshot("SPY", cutoff, "real") == before


def test_late_factor_and_macro_revisions_cannot_rewrite_earlier_replay(
    dataset, monkeypatch
):
    cutoff = to_world(dataset.model_dump(mode="json")).daily[100].available_at
    initial = prefix(dataset, cutoff)
    before = service.replay_dataset(initial, cutoff.isoformat())
    document = initial.model_dump(mode="json")
    revisions = []
    for stream in ("factors", "macro"):
        row = copy.deepcopy(
            next(r for r in document["observations"] if r["stream"] == stream)
        )
        row.update(
            available_at=(cutoff + timedelta(days=1)).isoformat(),
            revision="late-revision",
        )
        if stream == "factors":
            row["values"]["values"] = {k: 0.5 for k in row["values"]["values"]}
        else:
            row["values"]["value"] = 99999
        revisions.append(row)
    document["observations"].extend(revisions)
    revised = PITDataset.model_validate(document)

    def no_refit(*args, **kwargs):
        raise AssertionError("Future revisions must hit the same replay cache")

    monkeypatch.setattr(service, "compile_world", no_refit)
    assert service.replay_dataset(revised, cutoff.isoformat()) == before
    later = to_world(visible_payload(revised, cutoff + timedelta(days=2)))
    assert any(
        r.revision == "late-revision"
        for r in vintage(later.macro, cutoff + timedelta(days=2))
    )
    assert any(
        r.revision == "late-revision"
        for r in vintage(later.factors, cutoff + timedelta(days=2))
    )


def test_missing_streams_abstain_without_zero_filling(dataset):
    document = dataset.model_dump(mode="json")
    document["observations"] = [
        r for r in document["observations"] if r["stream"] == "daily"
    ]
    for row in document["observations"]:
        for name in ("liquidity", "spread_bps", "strategy_return"):
            row["values"].pop(name, None)
    data = PITDataset.model_validate(document)
    result = service.snapshot("SPY", dataset=data)
    state = result["analysis"]["current"]
    assert result["attribution_target"] == "ASSET_BUY_AND_HOLD_RETURN"
    assert all(state["vector"][key] is None for key in ("L", "F", "H", "S", "C"))
    assert (
        state["fracture"]["score"] is None
        and result["analysis"]["landscape"]["status"] == "UNAVAILABLE"
    )
    assert all(
        p["status"] == "UNAVAILABLE"
        for p in result["provenance"]
        if p["stream"] != "daily"
    )
    assert not any(result["claims"].values())


def test_complete_timeline_reuses_frozen_fracture_accounting(dataset):
    result = service.snapshot("SPY", dataset=dataset)
    assert (
        result["timeline"][-1]["fracture"] == result["analysis"]["current"]["fracture"]
    )
    for row, canonical in zip(result["timeline"], result["analysis"]["timeline"]):
        ledger = row["fracture"]
        assert (
            ledger["score"] == pytest.approx(canonical["fracture"], abs=2e-8)
            if canonical["fracture"] is not None
            else ledger["score"] is None
        )
        assert ledger["available_contribution_sum"] == pytest.approx(
            sum(v for v in ledger["contributions"].values() if v is not None), abs=2e-8
        )
        assert row["transition"] == (
            ledger["score"] is not None and ledger["score"] >= 0.10
        )
    assert len(result["analysis"]["landscape"]["cells"]) == 121


def test_compare_reads_one_dataset_and_returns_both_complete_states(
    dataset, monkeypatch
):
    reads = []

    def load(asset):
        reads.append(asset)
        return dataset

    monkeypatch.setattr(service, "load_dataset", load)
    bars = to_world(dataset.model_dump(mode="json")).daily
    result = service.compare(
        "SPY", bars[130].available_at.isoformat(), bars[-1].available_at.isoformat()
    )
    assert reads == ["SPY"]
    assert len(result["left"]["analysis"]["landscape"]["cells"]) == 121
    assert len(result["right"]["analysis"]["landscape"]["cells"]) == 121
    for key, delta in result["vector_delta"].items():
        assert delta == pytest.approx(
            result["right"]["analysis"]["current"]["vector"][key]
            - result["left"]["analysis"]["current"]["vector"][key],
            abs=2e-8,
        )


@pytest.mark.parametrize(
    "mutation",
    [
        "naive",
        "missing-time",
        "future-availability",
        "ohlc",
        "bool",
        "nan",
        "unknown",
        "duplicate",
        "factor-bool",
        "undefined-spread",
    ],
)
def test_invalid_inputs_refused_before_installation(dataset, mutation):
    document = prefix(
        dataset, to_world(dataset.model_dump(mode="json")).daily[2].available_at
    ).model_dump(mode="json")
    row = next(r for r in document["observations"] if r["stream"] == "daily")
    if mutation == "naive":
        row["available_at"] = row["available_at"][:19]
    if mutation == "missing-time":
        row.pop("available_at")
    if mutation == "future-availability":
        row["available_at"] = "2099-01-01T00:00:00Z"
    if mutation == "ohlc":
        row["values"]["high"] = 0
    if mutation == "bool":
        row["values"]["close"] = True
    if mutation == "nan":
        row["values"]["close"] = float("nan")
    if mutation == "unknown":
        row["values"]["invented_alpha"] = 1
    if mutation == "duplicate":
        document["observations"].append(copy.deepcopy(row))
    if mutation == "factor-bool":
        next(r for r in document["observations"] if r["stream"] == "factors")["values"][
            "values"
        ]["MKT"] = True
    if mutation == "undefined-spread":
        document["definitions"].pop("spread_bps")
    with pytest.raises(ValueError):
        PITDataset.model_validate(document)


def test_append_only_install_and_repeated_capture_keep_original_evidence(
    dataset, tmp_path
):
    initial = prefix(
        dataset, to_world(dataset.model_dump(mode="json")).daily[2].available_at
    )
    service.install_dataset(initial, tmp_path)
    captured_again = initial.model_dump(mode="json")
    for row in captured_again["observations"]:
        row.update(
            as_of="2026-02-01T00:00:00Z",
            publication_evidence="Second snapshot of unchanged original publication",
        )
    merged = service.merge_publications(
        initial, PITDataset.model_validate(captured_again)
    )
    assert merged == initial
    changed = initial.model_dump(mode="json")
    next(r for r in changed["observations"] if r["stream"] == "daily")["values"][
        "volume"
    ] += 1
    with pytest.raises(ValueError, match="rewrites"):
        service.install_dataset(PITDataset.model_validate(changed), tmp_path)
    assert VersionedExportProvider(tmp_path / "SPY.json").load() == initial
    with pytest.raises(ValueError, match="changed values"):
        service.merge_publications(initial, PITDataset.model_validate(changed))


def test_catalog_missing_real_inputs_never_substitutes_demo(tmp_path, monkeypatch):
    monkeypatch.setattr(service, "data_root", lambda: tmp_path)
    data = service.catalog()
    assert [a["asset"] for a in data["assets"][:3]] == ["SPY", "QQQ", "IWM"]
    assert all(
        not a["available"] and a["scope"] == "REAL_PIT" for a in data["assets"][:3]
    )
    with pytest.raises(HTTPException) as error:
        routes.snapshot("SPY", None, "real")
    assert error.value.status_code == 404
    with pytest.raises(ValueError):
        service.snapshot("SPY", source="demo-full")


def test_csv_without_availability_is_refused(tmp_path):
    path = tmp_path / "bars.csv"
    path.write_text("Date,Close,Volume\n2024-01-01,100,123\n", encoding="utf-8")
    with pytest.raises(ValueError, match="publication"):
        publication_csv(path, stream="daily", source="provider")


def test_alfred_uses_original_vintage_day_not_query_or_retrieval_time():
    payload = {
        "realtime_start": "1776-07-04",
        "count": 2,
        "observations": [
            {"date": "2024-01-01", "realtime_start": "2024-02-02", "value": "100"},
            {"date": "2024-01-01", "realtime_start": "2024-03-08", "value": "101"},
        ],
    }
    rows = alfred_observations(
        payload,
        series="CPIAUCSL",
        direction="HIGH_IS_STRESS",
        source_as_of="2024-04-01T00:00:00Z",
        reference="test snapshot",
    )
    assert rows[0].available_at.isoformat() == "2024-02-03T05:00:00+00:00"
    assert rows[0].as_of.isoformat() == "2024-04-01T00:00:00+00:00"
    assert rows[0].quality == "CONSERVATIVE_VINTAGE_DAY"
    assert (
        vintage(
            to_world(
                PITDataset.model_validate(
                    {
                        "asset": "QQQ",
                        "price_basis": "UNADJUSTED",
                        "calendar_note": "test",
                        "definitions": {},
                        "observations": [r.model_dump() for r in rows],
                    }
                ).model_dump(mode="json")
            ).macro,
            utc("2024-02-02T23:59:59Z"),
        )
        == []
    )
    payload["realtime_start"] = "2024-04-01"
    with pytest.raises(ValueError, match="point snapshots"):
        alfred_observations(
            payload,
            series="CPIAUCSL",
            direction="HIGH_IS_STRESS",
            source_as_of="2024-04-01T00:00:00Z",
            reference="test",
        )
    with pytest.raises(RuntimeError, match="not configured"):
        FredVintageProvider("", None)


@pytest.mark.parametrize(
    "exception,status",
    [
        (RegimeEvidenceError("seal"), 409),
        (ValueError("input"), 422),
        (TimeoutError("pending"), 503),
    ],
)
def test_route_errors_fail_closed(monkeypatch, exception, status):
    def refuse(*args):
        raise exception

    monkeypatch.setattr(service, "snapshot", refuse)
    with pytest.raises(HTTPException) as error:
        routes.snapshot("SPY", None, "real")
    assert error.value.status_code == status


def test_product_api_is_authenticated_and_read_only():
    paths = app.openapi()["paths"]
    client = TestClient(app)
    for suffix in ("assets", "snapshot", "compare"):
        path = "/dynamics/regime-product/" + suffix
        assert set(paths[path]) == {"get"}
        assert client.get(path).status_code == 401


def test_insufficient_history_returns_unavailable_not_zero(dataset):
    data = prefix(
        dataset, to_world(dataset.model_dump(mode="json")).daily[0].available_at
    )
    result = service.snapshot("SPY", dataset=data)
    assert (
        result["analysis"] is None
        and result["state_at"] is None
        and result["status"] == "UNAVAILABLE"
    )
    assert result["cache_identity"]["input_hash"] == digest(
        visible_payload(data, result["as_of"])
    )


def test_cache_identity_is_asset_and_frozen_source_version_specific(
    dataset, monkeypatch
):
    data = prefix(
        dataset, to_world(dataset.model_dump(mode="json")).daily[2].available_at
    )
    cutoff = max(r.available_at for r in data.observations).isoformat()
    calls = []
    original = service.compile_world

    def counted(*args, **kwargs):
        calls.append(1)
        return original(*args, **kwargs)

    monkeypatch.setattr(service, "compile_world", counted)
    monkeypatch.setattr(service, "source_hashes", lambda: {"sealed": "version-a"})
    a = service.replay_dataset(data, cutoff)
    qqq = PITDataset.model_validate({**data.model_dump(), "asset": "QQQ"})
    b = service.replay_dataset(qqq, cutoff)
    monkeypatch.setattr(service, "source_hashes", lambda: {"sealed": "version-b"})
    c = service.replay_dataset(data, cutoff)
    assert len(calls) == 3 and a["asset"] != b["asset"]
    assert (
        a["cache_identity"]["analytics_version"]
        != c["cache_identity"]["analytics_version"]
    )


def test_concurrent_replay_uses_single_flight(dataset, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    import threading

    data = prefix(
        dataset, to_world(dataset.model_dump(mode="json")).daily[2].available_at
    )
    cutoff = max(r.available_at for r in data.observations).isoformat()
    entered, release = threading.Event(), threading.Event()
    original = service._compute
    calls = []

    def blocked(*args):
        calls.append(1)
        entered.set()
        assert release.wait(timeout=15)
        return original(*args)

    monkeypatch.setattr(service, "_compute", blocked)
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(service.replay_dataset, data, cutoff) for _ in range(4)]
        assert entered.wait(timeout=15)
        release.set()
        results = [f.result(timeout=30) for f in futures]
    assert len(calls) == 1 and all(result == results[0] for result in results)


def test_requested_cutoff_and_price_state_boundary_are_distinct(dataset):
    world = to_world(dataset.model_dump(mode="json"))
    cutoff = world.daily[2].available_at + timedelta(hours=1)
    result = service.replay_dataset(dataset, cutoff.isoformat())
    assert result["as_of"] == cutoff.isoformat()
    assert result["state_at"] == world.daily[2].available_at.isoformat()


def test_operator_cli_accepts_evidenced_csv_and_repeated_import_is_idempotent(
    dataset, tmp_path
):
    import csv
    from scripts.ingest_regime_pit import main

    document = dataset.model_dump(mode="json")
    record = next(r for r in document["observations"] if r["stream"] == "daily")
    document.update(observations=[], definitions={})
    template = tmp_path / "metadata.json"
    template.write_text(json.dumps(document), encoding="utf-8")
    fields = {
        k: record[k]
        for k in (
            "observed_at",
            "available_at",
            "as_of",
            "revision",
            "quality",
            "publication_evidence",
        )
    }
    fields.update(
        {k: record["values"][k] for k in ("open", "high", "low", "close", "volume")}
    )
    bars = tmp_path / "bars.csv"
    with bars.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(fields))
        writer.writeheader()
        writer.writerow(fields)
    args = [
        str(template),
        "--daily-csv",
        str(bars),
        "--source",
        record["source"],
        "--root",
        str(tmp_path / "installed"),
    ]
    assert main([*args, "--validate-only"]) == 0
    assert not (tmp_path / "installed/SPY.json").exists()
    assert main(args) == 0 and main(args) == 0
    installed = VersionedExportProvider(tmp_path / "installed/SPY.json").load()
    assert len(installed.observations) == 1
    assert installed.observations[0].available_at == utc(record["available_at"])
