"""Replay identity for certified execution runs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from src.eval.canonical import canonical_sha256


@dataclass(frozen=True)
class ExecutionReplayManifest:
    engine_fingerprint_hash: str
    request_hash: str
    result_hash: str
    replay_hash: str
    native_event_stream_hash: str
    canonical_event_stream_hash: str
    schema_version: str = "forge-replay/0.2.4"

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
        supplied = data.pop("manifest_hash", None)
        result = cls(**data)
        if supplied is not None and supplied != result.manifest_hash:
            raise ValueError("invalid execution replay manifest hash")
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

