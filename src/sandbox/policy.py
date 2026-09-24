"""Host-side policy for the supervised Forge worker."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SandboxPolicy:
    max_artifacts: int = 32
    max_artifact_bytes: int = 10 * 1024 * 1024
    max_output_bytes: int = 1024 * 1024
    poll_interval_seconds: float = 0.01

    def __post_init__(self) -> None:
        if type(self.max_artifacts) is not int or self.max_artifacts < 1:
            raise ValueError("max_artifacts must be an integer >= 1")
        if type(self.max_artifact_bytes) is not int or self.max_artifact_bytes < 1:
            raise ValueError("max_artifact_bytes must be an integer >= 1")
        if type(self.max_output_bytes) is not int or self.max_output_bytes < 1:
            raise ValueError("max_output_bytes must be an integer >= 1")
        if self.poll_interval_seconds <= 0:
            raise ValueError("poll_interval_seconds must be > 0")

    def to_dict(self) -> dict[str, Any]:
        return {
            "max_artifacts": self.max_artifacts,
            "max_artifact_bytes": self.max_artifact_bytes,
            "max_output_bytes": self.max_output_bytes,
        }
