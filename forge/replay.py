"""Replay a content-addressed Forge trajectory."""

from __future__ import annotations

import argparse
from pathlib import Path

from src.replay import TrajectoryReplayer


LABELS = {
    "trajectory_integrity": "Trajectory",
    "task_identity": "Task identity",
    "world_snapshot": "World snapshot",
    "replay_sandbox": "Replay sandbox",
    "tool_sequence": "Tool sequence",
    "artifacts": "Artifacts",
    "finding": "Finding",
    "verifier_output": "Verifier output",
    "reward": "Reward",
}


def main() -> None:
    repository_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trajectory_hash")
    parser.add_argument(
        "--search-root",
        type=Path,
        default=repository_root / "data" / "exports",
    )
    parser.add_argument(
        "--work-root",
        type=Path,
        default=repository_root / "data" / "exports" / ".forge-replay-work",
    )
    args = parser.parse_args()
    result = TrajectoryReplayer(repository_root).replay_hash(
        args.trajectory_hash,
        search_root=args.search_root,
        work_root=args.work_root,
    )
    print(f"TRAJECTORY          {result.trajectory_id}")
    print(f"TASK                {result.task_id}")
    print(f"WORLD               {result.world_hash}")
    print("AGENT               research-agent-v0.2")
    print(f"MODEL               {result.model}")
    print()
    for key, matched in result.checks.items():
        print(f"{LABELS[key]:<20}{'MATCH' if matched else 'MISMATCH'}")
    print()
    print(f"REPLAY FIDELITY     {result.fidelity:.3%}")
    if not result.matched:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
