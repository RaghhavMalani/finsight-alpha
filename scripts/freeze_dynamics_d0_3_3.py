"""Materialize the frozen D0.3.3 targeted-recovery artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.verify_release_authorship import audit_release_authorship  # noqa: E402
from src.dynamics.targeted_recovery import (  # noqa: E402
    DEFAULT_D033_ARTIFACT,
    run_targeted_recovery,
    verify_targeted_recovery,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_D033_ARTIFACT)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output

    authorship = audit_release_authorship()
    if not authorship["valid"]:
        raise SystemExit("; ".join(authorship["errors"]))
    artifact = run_targeted_recovery("reference")
    verification = verify_targeted_recovery(artifact)
    if not verification["valid"]:
        raise SystemExit("; ".join(verification["errors"]))
    if output.exists():
        existing = json.loads(output.read_text(encoding="utf-8"))
        if existing != artifact:
            raise SystemExit(
                f"refusing to replace a different D0.3.3 artifact at {output}"
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
                "development_worlds": artifact["evaluation"]["development_worlds"],
                "confirmation_worlds": artifact["evaluation"]["confirmation_worlds"],
                "historical_worlds": artifact["evaluation"]["historical_worlds"],
                "graduation": artifact["graduation"],
                "authorship_gate": authorship["valid"],
                "valid": True,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
