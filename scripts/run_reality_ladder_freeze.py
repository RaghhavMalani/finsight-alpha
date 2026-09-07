"""Run and immutably write the Forge v0.2.4.1 Reality Ladder."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.execution.reality_ladder_batch_runner import RealityLadderBatchFreezeRunner
from src.execution.reality_ladder_verify import verify_reality_ladder_file


DEFAULT_OUTPUT = ROOT / "eval/reality_ladder/forge_v0_2_4_1/reality_ladder_artifact.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine-env-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output
    runner = RealityLadderBatchFreezeRunner(
        root=ROOT,
        engine_env_root=args.engine_env_root if args.engine_env_root.is_absolute() else ROOT / args.engine_env_root,
        output=output,
    )
    artifact = runner.run()
    report = verify_reality_ladder_file(output, root=ROOT)
    if not report["valid"]:
        raise SystemExit(json.dumps(report, indent=2, sort_keys=True))
    print(json.dumps({
        "artifact": str(output),
        "artifact_hash": artifact["artifact_hash"],
        "evidence_hash": artifact["evidence_hash"],
        "alpha_survival_ratio": artifact["aggregate"]["alpha_survival_ratio"],
        "finding": artifact["aggregate"]["finding"],
        "records": len(artifact["records"]),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
