"""Freeze diagnostic-only D0.4.1.1 after independent verification."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.dynamics.hawkes_boundary import ARTIFACT, run_boundary_experiment  # noqa: E402
from src.dynamics.hawkes_boundary_verifier import verify_hawkes_boundary  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    if ARTIFACT.exists():
        raise SystemExit(
            "Frozen evidence already exists; use the verifier, not a refreeze."
        )
    payload = run_boundary_experiment(workers=args.workers)
    candidate = ROOT / "data/.cache/dynamics-d0-4-1-1/candidate.json"
    candidate.parent.mkdir(parents=True, exist_ok=True)
    candidate.write_text(
        json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    report = verify_hawkes_boundary(payload)
    print(json.dumps(report, sort_keys=True), flush=True)
    if not report["valid"]:
        raise SystemExit("Independent verification failed; candidate is not certified.")
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    staging = ARTIFACT.with_suffix(".json.tmp")
    staging.write_text(
        json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    staging.replace(ARTIFACT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
