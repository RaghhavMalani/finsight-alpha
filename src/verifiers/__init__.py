"""Deterministic verifier stages for machine-actionable research findings."""

from .core import CheckResult, VerificationContext, VerificationResult, VerificationStatus
from .specs import EvidenceRequirement, NumericExpectation
from .suite import VerifierSuite

__all__ = [
    "CheckResult",
    "EvidenceRequirement",
    "NumericExpectation",
    "VerificationContext",
    "VerificationResult",
    "VerificationStatus",
    "VerifierSuite",
]
