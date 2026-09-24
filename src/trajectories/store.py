"""Append-only JSONL persistence for training-quality Forge trajectories."""

from __future__ import annotations

import json
import os
from pathlib import Path

from src.trajectories.schema import Trajectory


class TrajectoryStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def append(self, trajectory: Trajectory) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(
            trajectory.to_dict(),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ) + "\n"
        descriptor = os.open(
            self.path,
            os.O_APPEND | os.O_CREAT | os.O_WRONLY,
            0o644,
        )
        try:
            os.write(descriptor, line.encode("utf-8"))
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
