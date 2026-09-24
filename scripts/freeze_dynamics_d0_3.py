"""Materialize the reproducible Dynamics D0.3 reference bundle."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.dynamics import (
    canonical_sha256,
    generate_nonlinear_reference,
    run_nonlinear_certification_suite,
)


DEFAULT_OUTPUT = ROOT / "eval/dynamics/d0_3/nonlinear_certification.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--repetitions", type=int, default=2)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output

    bundle = {
        "schema_version": "dynamics-nonlinear-reference/0.3.0",
        "reference": generate_nonlinear_reference(),
        "certification": run_nonlinear_certification_suite(args.repetitions),
    }
    bundle["artifact_hash"] = canonical_sha256(bundle)

    if output.exists():
        existing = json.loads(output.read_text(encoding="utf-8"))
        if existing != bundle:
            raise SystemExit(f"refusing to replace a different D0.3 artifact at {output}")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(bundle, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    print(
        json.dumps(
            {
                "artifact": str(output),
                "artifact_hash": bundle["artifact_hash"],
                "parent_artifact_hash": bundle["reference"]["parent"]["artifact_hash"],
                "selected_model": bundle["reference"]["verdicts"]["selected_model"],
                "nonlinear_verdict": bundle["reference"]["verdicts"][
                    "nonlinear_dynamics"
                ],
                "control_metrics": bundle["certification"]["metrics"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
