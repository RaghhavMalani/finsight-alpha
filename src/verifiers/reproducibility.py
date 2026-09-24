"""Verifier for byte-identical experiment replays."""

from __future__ import annotations

from src.verifiers.core import CheckResult, VerificationContext, VerificationResult


class ReproducibilityVerifier:
    name = "reproducibility"

    def verify(self, context: VerificationContext) -> VerificationResult:
        checks = [
            CheckResult(
                code="artifact_present",
                passed=bool(context.finding.artifacts),
                message="finding includes at least one content-addressed artifact",
                details={"count": len(context.finding.artifacts)},
            )
        ]
        for artifact in context.finding.artifacts:
            checks.append(
                CheckResult(
                    code=f"replay:{artifact.artifact_id}",
                    passed=(
                        len(artifact.replay_hashes) >= context.minimum_replays
                        and all(
                            replay == artifact.content_hash
                            for replay in artifact.replay_hashes
                        )
                    ),
                    message="independent replays are byte-identical to the artifact",
                    details={
                        "minimum_replays": context.minimum_replays,
                        "replay_count": len(artifact.replay_hashes),
                    },
                )
            )
        return VerificationResult.from_checks(self.name, checks)
        attestations = {
            result.reproducibility_hash: result for result in context.executions
        }
        for experiment in context.finding.experiments:
            matching = [
                attestations.get(execution_hash)
                for execution_hash in experiment.execution_hashes
            ]
            checks.append(
                CheckResult(
                    code=f"attestation:{experiment.experiment_id}",
                    passed=(
                        len(matching) >= context.minimum_replays
                        and all(result is not None for result in matching)
                        and all(
                            result.manifest_hash == experiment.manifest_hash
                            for result in matching
                            if result is not None
                        )
                    ),
                    message="experiment hashes resolve to trusted sandbox attestations",
                    details={
                        "minimum_replays": context.minimum_replays,
                        "resolved": sum(result is not None for result in matching),
                    },
                )
            )
