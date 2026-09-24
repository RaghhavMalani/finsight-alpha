"""Registry and deterministic execution order for Forge verifiers."""

from __future__ import annotations

from typing import Iterable, Mapping

from src.verifiers.core import VerificationContext, VerificationResult, Verifier
from src.verifiers.evidence import EvidenceVerifier
from src.verifiers.numerical import NumericalVerifier
from src.verifiers.reproducibility import ReproducibilityVerifier
from src.verifiers.robustness import RobustnessVerifier
from src.verifiers.temporal import TemporalVerifier


class VerifierSuite:
    def __init__(self, verifiers: Iterable[Verifier] | None = None) -> None:
        configured = tuple(
            verifiers
            or (
                TemporalVerifier(),
                EvidenceVerifier(),
                NumericalVerifier(),
                ReproducibilityVerifier(),
                RobustnessVerifier(),
            )
        )
        self._verifiers: Mapping[str, Verifier] = {
            verifier.name: verifier for verifier in configured
        }
        if len(self._verifiers) != len(configured):
            raise ValueError("verifier names must be unique")

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(sorted(self._verifiers))

    def run(
        self,
        context: VerificationContext,
        names: Iterable[str] | None = None,
    ) -> tuple[VerificationResult, ...]:
        requested = tuple(names or context.task.required_verifiers)
        unknown = set(requested) - set(self._verifiers)
        if unknown:
            raise ValueError(f"unknown verifiers requested: {sorted(unknown)}")
        return tuple(self._verifiers[name].verify(context) for name in requested)
