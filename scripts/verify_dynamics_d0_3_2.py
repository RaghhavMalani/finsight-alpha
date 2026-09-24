"""Verify the frozen Dynamics D0.3.2 estimator tournament artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.dynamics.estimator_tournament import (  # noqa: E402
    DEFAULT_D032_ARTIFACT,
    verify_estimator_tournament,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", type=Path, default=DEFAULT_D032_ARTIFACT)
    args = parser.parse_args()
    artifact_path = args.artifact if args.artifact.is_absolute() else ROOT / args.artifact
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    report = {"artifact": str(artifact_path), **verify_estimator_tournament(artifact)}
    print(json.dumps(report, indent=2, sort_keys=True))
    raise SystemExit(0 if report["valid"] else 1)


if __name__ == "__main__":
    main()
