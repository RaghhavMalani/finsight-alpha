"""Verifier for sandbox policy, integrity, and replay robustness."""

from __future__ import annotations

from src.sandbox import ExecutionStatus
from src.verifiers.core import CheckResult, VerificationContext, VerificationResult


class RobustnessVerifier:
    name = "robustness"

    def verify(self, context: VerificationContext) -> VerificationResult:
        executions = context.executions
        checks = [
            CheckResult(
                code="sandbox_replays_present",
                passed=len(executions) >= context.minimum_replays,
                message="independent sandbox replays are attached",
                details={"count": len(executions)},
            ),
            CheckResult(
                code="sandbox_policy_clean",
                passed=bool(executions)
                and all(result.status is ExecutionStatus.SUCCEEDED for result in executions),
                message="all sandbox executions completed without a policy termination",
                details={"statuses": [result.status.value for result in executions]},
            ),
            CheckResult(
                code="frozen_inputs_intact",
                passed=bool(executions) and all(result.integrity_ok for result in executions),
                message="frozen inputs remained byte-identical",
            ),
            CheckResult(
                code="replay_identity",
                passed=(
                    len(executions) >= context.minimum_replays
                    and len({result.reproducibility_hash for result in executions}) == 1
                ),
                message="sandbox replay identities are byte-identical",
            ),
            CheckResult(
                code="limitations_declared",
                passed=bool(context.finding.limitations),
                message="finding declares at least one methodological limitation",
            ),
        ]
        return VerificationResult.from_checks(self.name, checks)
