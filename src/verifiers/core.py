"""Shared verifier result and context contracts."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Protocol

from src.findings.schema import ResearchFinding, ResearchTask
from src.sandbox.runner import ExecutionResult
from src.world.market_world import MarketWorld

if False:  # pragma: no cover - type-checking-only forward declarations
    from src.verifiers.specs import EvidenceRequirement, NumericExpectation


class VerificationStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    NOT_MEASURED = "not_measured"


@dataclass(frozen=True)
class CheckResult:
    code: str
    passed: bool
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "passed": self.passed,
            "message": self.message,
            "details": self.details,
        }


@dataclass(frozen=True)
class VerificationResult:
    verifier: str
    status: VerificationStatus
    score: float
    checks: tuple[CheckResult, ...]
    engine_fingerprint_hashes: tuple[str, ...] = ()

    @classmethod
    def from_checks(
        cls,
        verifier: str,
        checks: tuple[CheckResult, ...] | list[CheckResult],
    ) -> "VerificationResult":
        frozen = tuple(checks)
        if not frozen:
            return cls(verifier, VerificationStatus.NOT_MEASURED, 0.0, ())
        passed = sum(check.passed for check in frozen)
        return cls(
            verifier=verifier,
            status=(
                VerificationStatus.PASS
                if passed == len(frozen)
                else VerificationStatus.FAIL
            ),
            score=passed / len(frozen),
            checks=frozen,
        )

    def to_dict(self) -> dict[str, Any]:
        value = {
            "verifier": self.verifier,
            "status": self.status.value,
            "score": self.score,
            "checks": [check.to_dict() for check in self.checks],
        }
        if self.engine_fingerprint_hashes:
            value["engine_fingerprint_hashes"] = list(self.engine_fingerprint_hashes)

        return value

@dataclass(frozen=True)
class VerificationContext:
    task: ResearchTask
    finding: ResearchFinding
    world: MarketWorld
    numeric_expectations: tuple["NumericExpectation", ...] = ()
    evidence_requirements: tuple["EvidenceRequirement", ...] = ()
    minimum_replays: int = 2
    executions: tuple[ExecutionResult, ...] = ()


class Verifier(Protocol):
    name: str

    def verify(self, context: VerificationContext) -> VerificationResult:
        ...
