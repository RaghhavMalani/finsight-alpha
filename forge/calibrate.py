"""Generate the immutable Forge v0.2.2 reward-calibration artifact."""

from __future__ import annotations

import argparse
from pathlib import Path

from src.calibration.runner import CalibrationFreezeRunner


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--baseline",
        type=Path,
        default=root / "data" / "exports" / "forge_v0_2_baseline",
    )
    parser.add_argument(
        "--tasks",
        type=Path,
        default=root / "eval" / "tasks" / "forge_v0_2",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "data" / "exports" / "forge_v0_2_reward_calibration",
    )
    args = parser.parse_args()
    manifest = CalibrationFreezeRunner(
        baseline=args.baseline,
        tasks=args.tasks,
        output=args.output,
    ).run()
    print(f"TAG            {manifest['tag']}")
    print(f"CALIBRATION    {manifest['calibration_id']}")
    print(f"SOURCE         {manifest['source']['baseline_id']}")
    print(
        "AUC            "
        f"{manifest['results']['old_reward_discrimination_auc']:.6f} -> "
        f"{manifest['results']['new_reward_discrimination_auc']:.6f}"
    )
    print(
        "MEDIAN GAP     "
        f"{manifest['results']['old_median_separation']:.6f} -> "
        f"{manifest['results']['new_median_separation']:.6f}"
    )
    print(f"ACCEPTED       {manifest['results']['accepted']}")
    print(f"OUTPUT         {args.output.resolve()}")


if __name__ == "__main__":
    main()
