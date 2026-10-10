"""Compute (only when admitted evidence changed) and publish Phase 5 derived Replay.

Idempotence gate: if the admitted capture content, the frozen profile and every
plugin's computation source closure match the committed receipt, nothing runs and
nothing is published. Never opens a holdout and never executes the Phase 2 plugin
reference.
"""

import argparse
import json
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finsight.plugins.contracts import utc
from finsight.plugins.dependencies import manifest
from scripts import collect_regime_inputs as collector
from src.regimes import matrix as matrix_module
from src.regimes.plugins import SERIES_PLUGINS
from src.regimes.profile import profile, profile_sha256
from src.regimes.publication import (
    PUBLIC_SOURCES,
    project_factors,
    project_history,
    project_lineage,
    project_snapshot,
    project_timeline,
    publish,
)
from src.regimes.service import Pipeline
from src.replay.publication import canonical_bytes
from src.truth.contracts import canonical_hash

DIRECTORY = ROOT / "data/exports/regimes_v0_1"
PUBLIC = ROOT / "frontend-v2/public"


def fingerprint(service, tenant_id):
    return {
        "captures": collector.content_fingerprint(service, tenant_id),
        "profile_sha256": profile_sha256(),
        "code": {
            name: canonical_hash(manifest(plugin, ROOT)["sources"])
            for name, plugin in sorted(SERIES_PLUGINS.items())
        },
    }


def latest_capture(service, tenant_id):
    clocks = [
        e["payload"]["captured_at"]
        for e in service.registry.entries(tenant_id, "LIBRARY_COVERAGE")
    ]
    if not clocks:
        raise LookupError("No admitted Phase 5 evidence; nothing to compute")
    return max(clocks, key=utc)


def _previous_history(public, asset):
    pointer = json.loads((public / "replay-manifest.json").read_bytes())
    identity = pointer["routes"].get(f"/regimes/history?asset={asset}")
    if not identity:
        return None
    entry = pointer["artifacts"][identity]
    raw = (public / entry["url"].lstrip("/")).read_bytes()
    if sha256(raw).hexdigest() != entry["sha256"]:
        raise ValueError("Prior regimes history bytes changed")
    return json.loads(raw)["payload"]


def export(runtime=collector.RUNTIME, public=PUBLIC, directory=DIRECTORY, *, as_of=None, force=False):
    settings = profile()
    tenant_id = settings["tenant"]
    service = collector.service_for(runtime)
    pipe = Pipeline(runtime, tenant_id=tenant_id)
    current = fingerprint(service, tenant_id)
    receipt_path = Path(directory) / "receipt.json"
    if receipt_path.exists() and not force:
        previous = json.loads(receipt_path.read_bytes())
        if previous.get("fingerprint") == current:
            result = {"status": "UNCHANGED", "new_runs": 0, "holdout_openings": 0}
            print(json.dumps(result))
            return result
    as_of = as_of or latest_capture(service, tenant_id)
    sealed_before = sum(
        e["event"] == "RUN_SEALED" for e in pipe.registry.events(tenant_id)
    )
    snapshots, unavailable = {}, {}
    for asset in PUBLIC_SOURCES:
        if not any(current["captures"].get(asset, [])):
            unavailable[asset] = "No admitted capture for this market at the cutoff"
            continue
        try:
            runs = pipe.run_market(asset, as_of)
            snapshots[asset] = pipe.snapshot(asset, as_of, runs)
        except (LookupError, ValueError) as error:
            unavailable[asset] = str(error)
    if not snapshots:
        raise LookupError("No market could be computed: " + json.dumps(unavailable))
    events = pipe.registry.events(tenant_id)
    new_runs = sum(e["event"] == "RUN_SEALED" for e in events) - sealed_before
    openings = pipe.registry.opening_count(tenant_id)
    if openings or any(e["event"] == "HOLDOUT_OPENED" for e in events):
        raise RuntimeError("Phase 5 export recorded a holdout opening")
    published = {}
    for asset, snap in snapshots.items():
        source = [PUBLIC_SOURCES[asset]]
        first = publish(
            public,
            [
                ("snapshot", asset, project_snapshot(snap), source, snap["input_hash"]),
                ("timeline", asset, project_timeline(snap), source, snap["input_hash"]),
                ("factors", asset, project_factors(snap), source, snap["input_hash"]),
                ("lineage", asset, project_lineage(snap), source, snap["input_hash"]),
            ],
            as_of=as_of,
        )
        history = project_history(
            _previous_history(public, asset), snap, first[("snapshot", asset)]["artifact_id"]
        )
        second = publish(public, [("history", asset, history, source, snap["input_hash"])], as_of=as_of)
        published[asset] = {k[0]: v["artifact_id"] for k, v in {**first, **second}.items()}
    built = matrix_module.build(list(snapshots.values()))
    sources = sorted(PUBLIC_SOURCES[a] for a in snapshots)
    matrix_entry = publish(
        public,
        [("matrix", None, built, sources, canonical_hash([s["input_hash"] for s in snapshots.values()]))],
        as_of=as_of,
    )
    receipt = {
        "schema_version": "regimes-receipt/1",
        "as_of": as_of,
        "fingerprint": current,
        "profile_sha256": current["profile_sha256"],
        "markets": {
            asset: {
                "state_at": snap["state_at"],
                "run_ids": snap["run_ids"],
                "module_statuses": {k: v["status"] for k, v in snap["module_statuses"].items()},
                "lineage": {k: c["status"] for k, c in snap["lineage"].items()},
                "artifacts": published[asset],
            }
            for asset, snap in snapshots.items()
        },
        "unavailable_markets": unavailable,
        "matrix_artifact": matrix_entry[("matrix", None)]["artifact_id"],
        "new_runs": new_runs,
        "holdout_openings": 0,
        "phase2_reference_executed": False,
        "claims": settings["claims"],
    }
    Path(directory).mkdir(parents=True, exist_ok=True)
    raw = canonical_bytes(receipt)
    (Path(directory) / ("receipt-" + sha256(raw).hexdigest() + ".json")).write_bytes(raw)
    receipt_path.write_bytes(raw)
    result = {"status": "PUBLISHED", "as_of": as_of, "new_runs": new_runs, "holdout_openings": 0, "markets": sorted(snapshots), "unavailable": unavailable}
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=collector.RUNTIME)
    parser.add_argument("--as-of")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    export(args.runtime, as_of=args.as_of, force=args.force)
