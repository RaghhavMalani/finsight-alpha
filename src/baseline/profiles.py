"""Offline policy configurations for the v0.2.1 systems baseline.

The weak/strong profiles are deterministic error emulators, not claims about
named external LLMs. They exercise reward discrimination without paid calls.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from src.eval.canonical import canonical_sha256
from src.findings import ResearchFinding, ResearchTask


@dataclass(frozen=True)
class BaselineProfile:
    name: str
    description: str
    fault_rate_percent: int
    model_kind: str

    def __post_init__(self) -> None:
        if not 0 <= self.fault_rate_percent <= 100:
            raise ValueError("fault_rate_percent must be between 0 and 100")

    def fault_for(self, task: ResearchTask) -> str | None:
        if self.fault_rate_percent == 0:
            return None
        digest = canonical_sha256(
            {"profile": self.name, "task_id": task.task_id, "seed": task.seed}
        )
        bucket = int(digest[:8], 16) % 100
        if bucket >= self.fault_rate_percent:
            return None
        selector = int(digest[8:16], 16) % 4
        return ("numerical", "evidence", "replay", "limitations")[selector]

    def transform(
        self,
        task: ResearchTask,
        finding: ResearchFinding,
    ) -> ResearchFinding:
        fault = self.fault_for(task)
        if fault is None:
            return finding
        if fault == "numerical" and finding.claims:
            original = finding.claims[0]
            shifted = original.value * 1.05 if original.value != 0.0 else 0.05
            claim = replace(original, value=shifted)
            return replace(finding, claims=(claim,) + finding.claims[1:])
        if fault == "evidence" and finding.evidence:
            return replace(finding, evidence=finding.evidence[:1])
        if fault == "replay" and finding.artifacts:
            artifact = finding.artifacts[0]
            mutated = replace(
                artifact,
                replay_hashes=(
                    artifact.content_hash,
                    canonical_sha256(
                        {"profile": self.name, "task": task.task_id, "seed": task.seed}
                    ),
                ),
            )
            return replace(finding, artifacts=(mutated,) + finding.artifacts[1:])
        if fault == "limitations":
            return replace(finding, limitations=())
        return finding

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "description": self.description,
            "fault_rate_percent": self.fault_rate_percent,
            "model_kind": self.model_kind,
        }


PROFILES: tuple[BaselineProfile, ...] = (
    BaselineProfile(
        name="deterministic-scripted",
        description="Current deterministic ResearchAgent recipe baseline.",
        fault_rate_percent=0,
        model_kind="scripted_policy",
    ),
    BaselineProfile(
        name="offline-weak-model",
        description="Deterministic 70% generic-error emulator; no external LLM call.",
        fault_rate_percent=70,
        model_kind="offline_error_emulator",
    ),
    BaselineProfile(
        name="offline-strong-model",
        description="Deterministic 20% generic-error emulator; no external LLM call.",
        fault_rate_percent=20,
        model_kind="offline_error_emulator",
    ),
)


def profile_by_name(name: str) -> BaselineProfile:
    for profile in PROFILES:
        if profile.name == name:
            return profile
    if name == "deterministic-baseline":
        return PROFILES[0]
    raise KeyError(f"unknown replay profile {name!r}")
