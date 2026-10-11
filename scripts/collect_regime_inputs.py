"""Admit Phase 5 factor evidence through the Data Organ under the frozen profile.

Same adapters, admission, quarantine and lineage contracts as Phase 3, in the
separate `public-regime-evidence` tenant so Phase 3 F10 history is untouched.
Raw bytes and runtime databases stay in ignored local storage.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finsight.plugins import SignalStore
from src.data_organ import adapters
from src.data_organ.registry import Registry
from src.data_organ.service import Service
from src.regimes.profile import profile
from src.truth.contracts import canonical_hash

RUNTIME = ROOT / "data/exports/replay-source/regimes-runtime"
CAPTURES = ROOT / "data/exports/replay-source"
COUNTRIES = {"US-MKT": "US", "IN-MKT": "INDIA"}


def service_for(runtime):
    runtime = Path(runtime)
    return Service(
        Registry(runtime / "data-organ.duckdb"),
        runtime / "captures",
        SignalStore(runtime / "signals"),
    )


def library_coverage(rows):
    """Complete source coverage, reported separately from the analysis window."""
    fields = {}
    for row in rows:
        day = row["observed_at"][:10]
        item = fields.setdefault(row["field"], {"first": day, "last": day, "rows": 0})
        item["first"], item["last"] = min(item["first"], day), max(item["last"], day)
        item["rows"] += 1
    return dict(sorted(fields.items()))


def collect(runtime=RUNTIME, *, network=False, directory=CAPTURES):
    settings = profile()
    tenant_id = settings["tenant"]
    service = service_for(runtime)
    results = []
    for asset, country in COUNTRIES.items():
        source = settings["markets"][asset]["source"]
        try:
            for cap, raw, rows in adapters.factors(directory, country, network=network):
                if not rows:
                    raise ValueError("Capture contains no dated factor rows")
                coverage = library_coverage(rows)
                window = [
                    settings["analysis_window"]["start"],
                    max(r["observed_at"][:10] for r in rows),
                ]
                result = service.ingest(
                    tenant_id, cap, raw, rows, window=window, require_public=True
                )
                service.registry.append(
                    tenant_id,
                    "LIBRARY_COVERAGE",
                    cap.identity,
                    {
                        "asset": asset,
                        "source": cap.source,
                        "source_version_id": cap.identity,
                        "capture_sha256": cap.content_sha256,
                        "captured_at": cap.captured_at,
                        "library": coverage,
                        "analysis_window": window,
                        "coverage_hash": canonical_hash(coverage),
                    },
                )
                results.append({**result, "asset": asset, "window": window})
        except (ValueError, TypeError, PermissionError, OSError, KeyError) as error:
            service.unavailable(tenant_id, source, str(error))
            results.append({"asset": asset, "source": source, "status": "UNAVAILABLE", "reason": str(error)})
    return service, results


LOCAL_TENANT = "local-regime-evidence"
LOCAL_RUNTIME = ROOT / "data/exports/replay-source/regimes-local-runtime"


def collect_local(dataset_path, *, runtime=LOCAL_RUNTIME, directory=CAPTURES, network=False):
    """Operator-only: an installed Market Regime v1.1 IEX dataset through the Data Organ.

    Restricted local evidence; there is no derived-publication grant, so nothing
    from this tenant may enter anonymous Replay. French factors are admitted into
    the same tenant for excess returns and factor diagnostics.
    """
    from src.regime_intelligence.alpaca import URL
    from src.regime_intelligence.providers import VersionedExportProvider

    settings = profile()
    service = service_for(runtime)
    results = []
    for cap, raw, rows in adapters.factors(directory, "US", network=network):
        window = [settings["analysis_window"]["start"], max(r["observed_at"][:10] for r in rows)]
        results.append(service.ingest(LOCAL_TENANT, cap, raw, rows, window=window))
    dataset_path = Path(dataset_path)
    raw = dataset_path.read_bytes()
    dataset = VersionedExportProvider(dataset_path).load()
    asset = dataset.asset
    if asset not in settings["local_assets"]:
        raise ValueError("Local tier is SPY/QQQ/IWM; other assets need their own admission review")
    market = [o for o in dataset.observations if o.source == "ALPACA_IEX"]
    if not market:
        raise ValueError("Installed dataset has no ALPACA_IEX bars")
    captured_at = max(o.as_of for o in market).isoformat()
    daily = [o for o in market if o.stream == "daily"]
    captures = [adapters.alpaca(daily, raw, captured_at, URL, asset=asset)] if daily else []
    captures += adapters.alpaca_intraday(market, raw, captured_at, URL, asset=asset)
    for cap, raw_bytes, rows in captures:
        if not rows:
            continue
        window = [settings["analysis_window"]["start"], max(r["observed_at"][:10] for r in rows)]
        results.append({**service.ingest(LOCAL_TENANT, cap, raw_bytes, rows, window=window), "asset": asset})
    return service, results


def content_fingerprint(service, tenant_id):
    """Admitted source bytes per asset: the scheduler's only change signal."""
    versions = {
        e["identity"]: e["payload"]
        for e in service.registry.entries(tenant_id, "SOURCE_VERSION")
    }
    coverage = service.registry.entries(tenant_id, "LIBRARY_COVERAGE")
    return {
        asset: sorted(
            {
                c["payload"]["capture_sha256"]
                for c in coverage
                if c["payload"]["asset"] == asset
                and c["payload"]["source_version_id"] in versions
            }
        )
        for asset in COUNTRIES
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--network", action="store_true")
    parser.add_argument("--runtime", type=Path, default=RUNTIME)
    parser.add_argument("--directory", type=Path, default=CAPTURES)
    parser.add_argument(
        "--local-dataset",
        type=Path,
        help="Installed regime-pit/1 IEX dataset (operator machine only; never published)",
    )
    args = parser.parse_args()
    if args.local_dataset:
        _, results = collect_local(
            args.local_dataset, directory=args.directory, network=args.network
        )
    else:
        _, results = collect(args.runtime, network=args.network, directory=args.directory)
    print(json.dumps({"results": results, "raw_inputs": "LOCAL_ONLY"}, indent=1))
