"""Local SPY tier and Family F seasonality. Local evidence never becomes public."""

import json

import numpy as np
import pandas as pd
import pytest

from scripts import collect_regime_inputs as collector
from src.regimes.local import AssetReturns, IntradaySeasonality, alpaca_session, bucket_bars
from src.regimes.service import Pipeline
from tests.regimes.fixtures import write_factor_captures, write_local_dataset

CUTOFF = "2026-10-07T00:00:00Z"


@pytest.fixture(scope="module")
def local(tmp_path_factory):
    root = tmp_path_factory.mktemp("regime-local")
    write_factor_captures(root / "captures", start="2018-06-01", end="2021-12-31", captured_at="2026-10-05T06:00:00Z")
    write_local_dataset(root / "SPY.json")
    service, results = collector.collect_local(root / "SPY.json", runtime=root / "runtime", directory=root / "captures")
    pipe = Pipeline(root / "runtime", tenant_id=collector.LOCAL_TENANT)
    runs = pipe.run_market("SPY", CUTOFF)
    return pipe, runs, results


def test_local_evidence_is_admitted_with_iex_units_in_its_own_tenant(local):
    pipe, runs, results = local
    names = {s.name: s.unit for s in pipe.store.history(pipe.tenant_id, as_of=CUTOFF, asset="SPY")}
    assert names["market_close"] == "USD" and names["iex_bar_close"] == "USD"
    assert names["iex_bar_volume"] == "shares"
    assert not pipe.store.history("public-regime-evidence", as_of=CUTOFF)


def test_returns_are_never_computed_across_missing_sessions(local):
    pipe, runs, _ = local
    returns = runs["returns"]
    assert returns["current"]["gap_count"] >= 1
    stamps = [pd.Timestamp(t) for t, _ in returns["derived"]["asset_return"]]
    sessions = alpaca_session(stamps)
    assert not any(d.isoformat().startswith("2020-03-0") and d.isoformat() <= "2020-03-06" for d in sessions)
    assert pd.Timestamp("2020-03-09").date() not in sessions


def test_local_chain_runs_without_holdouts_and_is_local_only(local):
    pipe, runs, _ = local
    assert pipe.registry.opening_count(pipe.tenant_id) == 0
    snap = pipe.snapshot("SPY", CUTOFF)
    assert snap["market"] == "SPY REGIME" and snap["evidence_scope"] == "LOCAL_ONLY"
    assert {"ALPACA IEX", "LOCAL ONLY", "CONSERVATIVE_MARKET_TIME", "IEX_ONLY"} <= set(snap["badges"])
    assert "SOURCE_RESTRICTED" in {i["kind"] for i in snap["issues"]}
    assert snap["evidence_quality"]["present"] == ["CAPTURE_ONLY", "CONSERVATIVE_MARKET_TIME"]
    assert all(c["status"] == "VERIFIED" for c in snap["lineage"].values())
    assert snap["runs"]["factors"]["diagnostics"]["target"] == "excess_return"
    json.dumps(snap, allow_nan=False)


def test_seasonality_labels_iex_volume_and_never_shows_absent_measures(local):
    pipe, runs, _ = local
    season = runs["seasonality"]
    assert season["status"] == "COMPUTED" and season["current"]["sessions"] == 62
    text = json.dumps(season)
    assert "iex_volume" in text and '"volume"' not in text.replace('"iex_volume"', "")
    for cell in season["paths"]["cells"]:
        assert not {"spread", "liquidity", "order_imbalance"} & set(cell["metrics"])
    assert "not consolidated" in season["diagnostics"]["volume_label"]


