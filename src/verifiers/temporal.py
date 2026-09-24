"""Verifier for observation and availability boundaries."""

from __future__ import annotations

from src.verifiers.core import CheckResult, VerificationContext, VerificationResult


class TemporalVerifier:
    name = "temporal"

    def verify(self, context: VerificationContext) -> VerificationResult:
        cutoff = context.task.as_of.cutoff
        checks = [
            CheckResult(
                code="world_cutoff",
                passed=context.world.as_of.cutoff == cutoff,
                message="world and task use the same point-in-time boundary",
                details={
                    "task_as_of": context.task.as_of.isoformat,
                    "world_as_of": context.world.as_of.isoformat,
                },
            )
        ]
        for evidence in context.finding.evidence:
            checks.extend(
                (
                    CheckResult(
                        code=f"observed_at:{evidence.evidence_id}",
                        passed=evidence.observed_at <= cutoff,
                        message="evidence observation is not in the future",
                        details={"observed_at": evidence.to_dict()["observed_at"]},
                    ),
                    CheckResult(
                        code=f"available_from:{evidence.evidence_id}",
                        passed=evidence.available_from <= cutoff,
                        message="evidence was available to the market by the cutoff",
                        details={"available_from": evidence.to_dict()["available_from"]},
                    ),
                )
            )
        return VerificationResult.from_checks(self.name, checks)
