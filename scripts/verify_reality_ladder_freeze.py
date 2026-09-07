"""Independently verify the frozen Forge v0.2.4.1 Reality Ladder artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.execution.reality_ladder_verify import verify_reality_ladder_file


DEFAULT_ARTIFACT = ROOT / "eval/reality_ladder/forge_v0_2_4_1/reality_ladder_artifact.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", type=Path, default=DEFAULT_ARTIFACT)
    args = parser.parse_args()
    artifact = args.artifact if args.artifact.is_absolute() else ROOT / args.artifact
    report = verify_reality_ladder_file(artifact, root=ROOT)
    print(json.dumps(report, indent=2, sort_keys=True))
    raise SystemExit(0 if report["valid"] else 1)


if __name__ == "__main__":
    main()
