"""Verify the immutable Dynamics D0.2.1 reference certification."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.dynamics import verify_selection_freeze


DEFAULT_ARTIFACT = (
    ROOT / "eval/dynamics/d0_2_1/selection_aware_certification.json"
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", type=Path, default=DEFAULT_ARTIFACT)
    args = parser.parse_args()
    artifact_path = (
        args.artifact if args.artifact.is_absolute() else ROOT / args.artifact
    )
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    report = verify_selection_freeze(artifact)
    report["artifact"] = str(artifact_path)
    print(json.dumps(report, indent=2, sort_keys=True))
    raise SystemExit(0 if report["valid"] else 1)


if __name__ == "__main__":
    main()
