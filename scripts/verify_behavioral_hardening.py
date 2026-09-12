"""Independently verify a frozen Forge v0.2.5.1 hardening artifact."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.behavioral_hardening import load_hardening_suite, verify_hardening_artifact
from src.execution.trust import CertificationIndex


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "artifact",
        nargs="?",
        type=Path,
        default=ROOT / "data/exports/forge_v0_2_5_1_behavioral_hardening",
    )
    args = parser.parse_args()
    suite = load_hardening_suite(ROOT / "eval/tasks/forge_v0_2_5_1/suite.json")
    certifications = CertificationIndex.load(
        ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"
    )
    report = verify_hardening_artifact(
        args.artifact,
        suite=suite,
        certifications=certifications,
        root=ROOT,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    if not report["valid"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
