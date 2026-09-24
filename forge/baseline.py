"""Generate the immutable FORGE_BASELINE_V0_2 artifact."""

from __future__ import annotations

import argparse
from pathlib import Path

from src.baseline import BaselineFreezeRunner


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tasks",
        type=Path,
        default=root / "eval" / "tasks" / "forge_v0_2",
    )
    parser.add_argument(
        "--splits",
        type=Path,
        default=root / "eval" / "splits" / "forge_v0_2.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "data" / "exports" / "forge_v0_2_baseline",
    )
    args = parser.parse_args()
    manifest = BaselineFreezeRunner(
        tasks=args.tasks,
        splits=args.splits,
        output=args.output,
    ).run()
    print(f"TAG            {manifest['tag']}")
    print(f"BASELINE       {manifest['baseline_id']}")
    print(f"EPISODES       {manifest['episodes']}")
    print(f"VERIFIED       {manifest['verified']}")
    print(f"REWARD VAR     {manifest['reward_variance']:.6f}")
    print(f"OUTPUT         {args.output.resolve()}")


if __name__ == "__main__":
    main()
