"""Verifier for provenance resolution and claim-to-source linkage."""

from __future__ import annotations

from collections import Counter

from src.verifiers.core import CheckResult, VerificationContext, VerificationResult


class EvidenceVerifier:
    name = "evidence"

    def verify(self, context: VerificationContext) -> VerificationResult:
        finding = context.finding
        known_ids = {item.evidence_id for item in finding.evidence}
        checks = [
            CheckResult(
                code="evidence_present",
                passed=bool(finding.evidence),
                message="finding includes at least one source reference",
                details={"count": len(finding.evidence)},
            )
        ]
        for evidence in finding.evidence:
            checks.append(
                CheckResult(
                    code=f"resolves:{evidence.evidence_id}",
                    passed=context.world.contains_evidence(evidence),
                    message="evidence content resolves inside the frozen world",
                    details={
                        "dataset": evidence.dataset,
                        "snapshot_id": evidence.snapshot_id,
                    },
                )
            )
        for claim in finding.claims:
            checks.append(
                CheckResult(
                    code=f"claim_sources:{claim.claim_id}",
                    passed=bool(claim.evidence_ids)
                    and set(claim.evidence_ids).issubset(known_ids),
                    message="numeric claim cites only evidence included in the finding",
                    details={"evidence_ids": list(claim.evidence_ids)},
                )
            )
        counts = Counter(item.dataset for item in finding.evidence)
        for requirement in context.evidence_requirements:
            actual = counts[requirement.dataset]
            checks.append(
                CheckResult(
                    code=f"required_dataset:{requirement.dataset}",
                    passed=actual >= requirement.minimum_count,
                    message="required dataset contributes enough evidence",
                    details={
                        "minimum_count": requirement.minimum_count,
                        "actual_count": actual,
                    },
                )
            )
        return VerificationResult.from_checks(self.name, checks)
