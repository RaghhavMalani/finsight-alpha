"""Content-addressed identity for independently installed execution engines."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping

from src.eval.canonical import canonical_sha256


_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_REVISION = re.compile(r"^[0-9a-f]{7,64}$")


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return value.strip()


def _digest(value: Any, name: str) -> str:
    value = _text(value, name).lower()
    if _SHA256.fullmatch(value) is None:
        raise ValueError(f"{name} must be a lowercase SHA-256 digest")
    return value


@dataclass(frozen=True)
class EngineFingerprint:
    """Exact engine, adapter, runtime, dependency, image, and platform identity."""

    engine: str
    engine_version: str
    upstream_commit: str
    python_version: str
    rust_version: str
    dependency_lock_hash: str
    worker_image_hash: str
    platform: str
    adapter_version: str = "forge-0.2.4"

    def __post_init__(self) -> None:
        for name in (
            "engine", "engine_version", "python_version", "rust_version",
            "platform", "adapter_version",
        ):
            object.__setattr__(self, name, _text(getattr(self, name), name))
        revision = _text(self.upstream_commit, "upstream_commit").lower()
        if _REVISION.fullmatch(revision) is None:
            raise ValueError("upstream_commit must be a 7-64 character lowercase hex revision")
        object.__setattr__(self, "upstream_commit", revision)
        for name in ("dependency_lock_hash", "worker_image_hash"):
            object.__setattr__(self, name, _digest(getattr(self, name), name))
        if self.adapter_version != "forge-0.2.4":
            raise ValueError("certified adapters must use forge-0.2.4")

    @property
    def fingerprint_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "EngineFingerprint":
        fields = {
            "engine", "engine_version", "upstream_commit", "adapter_version",
            "python_version", "rust_version", "dependency_lock_hash",
            "worker_image_hash", "platform",
        }
        data = dict(value)
        if set(data) != fields:
            raise ValueError(f"engine fingerprint fields must be exactly {sorted(fields)}")
        return cls(**data)

    def to_dict(self) -> dict[str, str]:
        return {
            "engine": self.engine,
            "engine_version": self.engine_version,
            "upstream_commit": self.upstream_commit,
            "adapter_version": self.adapter_version,
            "python_version": self.python_version,
            "rust_version": self.rust_version,
            "dependency_lock_hash": self.dependency_lock_hash,
            "worker_image_hash": self.worker_image_hash,
            "platform": self.platform,
        }

