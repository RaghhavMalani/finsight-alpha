"""Immutable, content-addressed manifests for generated-code execution."""

from __future__ import annotations

import platform
import re
from dataclasses import dataclass, replace
from typing import Any, Iterable

from src.eval.canonical import canonical_sha256, sha256_bytes
from src.sandbox.exceptions import SandboxManifestError


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def _digest(value: str, label: str) -> str:
    if not isinstance(value, str) or SHA256_PATTERN.fullmatch(value.lower()) is None:
        raise SandboxManifestError(f"{label} must be a lowercase SHA-256 digest")
    return value.lower()


def hash_input_files(files: dict[str, bytes]) -> str:
    """Hash a logical input tree without depending on host paths."""

    return canonical_sha256(
        {
            name.replace("\\", "/"): sha256_bytes(payload)
            for name, payload in sorted(files.items())
        }
    )


def environment_lock_hash(dependencies: Iterable[str]) -> str:
    """Hash the installed versions of every declared third-party dependency."""

    from importlib import metadata

    locked: dict[str, str] = {}
    for dependency in sorted(set(dependencies)):
        try:
            locked[dependency] = metadata.version(dependency)
        except metadata.PackageNotFoundError:
            locked[dependency] = "stdlib-or-uninstalled"
    return canonical_sha256(locked)


@dataclass(frozen=True)
class SandboxManifest:
    """Everything that can affect one replayable experiment."""

    task_id: str
    as_of: str
    seed: int
    python_version: str
    dependency_lock_hash: str
    dataset_hash: str
    cpu_limit: int = 2
    memory_mb: int = 512
    timeout_seconds: float = 30.0
    network: bool = False
    allowed_dependencies: tuple[str, ...] = (
        "json",
        "math",
        "statistics",
        "decimal",
        "datetime",
        "csv",
        "random",
    )
    program_hash: str = "0" * 64

    def __post_init__(self) -> None:
        if not isinstance(self.task_id, str) or not self.task_id.strip():
            raise SandboxManifestError("task_id must be non-empty")
        if not isinstance(self.as_of, str) or not self.as_of.strip():
            raise SandboxManifestError("as_of must be non-empty")
        if type(self.seed) is not int or self.seed < 0:
            raise SandboxManifestError("seed must be an integer >= 0")
        if not isinstance(self.python_version, str) or not self.python_version.strip():
            raise SandboxManifestError("python_version must be non-empty")
        object.__setattr__(
            self,
            "dependency_lock_hash",
            _digest(self.dependency_lock_hash, "dependency_lock_hash"),
        )
        object.__setattr__(self, "dataset_hash", _digest(self.dataset_hash, "dataset_hash"))
        object.__setattr__(self, "program_hash", _digest(self.program_hash, "program_hash"))
        if type(self.cpu_limit) is not int or self.cpu_limit < 1:
            raise SandboxManifestError("cpu_limit must be an integer >= 1")
        if type(self.memory_mb) is not int or self.memory_mb < 16:
            raise SandboxManifestError("memory_mb must be an integer >= 16")
        if type(self.timeout_seconds) not in {int, float} or self.timeout_seconds <= 0:
            raise SandboxManifestError("timeout_seconds must be > 0")
        dependencies = tuple(sorted(set(self.allowed_dependencies)))
        if any(not isinstance(item, str) or not item.strip() for item in dependencies):
            raise SandboxManifestError("allowed_dependencies must contain names")
        object.__setattr__(self, "allowed_dependencies", dependencies)
        object.__setattr__(self, "timeout_seconds", float(self.timeout_seconds))

    @classmethod
    def build(
        cls,
        *,
        task_id: str,
        as_of: str,
        seed: int,
        dataset_hash: str,
        allowed_dependencies: Iterable[str] = (),
        cpu_limit: int = 2,
        memory_mb: int = 512,
        timeout_seconds: float = 30.0,
    ) -> "SandboxManifest":
        declared = tuple(allowed_dependencies) or cls.allowed_dependencies
        return cls(
            task_id=task_id,
            as_of=as_of,
            seed=seed,
            python_version=f"{platform.python_version_tuple()[0]}.{platform.python_version_tuple()[1]}",
            dependency_lock_hash=environment_lock_hash(declared),
            dataset_hash=dataset_hash,
            cpu_limit=cpu_limit,
            memory_mb=memory_mb,
            timeout_seconds=timeout_seconds,
            network=False,
            allowed_dependencies=tuple(declared),
        )

    def bind_program(self, code: str) -> "SandboxManifest":
        if not isinstance(code, str) or not code.strip():
            raise SandboxManifestError("sandbox program must be non-empty")
        return replace(self, program_hash=sha256_bytes(code.encode("utf-8")))

    @property
    def manifest_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "as_of": self.as_of,
            "seed": self.seed,
            "python_version": self.python_version,
            "dependency_lock_hash": self.dependency_lock_hash,
            "dataset_hash": self.dataset_hash,
            "cpu_limit": self.cpu_limit,
            "memory_mb": self.memory_mb,
            "timeout_seconds": self.timeout_seconds,
            "network": self.network,
            "allowed_dependencies": list(self.allowed_dependencies),
            "program_hash": self.program_hash,
        }
