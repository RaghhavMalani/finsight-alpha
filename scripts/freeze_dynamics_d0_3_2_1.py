"""Materialize the frozen D0.3.2.1 failure-decomposition artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.verify_release_authorship import audit_release_authorship  # noqa: E402
from src.dynamics.failure_decomposition import (  # noqa: E402
    DEFAULT_D0321_ARTIFACT,
    run_failure_decomposition,
    verify_failure_decomposition,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_D0321_ARTIFACT)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output

    authorship = audit_release_authorship()
    if not authorship["valid"]:
        raise SystemExit("; ".join(authorship["errors"]))
    artifact = run_failure_decomposition()
    verification = verify_failure_decomposition(artifact)
    if not verification["valid"]:
        raise SystemExit("; ".join(verification["errors"]))
    if output.exists():
        existing = json.loads(output.read_text(encoding="utf-8"))
        if existing != artifact:
            raise SystemExit(
                f"refusing to replace a different D0.3.2.1 artifact at {output}"
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
                "worlds": artifact["evaluation"]["worlds"],
                "classifications": artifact["summary"]["classification_counts"],
                "targeted_repair_warranted": artifact["routing"][
                    "d0_3_3_targeted_repair_warranted"
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
