"""Serialization repair before the first D0.4.1 freeze; no refit or selection.

Replays only Hessian-derived uncertainty from the already generated, sealed
point-fit records. Truth, events, point fits, other methods and all thresholds
must stay identical. The symmetric Gaussian transport fixes numerical replay,
not calibration. This utility is intentionally limited to the one pre-freeze
generator commit, and may not process a previously frozen D0.4.1 artifact.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
from src.dynamics.hawkes_identifiability import (  # noqa: E402
    DEFAULT_D041_ARTIFACT,
    WORLD_SPECS,
    _hessian_uncertainty,
    _parent_seal,
    _round,
    normalized_source_sha256,
)
from src.dynamics.selection_freeze import canonical_sha256  # noqa: E402


def main() -> int:
    if DEFAULT_D041_ARTIFACT.exists():
        raise SystemExit("Refusing to alter any already frozen D0.4.1 artifact")
    candidate_path = ROOT / "data/.cache/dynamics-d0-4-1/candidate.json"
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    claimed = candidate.pop("artifact_hash")
    if canonical_sha256(candidate) != claimed:
        raise SystemExit("Candidate content address does not reconcile")
    before_source = (
        subprocess.check_output(
            ["git", "show", "36d4b68:src/dynamics/hawkes_identifiability.py"],
            cwd=ROOT,
        )
        .decode("utf-8")
        .replace("\r\n", "\n")
    )
    approved = hashlib.sha256(before_source.encode("utf-8")).hexdigest()
    if (
        candidate["implementation_sources"]["src/dynamics/hawkes_identifiability.py"]
        != approved
    ):
        raise SystemExit("Input is not the approved pre-freeze point-fit execution")
    parent = _parent_seal()
    if candidate["parent_seal"] != parent or len(candidate["worlds"]) != 420:
        raise SystemExit("Candidate parent or grid changed")
    prereg = ROOT / "docs/dynamics-lab-d0-4-1-preregistration.md"
    if candidate["preregistration"]["source_sha256"] != normalized_source_sha256(
        prereg
    ):
        raise SystemExit("Preregistration changed")
    key = canonical_sha256(
        {
            "generator": normalized_source_sha256(
                ROOT / "src/dynamics/hawkes_identifiability.py"
            ),
            "preregistration": normalized_source_sha256(prereg),
            "parent": parent,
        }
    )
    cache = ROOT / "data/.cache/dynamics-d0-4-1" / key
    cache.mkdir(parents=True, exist_ok=True)
    unchanged_before, unchanged_after = [], []
    for spec, record in zip(WORLD_SPECS, candidate["worlds"], strict=True):
        if (
            record["world"]["world_id"] != spec.world_id
            or record["world"]["seed"] != spec.seed
        ):
            raise SystemExit("Candidate identity changed")

        def invariant_payload() -> dict:
            return {
                **{k: v for k, v in record.items() if k != "uncertainty"},
                "uncertainty": {
                    k: v
                    for k, v in record["uncertainty"].items()
                    if k != "inverse_hessian"
                },
            }

        unchanged_before.append(canonical_sha256(invariant_payload()))
        record["uncertainty"]["inverse_hessian"] = _round(
            _hessian_uncertainty(
                record["fit"],
                np.asarray(record["truth"]["branching_matrix"]),
                seed=spec.seed + 10_000,
            )
        )
        unchanged_after.append(canonical_sha256(invariant_payload()))
        target = cache / (spec.world_id + ".json")
        staging = target.with_suffix(".json.tmp")
        staging.write_text(
            json.dumps(
                {
                    "cache_key": key,
                    "record_hash": canonical_sha256(record),
                    "record": record,
                },
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        staging.replace(target)
    if unchanged_before != unchanged_after:
        raise SystemExit(
            "Replay changed data, point fits, graphs or another instrument"
        )
    print(
        json.dumps(
            {
                "input_candidate_hash": claimed,
                "point_fit_source_commit": "36d4b68",
                "replayed_worlds": 420,
                "unchanged_evidence_digest": canonical_sha256(
                    {"records": unchanged_after}
                ),
                "cache_key": key,
                "scope": "HESSIAN_GAUSSIAN_TRANSPORT_ONLY",
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
