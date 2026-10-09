"""Local Phase 2 CLI: admitted fixture -> SDK -> registered run -> checked Replay."""

from __future__ import annotations
import argparse
from hashlib import sha256
import importlib.metadata
import json
from pathlib import Path
import sys
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finsight.plugins import Signal, SignalStore, RunRegistry, Runner, PluginCatalog
from finsight.plugins.replay import FIXTURE_PATH, FIXTURE_SOURCE, publish
from examples.momentum_plugin import MomentumModel
from src.truth.contracts import canonical_hash
from finsight.plugins.runner import DEPENDENCIES, runtime_identity

DIRECTORY = ROOT / "data/exports/nervous_system_v0_1"
TENANT = "public-fixture"


def fingerprint():
    files = (
        sorted((ROOT / "finsight").rglob("*.py"))
        + sorted((ROOT / "src").rglob("*.py"))
        + [ROOT / "examples/momentum_plugin.py", Path(__file__), ROOT / FIXTURE_PATH]
    )
    return canonical_hash(
        {
            "sources": {
                p.relative_to(ROOT).as_posix(): sha256(
                    p.read_bytes().replace(b"\r\n", b"\n")
                ).hexdigest()
                for p in files
            },
            "dependencies": {p: importlib.metadata.version(p) for p in DEPENDENCIES},
            "runtime": runtime_identity(),
            "seed": 42,
            "horizon": 1,
            "embargo": 2,
        }
    )


def execute(runtime, public, *, refresh=False):
    receipt = DIRECTORY / "receipt.json"
    requested = fingerprint()
    if (
        refresh
        and receipt.exists()
        and json.loads(receipt.read_text())["fingerprint"] == requested
    ):
        # The nightly job verifies the published bytes before this call. An
        # unchanged input/source/environment makes no attempt and opens no holdout.
        print("UNCHANGED: checked inputs, sources and environment; no holdout opened")
        return
    fixture = json.loads((ROOT / FIXTURE_PATH).read_text())
    version = sha256((ROOT / FIXTURE_PATH).read_bytes()).hexdigest()
    store = SignalStore(Path(runtime) / "signals")
    registry = RunRegistry(Path(runtime) / "runs.sqlite")
    history = DIRECTORY / "registry.json"
    if history.exists() and not registry.events(TENANT):
        registry.restore(TENANT, json.loads(history.read_text()))
    records = []
    for row in fixture["rows"]:
        for name in MomentumModel.inputs:
            records.append(
                Signal(
                    TENANT,
                    name,
                    "SDK-FIXTURE",
                    row[name],
                    row["observed_at"],
                    row["available_at"],
                    FIXTURE_SOURCE,
                    "FIRST_PARTY",
                    version,
                )
            )
    store.append(TENANT, records)
    rows = fixture["rows"][:-1]
    factors = pd.DataFrame(
        {
            "mkt": [r["factor_mkt"] for r in rows],
            "information_at": pd.to_datetime(
                [r["factor_available_at"] for r in rows], utc=True
            ),
        }
    )
    catalog = PluginCatalog()
    catalog.register("momentum-fixture", MomentumModel)
    result = catalog.run(
        "momentum-fixture",
        Runner(store, registry, root=ROOT),
        tenant_id=TENANT,
        asset="SDK-FIXTURE",
        decisions=[r["available_at"] for r in rows],
        as_of=fixture["as_of"],
        seed=42,
        horizon=1,
        embargo=2,
        scope="SYNTHETIC_REFERENCE",
        targets=[r["market_return"] for r in fixture["rows"][1:]],
        target_information_at=[r["available_at"] for r in fixture["rows"][1:]],
        factors=factors,
    )
    identity, entry, value = publish(
        registry,
        TENANT,
        result["run_id"],
        root=ROOT,
        output=public,
        allowed_outputs={"momentum_signal"},
    )
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    # An append-only public snapshot contains metadata and derived values only;
    # local DuckDB/SQLite and raw inputs are never committed.
    snapshot = registry.snapshot(TENANT)
    raw = (
        json.dumps(snapshot, sort_keys=True, separators=(",", ":"), allow_nan=False)
        + "\n"
    ).encode()
    snapshot_hash = sha256(raw).hexdigest()
    (DIRECTORY / ("registry-" + snapshot_hash + ".json")).write_bytes(raw)
    (DIRECTORY / "registry.json").write_bytes(raw)
    record = {
        "schema_version": "nervous-system-receipt/1",
        "fingerprint": requested,
        "run_id": result["run_id"],
        "artifact_id": identity,
        "entry": entry,
        "fixture_sha256": version,
        "registry_sha256": snapshot_hash,
        "scope": "SYNTHETIC_REFERENCE",
        "claims": result["claims"],
        "code_commit": result["contract"]["code"]["commit"],
    }
    (DIRECTORY / ("receipt-" + result["run_id"] + ".json")).write_text(
        json.dumps(record, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    receipt.write_text(
        json.dumps(record, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "run_id": result["run_id"],
                "rows": len(value["predictions"]),
                "holdout_openings": registry.opening_count(TENANT),
                "claims": result["claims"],
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--runtime",
        type=Path,
        default=ROOT / "data/exports/replay-source/nervous-runtime",
    )
    parser.add_argument("--public", type=Path, default=ROOT / "frontend-v2/public")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    execute(args.runtime, args.public, refresh=args.refresh)
