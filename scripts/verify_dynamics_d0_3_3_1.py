"""Verify the frozen Dynamics D0.3.3.1 generalization autopsy."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.dynamics.generalization_autopsy import (  # noqa: E402
    DEFAULT_D0331_ARTIFACT,
    verify_generalization_autopsy,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", type=Path, default=DEFAULT_D0331_ARTIFACT)
    args = parser.parse_args()
    artifact_path = (
        args.artifact if args.artifact.is_absolute() else ROOT / args.artifact
    )
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    report = {
        "artifact": str(artifact_path),
        **verify_generalization_autopsy(artifact),
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    raise SystemExit(0 if report["valid"] else 1)


if __name__ == "__main__":
    main()
