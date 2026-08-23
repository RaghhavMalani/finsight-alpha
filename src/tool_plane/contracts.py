"""Typed request/response records for the Forge capability plane."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.eval.canonical import canonical_sha256


@dataclass(frozen=True)
class ToolProvenance:
    as_of: str
    dataset_id: str
    snapshot_hash: str
    retrieved_at: str
    epistemic_state: str = "historical_observation"

    def to_dict(self) -> dict[str, Any]:
        return {
            "as_of": self.as_of,
            "dataset_id": self.dataset_id,
            "snapshot_hash": self.snapshot_hash,
            "retrieved_at": self.retrieved_at,
            "epistemic_state": self.epistemic_state,
        }


@dataclass(frozen=True)
class ToolResult:
    value: Any
    provenance: ToolProvenance
    success: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "value": self.value,
            "provenance": self.provenance.to_dict(),
            "success": self.success,
        }


@dataclass(frozen=True)
class ToolAction:
    sequence: int
    state: str
    tool: str
    arguments: dict[str, Any]
    result: ToolResult

    @property
    def action_hash(self) -> str:
        return canonical_sha256(self.to_dict(include_hash=False))

    def to_dict(self, *, include_hash: bool = True) -> dict[str, Any]:
        value = {
            "sequence": self.sequence,
            "state": self.state,
            "tool": self.tool,
            "arguments": self.arguments,
            "result": self.result.to_dict(),
        }
        if include_hash:
            value["action_hash"] = self.action_hash
        return value


class ToolInvocationError(ValueError):
    """Raised when a typed tool request does not match its declared contract."""
