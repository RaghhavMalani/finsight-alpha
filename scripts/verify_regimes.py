"""Read-only Phase 5 audit: publication bytes, receipts, lineage, history, boundary.

Never computes, fetches or opens a holdout. With --runtime it additionally
re-projects the receipt's snapshots from local sealed runs and compares bytes.
"""

import argparse
import json
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.regimes_archive import verify as verify_boundary
from scripts.regimes_archive import verify_addition
from src.regimes.contracts import CLAIMS
from src.regimes.publication import FROZEN_RESEARCH, PUBLIC_SOURCES

DIRECTORY = ROOT / "data/exports/regimes_v0_1"
PUBLIC = ROOT / "frontend-v2/public"


def load(public, identity, manifest):
    entry = manifest["artifacts"][identity]
    raw = (public / entry["url"].lstrip("/")).read_bytes()
    if sha256(raw).hexdigest() != entry["sha256"]:
        raise ValueError("Artifact bytes changed: " + identity)
    return json.loads(raw)


def verify(root=ROOT, *, runtime=None):
    root = Path(root)
    public = root / "frontend-v2/public"
    verify_boundary(root)
    manifest = json.loads((public / "replay-manifest.json").read_bytes())
    regimes = sorted(k for k in manifest["artifacts"] if k.startswith("regimes:"))
    for identity in regimes:
        verify_addition(public, identity, manifest["artifacts"][identity])
    receipt_path = root / "data/exports/regimes_v0_1/receipt.json"
    if not receipt_path.exists():
        if regimes:
            raise ValueError("Published regimes artifacts without a receipt")
        return {"status": "NO_PUBLICATION_YET", "artifacts": 0}
    raw = receipt_path.read_bytes()
    receipt = json.loads(raw)
    sealed = root / "data/exports/regimes_v0_1" / ("receipt-" + sha256(raw).hexdigest() + ".json")
    if not sealed.exists() or sealed.read_bytes() != raw:
        raise ValueError("Current receipt has no retained content-addressed copy")
    if (
        receipt["holdout_openings"] != 0
        or receipt["phase2_reference_executed"] is not False
        or any(receipt["claims"].get(k) is not False for k in CLAIMS)
    ):
        raise ValueError("Receipt boundary violated")
    frozen = sha256((root / FROZEN_RESEARCH).read_bytes()).hexdigest()
    for asset, market in receipt["markets"].items():
        if asset not in PUBLIC_SOURCES:
            raise ValueError("Non-public market in the public receipt")
        if any(status != "VERIFIED" for status in market["lineage"].values()):
            raise ValueError("Published snapshot with unverified lineage")
        for kind, identity in market["artifacts"].items():
            if manifest["routes"].get(f"/regimes/{kind}?asset={asset}") is None or identity not in manifest["artifacts"]:
                raise ValueError("Receipt artifact missing from manifest")
        snapshot = load(public, market["artifacts"]["snapshot"], manifest)["payload"]
        if snapshot["run_ids"] != market["run_ids"] or snapshot["frozen_research"]["sha256"] != frozen:
            raise ValueError("Snapshot/receipt or frozen research binding changed")
        lineage = load(public, market["artifacts"]["lineage"], manifest)["payload"]
        if {k: v["status"] for k, v in lineage["runs"].items()} != market["lineage"]:
            raise ValueError("Lineage artifact differs from the receipt")
    histories = {}
    for identity in regimes:
        if identity.startswith("regimes:history:"):
            value = load(public, identity, manifest)
            histories.setdefault(value["payload"]["asset"], []).append(value)
    for asset, values in histories.items():
        values.sort(key=lambda v: (len(v["payload"]["entries"]), v["as_of"]))
        for older, newer in zip(values, values[1:]):
            old_entries = older["payload"]["entries"]
            if any(e not in newer["payload"]["entries"] for e in old_entries):
                raise ValueError("Sealed multi-cutoff history is not append-only: " + asset)
    if runtime:
        from src.regimes.publication import project_snapshot
        from src.regimes.service import Pipeline

        pipe = Pipeline(runtime)
        if pipe.registry.opening_count(pipe.tenant_id):
            raise ValueError("Local Phase 5 registry recorded a holdout opening")
        events = pipe.registry.events(pipe.tenant_id)
        if any(e["event"] == "HOLDOUT_OPENED" for e in events):
            raise ValueError("Local Phase 5 registry recorded a holdout opening")
        sealed = {e["run_id"] for e in events if e["event"] == "RUN_SEALED"}
        sealed_runs = len(sealed)
        expected = {r for m in receipt["markets"].values() for r in m["run_ids"].values()}
        # An UNCHANGED refresh computes nothing: its runtime holds admissions only.
        markets = receipt["markets"].items() if sealed else ()
        if sealed and not expected <= sealed:
            raise ValueError("Published receipt names runs this runtime never sealed")
        for asset, market in markets:
            snap = pipe.snapshot(asset, receipt["as_of"])
            if snap["run_ids"] != market["run_ids"]:
                raise ValueError("Local sealed runs differ from the receipt")
            published = load(public, market["artifacts"]["snapshot"], manifest)["payload"]
            if json.dumps(project_snapshot(snap), sort_keys=True) != json.dumps(published, sort_keys=True):
                raise ValueError("Re-projected snapshot differs from published bytes")
    result = {
        "status": "VERIFIED",
        "as_of": receipt["as_of"],
        "markets": sorted(receipt["markets"]),
        "artifacts": len(regimes),
        "holdout_openings": 0,
    }
    if runtime:
        result["runtime_sealed_runs"] = sealed_runs
        result["runtime"] = "RE_PROJECTED" if sealed_runs else "UNCHANGED_ZERO_RUNS"
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path)
    args = parser.parse_args()
    result = verify(runtime=args.runtime)
    print(
        "Phase 5 regimes verified: "
        + json.dumps(result, sort_keys=True)
        + "; zero holdout openings, earlier evidence byte-identical"
    )
