"""Withdraw unsafe factor projections and reproject retained sealed run evidence.

Read-only with respect to captures, admissions, computations and holdouts. The
hash-bound receipts, snapshot diagnostics and rolling coefficients already
published by each sealed run are the inputs; no runtime is fabricated or rerun.
All other artifacts and the original receipts remain byte-identical.
"""

import argparse
import copy
import json
import re
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.regimes.contracts import CLAIMS
from src.regimes.publication import SCHEMA, envelope, project_factor_summary, validate_public
from src.replay.publication import canonical_bytes

IDENTITY = re.compile(r"regimes:(snapshot|factors|lineage):[a-f0-9]{64}")
CORRECTION = "FACTORS_DERIVED_ONLY"


def load(public, manifest, identity):
    if not IDENTITY.fullmatch(identity):
        raise ValueError("Unreviewed sealed projection identity")
    entry = manifest["artifacts"][identity]
    url = "/artifacts/replay/" + identity.replace(":", "-") + ".json"
    if entry["url"] != url:
        raise ValueError("Sealed projection path differs from identity")
    raw = (public / url.lstrip("/")).read_bytes()
    digest = identity.split(":")[-1]
    value = json.loads(raw)
    if (
        sha256(raw).hexdigest() != digest or entry["sha256"] != digest
        or entry["bytes"] != len(raw) or value["schema_version"] != SCHEMA
        or value["claims"] != CLAIMS or value["kind"] != identity.split(":")[1]
        or value["sources"] != entry["sources"] or value["input_hash"] != entry["input_hash"]
        or value["as_of"] != entry["as_of"] or entry["scope"] != "REAL_DERIVED_REGIMES"
        or entry["licence"]["status"] != "ACTIVE"
        or "publish_derived" not in entry["licence"]["permitted_uses"]
    ):
        raise ValueError("Sealed projection bytes, lineage envelope or grant changed")
    return value


def receipts(directory):
    values = {}
    for path in sorted(directory.glob("receipt-*.json")):
        raw = path.read_bytes()
        if path.name != "receipt-" + sha256(raw).hexdigest() + ".json":
            raise ValueError("Retained receipt bytes changed")
        values[path.name] = json.loads(raw)
    return values


def verify_corrections(public, directory):
    """Archived correction receipts keep withdrawals enforceable after later exports."""
    public, directory = Path(public), Path(directory)
    manifest = json.loads((public / "replay-manifest.json").read_bytes())
    sealed = receipts(directory)
    withdrawn = set()
    for receipt in sealed.values():
        correction = receipt.get("publication_correction")
        if not correction:
            continue
        if correction["kind"] != CORRECTION or correction["new_runs"] != 0 or correction["holdout_openings"] != 0:
            raise ValueError("Publication correction cannot execute research")
        source = sealed[correction["source_receipt"]]
        expected = copy.deepcopy(source)
        expected["new_runs"] = 0
        expected["publication_correction"] = correction
        for record in correction["withdrawals"]:
            old, new = record["withdrawn_artifact"], record["replacement_artifact"]
            if not IDENTITY.fullmatch(old) or not old.startswith("regimes:factors:"):
                raise ValueError("Only unsafe Phase 5 factors may be withdrawn")
            old_path = public / "artifacts/replay" / (old.replace(":", "-") + ".json")
            if old in manifest["artifacts"] or old in manifest["routes"].values() or old_path.exists():
                raise ValueError("Withdrawn factor history is still anonymously served")
            binding = sealed[record["sealed_receipt"]]["markets"][record["asset"]]
            if (
                binding["artifacts"]["factors"] != old
                or binding["artifacts"]["snapshot"] != record["snapshot_artifact"]
                or binding["artifacts"]["lineage"] != record["lineage_artifact"]
                or binding["run_ids"]["factors"] != record["run_id"]
            ):
                raise ValueError("Correction differs from its immutable sealed run binding")
            value = load(public, manifest, new)
            snapshot = load(public, manifest, record["snapshot_artifact"])
            lineage = load(public, manifest, record["lineage_artifact"])
            validate_public("factors", value["payload"])
            if (
                value["as_of"] != record["as_of"] or value["as_of"] != snapshot["as_of"]
                or value["input_hash"] != snapshot["input_hash"] or value["sources"] != snapshot["sources"]
                or value["payload"]["asset"] != record["asset"]
                or snapshot["payload"]["run_ids"]["factors"] != record["run_id"]
                or lineage["payload"]["runs"]["factors"]["run_id"] != record["run_id"]
                or any(c["status"] != "VERIFIED" for c in lineage["payload"]["runs"].values())
                or value["payload"] != project_factor_summary(
                    record["asset"], snapshot["payload"]["factors"],
                    value["payload"]["rolling_tail"], snapshot["payload"]["factors"]["status"],
                )
            ):
                raise ValueError("Replacement is not a projection of the same sealed evidence")
            if expected["markets"][record["asset"]]["artifacts"]["factors"] == old:
                expected["markets"][record["asset"]]["artifacts"]["factors"] = new
            withdrawn.add(old)
        if receipt != expected:
            raise ValueError("Publication correction changed computation identity or unrelated evidence")
    # Audit every factor file, including an orphan not referenced by a route/manifest.
    for path in (public / "artifacts/replay").glob("regimes-factors-*.json"):
        identity = "regimes:factors:" + path.stem.removeprefix("regimes-factors-")
        if identity not in manifest["artifacts"]:
            raise ValueError("Orphan public factor artifact")
        validate_public("factors", load(public, manifest, identity)["payload"])
    return len(withdrawn)