def _minute_frames(days, *, effect=True, seed=3, shuffle=False):
    import exchange_calendars as xcals

    rng = np.random.default_rng(seed)
    calendar = xcals.get_calendar("XNYS", start="2023-01-03")
    schedule = calendar.schedule.loc[days[0] : days[1]]
    closes, volumes = [], []
    for opening in schedule.open:
        level = 100.0
        for minute in range(90):
            planted = effect and 30 <= minute < 60  # the 10:30 bucket has a predecessor
            level *= 1 + rng.normal(0, 0.003 if planted else 0.0005)
            end = opening + pd.Timedelta(minutes=minute + 1)
            closes.append((end, level))
            volumes.append((end, 1000.0))
    frame = pd.DataFrame(closes, columns=["observed_at", "value"])
    if shuffle:
        frame["value"] = rng.permutation(frame.value.values)
    frame["available_at"] = frame.observed_at + pd.Timedelta(seconds=900)
    vol = pd.DataFrame(volumes, columns=["observed_at", "value"])
    vol["available_at"] = vol.observed_at + pd.Timedelta(seconds=900)
    return frame, vol


def _first_bucket_share(frame, vol):
    buckets = bucket_bars(frame, vol)
    profile = IntradaySeasonality.profile(buckets)
    by_bucket = {}
    for cell in profile:
        if cell["absolute_return"]["n"]:
            by_bucket.setdefault(cell["bucket"], []).append(cell["absolute_return"]["median"])
    return np.mean(by_bucket["10:30"]) / np.mean(by_bucket["11:00"])


def test_planted_time_of_day_effect_is_recovered_and_shuffling_destroys_it():
    planted = _first_bucket_share(*_minute_frames(("2023-03-01", "2023-05-31")))
    shuffled = _first_bucket_share(*_minute_frames(("2023-03-01", "2023-05-31"), shuffle=True))
    assert planted > 0  # bucket 10:00 has no within-session predecessor
    frame, vol = _minute_frames(("2023-03-01", "2023-05-31"))
    buckets = bucket_bars(frame, vol)
    profile = {(c["weekday"], c["bucket"]): c for c in IntradaySeasonality.profile(buckets)}
    first = np.mean([c["absolute_return"]["median"] for (w, b), c in profile.items() if b == "10:30"])
    later = np.mean([c["absolute_return"]["median"] for (w, b), c in profile.items() if b == "11:00"])
    assert first > 1.5 * later
    assert abs(shuffled - 1) < abs(planted - 1)


def test_missing_sessions_stay_missing_and_dst_shifts_utc_not_local_buckets():
    frame, vol = _minute_frames(("2023-03-08", "2023-03-15"))
    drop = frame.observed_at.dt.tz_convert("America/New_York").dt.date.astype(str) != "2023-03-10"
    buckets = bucket_bars(frame[drop], vol[drop])
    days = {b["observed_at"].astimezone(__import__("zoneinfo").ZoneInfo("America/New_York")).date().isoformat() for b in buckets}
    assert "2023-03-10" not in days
    local = {b["observed_at"].astimezone(__import__("zoneinfo").ZoneInfo("America/New_York")).strftime("%H:%M") for b in buckets}
    utc = {b["observed_at"].astimezone(__import__("datetime").timezone.utc).strftime("%H:%M") for b in buckets}
    assert local == {"10:00", "10:30", "11:00"}
    assert {"15:00", "14:00"} <= utc


def test_operator_local_command_seals_only_local_runs_and_publishes_nothing(local):
    from scripts.export_regimes_replay import compute_local

    pipe, runs, _ = local
    first = compute_local(pipe.runtime, as_of=CUTOFF)
    again = compute_local(pipe.runtime, as_of=CUTOFF)
    for result in (first, again):
        assert result["status"] == "LOCAL_ONLY" and result["published"] == 0
        assert result["holdout_openings"] == 0
        assert result["assets"]["SPY"]["run_ids"] == {k: r["run_id"] for k, r in runs.items()}
    # SPY reuses the fixture's sealed chain; daily-only QQQ and IWM seal theirs once.
    assert {a: r["status"] for a, r in first["assets"].items()} == dict.fromkeys(["SPY", "QQQ", "IWM"], "SEALED")
    assert "seasonality" not in first["assets"]["QQQ"]["run_ids"]
    assert first["new_runs"] == 12 and again["new_runs"] == 0
    assert again["assets"] == first["assets"]
    assert not pipe.store.history("public-regime-evidence", as_of=CUTOFF)
