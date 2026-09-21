"""Materialize the immutable Dynamics D0.2.1 reference certification."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.dynamics import generate_stat_arb_reference, verify_selection_freeze


DEFAULT_OUTPUT = (
    ROOT / "eval/dynamics/d0_2_1/selection_aware_certification.json"
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output

    artifact = generate_stat_arb_reference()
    report = verify_selection_freeze(artifact)
    if not report["valid"]:
        raise SystemExit(json.dumps(report, indent=2, sort_keys=True))

    if output.exists():
        existing = json.loads(output.read_text(encoding="utf-8"))
        if existing != artifact:
            raise SystemExit(
                f"refusing to replace a different frozen artifact at {output}"
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
                "candidate_compression": artifact["candidate_compression"]["notation"],
                "search_survival_rate": artifact["search_survival_rate"]["fraction"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