def correct(public=None, directory=None):
    public = Path(public or ROOT / "frontend-v2/public")
    directory = Path(directory or ROOT / "data/exports/regimes_v0_1")
    pointer = public / "replay-manifest.json"
    manifest = json.loads(pointer.read_bytes())
    original_receipt = (directory / "receipt.json").read_bytes()
    sealed = receipts(directory)
    receipt_name = "receipt-" + sha256(original_receipt).hexdigest() + ".json"
    if receipt_name not in sealed:
        raise ValueError("Current evidence has no immutable sealed receipt")
    bindings = {}
    for name, receipt in sealed.items():
        if receipt.get("publication_correction"):
            continue
        for asset, market in receipt["markets"].items():
            bindings[market["artifacts"]["factors"]] = (name, asset, market)
    writes, records, replacements = {}, [], {}
    # Plan and validate everything before mutating any publication.
    for identity, entry in sorted(manifest["artifacts"].items()):
        if not identity.startswith("regimes:factors:"):
            continue
        old = load(public, manifest, identity)
        if "decomposition_tail" not in old["payload"]:
            validate_public("factors", old["payload"])
            continue
        name, asset, market = bindings[identity]
        snapshot = load(public, manifest, market["artifacts"]["snapshot"])
        lineage = load(public, manifest, market["artifacts"]["lineage"])
        if (
            old["as_of"] != snapshot["as_of"] or old["sources"] != snapshot["sources"]
            or old["input_hash"] != snapshot["input_hash"] or old["payload"]["asset"] != asset
            or snapshot["payload"]["run_ids"] != market["run_ids"]
            or lineage["payload"]["asset"] != asset
            or any(c["status"] != "VERIFIED" or c["run_id"] != market["run_ids"][key]
                   for key, c in lineage["payload"]["runs"].items())
        ):
            raise ValueError("Factor correction lost its verified sealed run binding")
        payload = project_factor_summary(asset, snapshot["payload"]["factors"], old["payload"]["rolling_tail"], old["payload"]["status"])
        validate_public("factors", payload)
        raw = canonical_bytes(envelope("factors", payload, as_of=old["as_of"], sources=old["sources"], input_hash=old["input_hash"]))
        digest = sha256(raw).hexdigest()
        new = "regimes:factors:" + digest
        url = "/artifacts/replay/" + new.replace(":", "-") + ".json"
        manifest["artifacts"][new] = {**entry, "url": url, "sha256": digest, "bytes": len(raw)}
        del manifest["artifacts"][identity]
        writes[public / url.lstrip("/")] = raw
        replacements[identity] = new
        records.append({
            "asset": asset, "as_of": old["as_of"], "run_id": market["run_ids"]["factors"],
            "sealed_receipt": name, "snapshot_artifact": market["artifacts"]["snapshot"],
            "lineage_artifact": market["artifacts"]["lineage"], "withdrawn_artifact": identity,
            "replacement_artifact": new, "reason": "PER_OBSERVATION_SOURCE_RECONSTRUCTION",
        })
    if not replacements:
        verify_corrections(public, directory)
        return {"status": "UNCHANGED", "new_runs": 0, "holdout_openings": 0, "replacements": 0}
    manifest["routes"] = {k: replacements.get(v, v) for k, v in manifest["routes"].items()}
    receipt = copy.deepcopy(sealed[receipt_name])
    for market in receipt["markets"].values():
        market["artifacts"]["factors"] = replacements[market["artifacts"]["factors"]]
    receipt["new_runs"] = 0
    receipt["publication_correction"] = {
        "kind": CORRECTION, "source_receipt": receipt_name,
        "projection_sha256": sha256((ROOT / "src/regimes/publication.py").read_bytes().replace(b"\r\n", b"\n")).hexdigest(),
        "withdrawals": records, "new_runs": 0, "holdout_openings": 0,
    }
    for path, raw in writes.items():
        if path.exists() and path.read_bytes() != raw:
            raise ValueError("Immutable replacement substitution")
        path.write_bytes(raw)
    raw = canonical_bytes(receipt)
    (directory / ("receipt-" + sha256(raw).hexdigest() + ".json")).write_bytes(raw)
    (directory / "receipt.json").write_bytes(raw)
    staged = pointer.with_suffix(".json.tmp")
    staged.write_bytes(canonical_bytes(manifest))
    staged.replace(pointer)
    # Explicit identity-checked Phase 5 paths only; older phases are never pruned.
    for identity in replacements:
        (public / "artifacts/replay" / (identity.replace(":", "-") + ".json")).unlink()
    verify_corrections(public, directory)
    return {"status": "CORRECTED", "new_runs": 0, "holdout_openings": 0, "replacements": len(replacements)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public", type=Path)
    parser.add_argument("--directory", type=Path)
    args = parser.parse_args()
    print(json.dumps(correct(args.public, args.directory), sort_keys=True))
