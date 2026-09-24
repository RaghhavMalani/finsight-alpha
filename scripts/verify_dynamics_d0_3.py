"""Verify the reproducible Dynamics D0.3 reference bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.dynamics import canonical_sha256
from src.dynamics.nonlinear import PARENT_ARTIFACT_HASH, PARENT_FILE_SHA256


DEFAULT_ARTIFACT = ROOT / "eval/dynamics/d0_3/nonlinear_certification.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", type=Path, default=DEFAULT_ARTIFACT)
    args = parser.parse_args()
    artifact_path = (
        args.artifact if args.artifact.is_absolute() else ROOT / args.artifact
    )
    bundle = json.loads(artifact_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    claimed_hash = bundle.get("artifact_hash")
    body = {key: value for key, value in bundle.items() if key != "artifact_hash"}
    calculated_hash = canonical_sha256(body)
    if claimed_hash != calculated_hash:
        errors.append("bundle artifact_hash does not match its canonical body")

    reference = bundle.get("reference", {})
    reference_claimed = reference.get("artifact_hash")
    reference_body = {
        key: value for key, value in reference.items() if key != "artifact_hash"
    }
    if reference_claimed != canonical_sha256(reference_body):
        errors.append("reference artifact_hash does not match its canonical body")
    if reference.get("schema_version") != "dynamics-nonlinear/0.3.0":
        errors.append("reference schema is not dynamics-nonlinear/0.3.0")
    if reference.get("parent", {}).get("artifact_hash") != PARENT_ARTIFACT_HASH:
        errors.append("reference does not inherit the frozen D0.2.1 content address")
    if reference.get("parent", {}).get("file_sha256") != PARENT_FILE_SHA256:
        errors.append("reference does not inherit the frozen D0.2.1 byte hash")
    if [model.get("code") for model in reference.get("models", [])] != [
        "M0",
        "M1",
        "M2",
        "M3",
    ]:
        errors.append("reference does not contain the frozen M0-M3 hierarchy")
    for code in ("M2", "M3"):
        ledger = reference.get("complexity_selection", {}).get(code, {})
        if (
            ledger.get("selected_before_outer_holdout") is not True
            or ledger.get("selection_boundary_index", 10**9)
            >= ledger.get("outer_holdout_start_index", -1)
        ):
            errors.append(f"{code} complexity was not frozen before holdout")
    if reference.get("verdicts", {}).get("economic") not in {"ACCEPT", "ABSTAIN"}:
        errors.append("reference omits an economic verdict")

    parent_path = ROOT / "eval/dynamics/d0_2_1/selection_aware_certification.json"
    actual_parent_file_hash = hashlib.sha256(parent_path.read_bytes()).hexdigest()
    if actual_parent_file_hash != PARENT_FILE_SHA256:
        errors.append("sealed D0.2.1 file bytes changed")

    report = {
        "artifact": str(artifact_path),
        "valid": not errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "parent_artifact_hash": reference.get("parent", {}).get("artifact_hash"),
        "parent_file_sha256": actual_parent_file_hash,
        "errors": errors,
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    raise SystemExit(0 if report["valid"] else 1)


if __name__ == "__main__":
    main()
