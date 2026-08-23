"""Verifier for finite claims against frozen numerical oracles."""

from __future__ import annotations

from src.verifiers.core import CheckResult, VerificationContext, VerificationResult


class NumericalVerifier:
    name = "numerical"

    def verify(self, context: VerificationContext) -> VerificationResult:
        claims = {claim.claim_id: claim for claim in context.finding.claims}
        checks: list[CheckResult] = []
        for expectation in context.numeric_expectations:
            claim = claims.get(expectation.claim_id)
            if claim is None:
                checks.append(
                    CheckResult(
                        code=f"claim:{expectation.claim_id}",
                        passed=False,
                        message="required numerical claim is missing",
                    )
                )
                continue
            tolerance = max(
                expectation.absolute_tolerance,
                expectation.relative_tolerance * abs(expectation.expected),
            )
            error = abs(claim.value - expectation.expected)
            metadata_matches = (
                claim.metric == expectation.metric and claim.unit == expectation.unit
            )
            checks.append(
                CheckResult(
                    code=f"claim:{expectation.claim_id}",
                    passed=metadata_matches and error <= tolerance,
                    message="claim matches the frozen numerical oracle within tolerance",
                    details={
                        "actual": claim.value,
                        "expected": expectation.expected,
                        "absolute_error": error,
                        "tolerance": tolerance,
                        "actual_metric": claim.metric,
                        "expected_metric": expectation.metric,
                        "actual_unit": claim.unit,
                        "expected_unit": expectation.unit,
                    },
                )
            )
        return VerificationResult.from_checks(self.name, checks)
