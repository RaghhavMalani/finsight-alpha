"""Materialize the frozen Dynamics D0.3.2 estimator tournament artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.verify_release_authorship import audit_release_authorship  # noqa: E402
from src.dynamics.estimator_tournament import (  # noqa: E402
    DEFAULT_D032_ARTIFACT,
    run_estimator_tournament,
    verify_estimator_tournament,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_D032_ARTIFACT)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output

    authorship = audit_release_authorship()
    if not authorship["valid"]:
        raise SystemExit("; ".join(authorship["errors"]))
    artifact = run_estimator_tournament()
    verification = verify_estimator_tournament(artifact)
    if not verification["valid"]:
        raise SystemExit("; ".join(verification["errors"]))
    if output.exists():
        existing = json.loads(output.read_text(encoding="utf-8"))
        if existing != artifact:
            raise SystemExit(f"refusing to replace a different D0.3.2 artifact at {output}")
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
                "worlds": artifact["evaluation"]["worlds"],
                "graduated": [
                    row["estimator_id"] for row in artifact["graduation"] if row["graduated"]
                ],
                "authorship_gate": authorship["valid"],
                "valid": True,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
