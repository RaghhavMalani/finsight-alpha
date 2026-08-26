"""Host-graded certification artifacts; workers cannot certify themselves."""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Mapping

from src.eval.canonical import canonical_sha256
from src.execution.comparison import ComparisonResult, ComparisonStatus
from src.execution.fingerprints import EngineFingerprint


class CertificationLevel(IntEnum):
    C0_PROTOCOL_SCHEMA = 0
    C1_ACCOUNTING_EVENTS = 1
    C2_EXACT_REPLAY = 2
    C3_SCOPED_AGREEMENT = 3
    C4_STRESS_MUTATIONS = 4


@dataclass(frozen=True)
class CertificationCheck:
    code: str
    level: CertificationLevel
    passed: bool
    evidence_hash: str
    detail: str


@dataclass(frozen=True)
class EngineCertificationArtifact:
    fingerprint: EngineFingerprint
    checks: tuple[CertificationCheck, ...]
    supported_tapes: tuple[str, ...]
    unsupported_tapes: Mapping[str, str]
    schema_version: str = "forge-certification/0.2.4"

    @property
    def achieved_level(self) -> CertificationLevel | None:
        achieved = None
        for level in CertificationLevel:
            checks = [check for check in self.checks if check.level is level]
            if not checks or not all(check.passed for check in checks):
                break
            achieved = level
        return achieved

    @property
    def artifact_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "engine_fingerprint": self.fingerprint.to_dict(),
            "engine_fingerprint_hash": self.fingerprint.fingerprint_hash,
            "checks": [{"code": check.code, "level": check.level.name, "passed": check.passed, "evidence_hash": check.evidence_hash, "detail": check.detail} for check in self.checks],
            "supported_tapes": list(self.supported_tapes),
            "unsupported_tapes": dict(sorted(self.unsupported_tapes.items())),
        }


@dataclass(frozen=True)
class CertificationBenchmarkArtifact:
    certifications: tuple[EngineCertificationArtifact, ...]
    comparisons: tuple[ComparisonResult, ...]

    @property
    def engine_fingerprint_hashes(self) -> tuple[str, ...]:
        return tuple(sorted(item.fingerprint.fingerprint_hash for item in self.certifications))

    @property
    def passed(self) -> bool:
        return len(self.certifications) == 4 and all(item.achieved_level is CertificationLevel.C4_STRESS_MUTATIONS for item in self.certifications) and all(item.status is not ComparisonStatus.FAIL for item in self.comparisons)

    @property
    def artifact_hash(self) -> str:
        return canonical_sha256({"fingerprints": self.engine_fingerprint_hashes, "certifications": [item.artifact_hash for item in self.certifications], "comparisons": [{"status": item.status.value, "capability": item.capability, "metric_deltas": dict(item.metric_deltas), "reason": item.reason} for item in self.comparisons]})
