"""Host-graded, cumulative engine certification and system validity checks."""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
import re
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


DECLARED_ENGINES = ("vectorbt", "nautilus", "hftbacktest", "legacy-hft")
ENGINE_CERTIFICATION_TARGET = CertificationLevel.C4_STRESS_MUTATIONS
CERTIFIED = "CERTIFIED"
FAILED_CERTIFICATION = "FAILED_CERTIFICATION"


@dataclass(frozen=True)
class CertificationCheck:
    code: str
    level: CertificationLevel
    passed: bool
    evidence_hash: str
    detail: str

    def __post_init__(self) -> None:
        if not self.code or not isinstance(self.level, CertificationLevel) or type(self.passed) is not bool:
            raise ValueError("certification check requires a code, known level, and boolean result")
        if not re.fullmatch("[0-9a-f]{64}", self.evidence_hash):
            raise ValueError("certification evidence must be content-addressed")
        if not self.detail:
            raise ValueError("certification checks must explain their result")

    def to_dict(self) -> dict[str, object]:
        return {"code": self.code, "level": self.level.name, "passed": self.passed,
                "evidence_hash": self.evidence_hash, "detail": self.detail}


@dataclass(frozen=True)
class EngineCertificationArtifact:
    fingerprint: EngineFingerprint
    checks: tuple[CertificationCheck, ...]
    supported_tapes: tuple[str, ...]
    unsupported_tapes: Mapping[str, str]
    schema_version: str = "forge-certification/0.2.4"
    mandatory_tapes: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if len({check.code for check in self.checks}) != len(self.checks):
            raise ValueError("certification check codes must be unique")
        if len(set(self.supported_tapes)) != len(self.supported_tapes):
            raise ValueError("supported tapes must be unique")
        if set(self.supported_tapes) & set(self.unsupported_tapes):
            raise ValueError("a tape cannot be both supported and unsupported")
        if any(not isinstance(reason, str) or not reason.strip() for reason in self.unsupported_tapes.values()):
            raise ValueError("unsupported tapes require explicit reasons")

    @property
    def achieved_level(self) -> CertificationLevel | None:
        achieved = None
        for level in CertificationLevel:
            checks = [check for check in self.checks if check.level is level]
            if not checks or not all(check.passed for check in checks):
                break
            if level is CertificationLevel.C1_ACCOUNTING_EVENTS and set(self.mandatory_tapes) - set(self.supported_tapes):
                break
            achieved = level
        return achieved

    @property
    def status(self) -> str:
        return CERTIFIED if self.achieved_level is ENGINE_CERTIFICATION_TARGET else FAILED_CERTIFICATION

    def blocking_gates(self, required_level: CertificationLevel = ENGINE_CERTIFICATION_TARGET) -> list[dict[str, object]]:
        blockers = []
        for level in CertificationLevel:
            if level > required_level:
                break
            checks = [check for check in self.checks if check.level is level]
            failures = [check for check in checks if not check.passed]
            missing_tapes = set(self.mandatory_tapes) - set(self.supported_tapes) if level is CertificationLevel.C1_ACCOUNTING_EVENTS else set()
            if not checks or failures or missing_tapes:
                reasons = [check.detail for check in failures]
                if not checks:
                    reasons.append("required certification evidence is missing")
                if missing_tapes:
                    reasons.append("mandatory semantic tape coverage missing: " + ", ".join(sorted(missing_tapes)))
                blockers.append({"gate": f"C{level.value}", "engine": self.fingerprint.engine,
                                 "reason": "; ".join(reasons), "failed_checks": [check.code for check in failures]})
        return blockers

    @property
    def artifact_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    def to_dict(self) -> dict[str, object]:
        level = self.achieved_level
        return {
            "schema_version": self.schema_version,
            "engine_fingerprint": self.fingerprint.to_dict(),
            "engine_fingerprint_hash": self.fingerprint.fingerprint_hash,
            "certification_level": f"C{level.value}" if level is not None else None,
            "status": self.status,
            "blocking_gates": self.blocking_gates(),
            "checks": [check.to_dict() for check in self.checks],
            "mandatory_tapes": list(self.mandatory_tapes),
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
    def system_blocking_gates(self) -> list[dict[str, object]]:
        """Return failures of the certification system, never engine verdicts."""
        blockers = []
        engines = [item.fingerprint.engine for item in self.certifications]
        if len(engines) != len(set(engines)) or set(engines) != set(DECLARED_ENGINES):
            blockers.append({"gate": "CERTIFICATION_HARNESS", "reason": "artifact must contain exactly one record for each declared engine"})
        for item in self.certifications:
            present = {check.level for check in item.checks}
            missing = [f"C{level.value}" for level in CertificationLevel if level not in present]
            if missing:
                blockers.append({"gate": "CERTIFICATION_HARNESS", "engine": item.fingerprint.engine,
                                 "reason": "certification verdict evidence is missing: " + ", ".join(missing)})
        statuses = {comparison.status for comparison in self.comparisons}
        if ComparisonStatus.FAIL in statuses:
            blockers.append({"gate": "C3_COMPARISON_RULES", "reason": "a comparable semantic pair exceeded its contract or omitted a metric"})
        if ComparisonStatus.PASS not in statuses:
            blockers.append({"gate": "C3_COMPARISON_RULES", "reason": "equivalent-semantic convergence evidence is missing"})
        if ComparisonStatus.NOT_COMPARABLE not in statuses:
            blockers.append({"gate": "C3_COMPARISON_RULES", "reason": "intentional invalid-comparison rejection evidence is missing"})
        return blockers

    @property
    def system_valid(self) -> bool:
        return not self.system_blocking_gates

    @property
    def certification_summary(self) -> str:
        statuses = [item.status for item in self.certifications]
        if statuses and all(status == CERTIFIED for status in statuses):
            return "ALL_CERTIFIED"
        if statuses and all(status == FAILED_CERTIFICATION for status in statuses):
            return "NONE_CERTIFIED"
        return "MIXED"

    def to_dict(self) -> dict[str, object]:
        levels = [item.achieved_level for item in self.certifications]
        minimum = min(levels) if levels and all(value is not None for value in levels) else None
        available = [value for value in levels if value is not None]
        maximum = max(available) if available else None
        return {"certification_summary": self.certification_summary,
                "minimum_engine_level": f"C{minimum.value}" if minimum is not None else None,
                "maximum_engine_level": f"C{maximum.value}" if maximum is not None else None,
                "system_valid": self.system_valid,
                "system_blocking_gates": self.system_blocking_gates,
                "certifications": [item.to_dict() for item in self.certifications],
                "comparisons": [item.to_dict() for item in self.comparisons]}

    @property
    def artifact_hash(self) -> str:
        return canonical_sha256(self.to_dict())
