"""Audit installed real sources and full NOW/REPLAY/COMPARE without downloads."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.dynamics.market_regime_inputs import digest
from src.regime_intelligence.contracts import ASSETS, PITDataset, visible_payload
from src.regime_intelligence import service
from src.regime_intelligence.alpaca import sessions, NY


def source_audit(dataset, root):
    rows = [r for r in dataset.observations if r.source == "ALPACA_IEX"]
    snapshots = {}
    for row in rows:
        evidence = json.loads(row.publication_evidence)
        reference = evidence["snapshot_id"]
        if reference not in snapshots:
            paths = list((root / "provider-snapshots/alpaca-iex").glob(f"*/{reference}.json"))
            assert len(paths) == 1
            document = json.loads(paths[0].read_text(encoding="utf-8"))
            assert document["public_params"]["feed"] == "iex"
            assert document["public_params"]["symbols"] == dataset.asset
            assert digest(document["payload"]) == document["lineage"]["content_hash"]
            snapshots[reference] = {digest(r) for r in document["payload"]["bars"][dataset.asset]}
        assert evidence["raw_row_hash"] in snapshots[reference]
        assert row.revision == "alpaca-row:" + evidence["raw_row_hash"]
        assert evidence["coverage"] == "IEX ONLY" and evidence["historical_receive_timestamp"] is None
    return {"validated_market_rows": len(rows), "raw_snapshot_count": len(snapshots),
            "snapshot_ids": sorted(snapshots)}


def main():
    root = service.data_root()
    qa = root / "activation-qa"
    qa.mkdir(parents=True, exist_ok=True)
    report = {"audit_date": "2026-10-05", "provider": "ALPACA_IEX", "feed": "iex",
              "coverage": "IEX ONLY", "market_evidence": "CONSERVATIVE_MARKET_TIME",
              "requested_daily_start": "2016-01-01", "assets": {}, "browser_qa": "PENDING"}
    original_compile = service.compile_world
    calls = []
    def counted(*args, **kwargs):
        calls.append(1)
        return original_compile(*args, **kwargs)
    service.compile_world = counted
    for asset in ASSETS:
        dataset = service.load_dataset(asset)
        counts = Counter(r.stream for r in dataset.observations)
        daily = sorted((r for r in dataset.observations if r.stream == "daily"), key=lambda r: r.observed_at)
        intraday = [r for r in dataset.observations if r.stream == "intraday"]
        entry = {
            "counts": dict(counts), "factor_library_rows": len(dataset.factor_library),
            "asset_hash": digest(dataset.model_dump(mode="json")),
            "daily_observed_range": [daily[0].observed_at.isoformat(), daily[-1].observed_at.isoformat()],
            "daily_provider_date_range": [json.loads(r.publication_evidence)["provider_timestamp"] for r in (daily[0], daily[-1])],
            "intraday_observed_range": [min(r.observed_at for r in intraday).isoformat(), max(r.observed_at for r in intraday).isoformat()],
            "intraday_sessions": len({r.observed_at.date() for r in intraday}),
            "first_last_reconstructed_availability": [daily[0].available_at.isoformat(), daily[-1].available_at.isoformat()],
            "historical_ts_recv": "UNAVAILABLE",
            "row_hashes": {stream: digest([r.model_dump(mode="json") for r in dataset.observations if r.stream == stream])
                           for stream in ("daily", "intraday", "macro", "factors")},
            "missing_streams": ["events", "spread_bps", "liquidity", "order_imbalance", "QUAL", "VOL", "LIQ"],
            "source_provenance_qa": source_audit(dataset, root), "replays": [],
        }
        calendar = sessions(datetime(2016, 1, 1).date(), datetime(2026, 10, 5).date())
        present_days = {r.observed_at.astimezone(NY).date() - timedelta(days=1) for r in daily}
        entry["missing_requested_daily_sessions"] = len(set(calendar) - present_days)
        entry["daily_rows_by_year"] = dict(Counter(day.year for day in present_days))
        cutoffs = [daily[-70].available_at, daily[-40].available_at, daily[-10].available_at]
        for index, cutoff in enumerate(cutoffs):
            prefix = PITDataset.model_validate(visible_payload(dataset, cutoff))
            before = service.replay_dataset(prefix, cutoff.isoformat())
            fitted = len(calls)
            after = service.replay_dataset(dataset, cutoff.isoformat())
            assert before == after and len(calls) == fitted
            assert before["status"] == "AVAILABLE" and not any(before["claims"].values())
            assert before["market_evidence"]["coverage"] == "IEX ONLY"
            late = [r for r in dataset.observations if r.observed_at <= cutoff < r.available_at]
            late_library = [r for r in dataset.factor_library if r.observed_at <= cutoff < r.available_at]
            late_dataset = PITDataset.model_validate({
                **prefix.model_dump(), "observations": [*prefix.observations, *late],
                "factor_library": [*prefix.factor_library, *late_library],
            })
            assert service.replay_dataset(late_dataset, cutoff.isoformat()) == before and len(calls) == fitted
            (qa / f"{asset}-replay-{index + 1}.json").write_text(json.dumps(before, sort_keys=True), encoding="utf-8")
            entry["replays"].append({"cutoff": cutoff.isoformat(), "snapshot_hash": before["snapshot_hash"],
                                     "input_hash": before["input_hash"], "status": before["status"],
                                     "future_append_byte_invariance": "PASS", "no_refit": "PASS",
                                     "late_publication_byte_invariance": "PASS", "late_rows_excluded": len(late),
                                     "late_library_rows_excluded": len(late_library)})
            print(f"{asset} REPLAY {index + 1} PASS", flush=True)
        current = service.snapshot(asset, dataset=dataset)
        assert current["status"] == "AVAILABLE" and not any(current["claims"].values())
        assert current["analysis"]["current"]["vector"]["F"] is None
        (qa / f"{asset}-now.json").write_text(json.dumps(current, sort_keys=True), encoding="utf-8")
        comparison = service.compare(asset, cutoffs[0].isoformat(), cutoffs[-1].isoformat())
        assert comparison["left"]["status"] == comparison["right"]["status"] == "AVAILABLE"
        (qa / f"{asset}-compare.json").write_text(json.dumps(comparison, sort_keys=True), encoding="utf-8")
        entry.update(now_snapshot_hash=current["snapshot_hash"], now_status="PASS", compare_status="PASS",
                     claims=current["claims"], factor_library=current["factor_library"])
        report["assets"][asset] = entry
        (qa / "activation-report.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
        print(f"{asset} NOW / COMPARE / provenance PASS", flush=True)
    service.compile_world = original_compile
    print(json.dumps({"status": "PASS", "assets": list(report["assets"]), "report": str(qa / "activation-report.json")}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
