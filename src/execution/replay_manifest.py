"""Replay identity for certified execution runs."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Mapping

from src.eval.canonical import canonical_sha256
from src.execution.failures import BoundaryError, FailureCode


@dataclass(frozen=True)
class ExecutionReplayManifest:
    engine_fingerprint_hash: str
    request_hash: str
    result_hash: str
    replay_hash: str
    native_event_stream_hash: str
    canonical_event_stream_hash: str
    schema_version: str = "forge-replay/0.2.4"

    def __post_init__(self) -> None:
        if self.schema_version != "forge-replay/0.2.4":
            raise BoundaryError("unsupported replay manifest schema", FailureCode.SCHEMA_INVALID)
        for name in ("engine_fingerprint_hash", "request_hash", "result_hash", "replay_hash",
                     "native_event_stream_hash", "canonical_event_stream_hash"):
            value = getattr(self, name)
            if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
                raise BoundaryError(f"invalid replay manifest {name}", FailureCode.SCHEMA_INVALID)

    @property
    def manifest_hash(self) -> str:
        return canonical_sha256(self.to_dict(include_hash=False))

    @classmethod
    def from_result(cls, result: Any) -> "ExecutionReplayManifest":
        return cls(
            engine_fingerprint_hash=result.engine_fingerprint_hash,
            request_hash=result.request_hash, result_hash=result.result_hash,
            replay_hash=result.replay_hash,
            native_event_stream_hash=canonical_sha256([event.to_dict() for event in result.native_events]),
            canonical_event_stream_hash=canonical_sha256([event.to_dict() for event in result.canonical_events]),
        )

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ExecutionReplayManifest":
        data = dict(value)
        fields = {"schema_version", "engine_fingerprint_hash", "request_hash", "result_hash",
                  "replay_hash", "native_event_stream_hash", "canonical_event_stream_hash", "manifest_hash"}
        if set(data) != fields:
            raise BoundaryError("invalid replay manifest fields", FailureCode.SCHEMA_INVALID)
        supplied = data.pop("manifest_hash")
        result = cls(**data)
        if supplied != result.manifest_hash:
            raise BoundaryError("invalid execution replay manifest hash", FailureCode.REPLAY_MISMATCH)
        return result

    def to_dict(self, *, include_hash: bool = True) -> dict[str, str]:
        value = {
            "schema_version": self.schema_version,
            "engine_fingerprint_hash": self.engine_fingerprint_hash,
            "request_hash": self.request_hash, "result_hash": self.result_hash,
            "replay_hash": self.replay_hash,
            "native_event_stream_hash": self.native_event_stream_hash,
            "canonical_event_stream_hash": self.canonical_event_stream_hash,
        }
        if include_hash:
            value["manifest_hash"] = self.manifest_hash
        return value
