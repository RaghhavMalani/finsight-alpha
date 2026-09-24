"""Independently verify a completed Forge v0.2.5 baseline artifact."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.behavioral.baseline import verify_baseline_artifact
from src.behavioral.contracts import load_behavioral_suite
from src.execution.trust import CertificationIndex


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    args = parser.parse_args()
    report = verify_baseline_artifact(
        args.artifact,
        suite=load_behavioral_suite(ROOT / "eval/tasks/forge_v0_2_5/suite.json"),
        certifications=CertificationIndex.load(
            ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"
        ),
        root=ROOT,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    if not report["valid"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
