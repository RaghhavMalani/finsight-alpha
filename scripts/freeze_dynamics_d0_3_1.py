"""Materialize the frozen Dynamics D0.3.1 identifiability artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.dynamics.identifiability import (  # noqa: E402
    DEFAULT_D031_ARTIFACT,
    run_nonlinear_identifiability_suite,
    verify_identifiability_artifact,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_D031_ARTIFACT)
    parser.add_argument("--repetitions", type=int, default=10)
    parser.add_argument("--profile", choices=("reference", "smoke"), default="reference")
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output

    artifact = run_nonlinear_identifiability_suite(
        repetitions=args.repetitions,
        profile=args.profile,
    )
    verification = verify_identifiability_artifact(artifact)
    if not verification["valid"]:
        raise SystemExit("; ".join(verification["errors"]))
    if output.exists():
        existing = json.loads(output.read_text(encoding="utf-8"))
        if existing != artifact:
            raise SystemExit(
                f"refusing to replace a different D0.3.1 artifact at {output}"
            )
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(artifact, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    print(
        json.dumps(
            {
                "artifact": str(output),
                "artifact_hash": artifact["artifact_hash"],
                "runs": artifact["runs"],
                "capability_card": artifact["capability_card"],
                "valid": True,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
