from __future__ import annotations

from dataclasses import replace

import pytest

from src.eval.canonical import canonical_sha256
from src.execution import (
    CausalRealityGap,
    CertificationLevel,
    ComparisonContract,
    ComparisonStatus,
    EngineCertificationArtifact,
    EngineFingerprint,
    SYNTHETIC_TAPES,
    independent_oracle,
)
from src.execution.certification import CertificationCheck


def _fingerprint() -> EngineFingerprint:
    return EngineFingerprint(
        engine="fixture", engine_version="1.2.3", upstream_commit="abcdef0",
        python_version="3.12.0", rust_version="UNSUPPORTED",
        dependency_lock_hash=canonical_sha256("lock"),
        worker_image_hash=canonical_sha256("worker"), platform="test-platform",
    )


def test_fingerprint_is_complete_content_addressed_and_mutation_sensitive() -> None:
    fingerprint = _fingerprint()
    assert fingerprint.adapter_version == "forge-0.2.4"
    assert EngineFingerprint.from_dict(fingerprint.to_dict()) == fingerprint
    assert replace(fingerprint, engine_version="1.2.4").fingerprint_hash != fingerprint.fingerprint_hash
    assert replace(fingerprint, dependency_lock_hash=canonical_sha256("other")).fingerprint_hash != fingerprint.fingerprint_hash


def test_seven_tapes_have_independent_deterministic_oracles() -> None:
    assert [tape.tape_id for tape in SYNTHETIC_TAPES] == [
        "immediate_fill", "partial_fill_101_102", "latency_miss",
        "queue_no_fill", "queue_exhausted_fill", "cancel_race_fill_survives",
        "exact_fee_accounting",
    ]
    first = [independent_oracle(tape) for tape in SYNTHETIC_TAPES]
    second = [independent_oracle(tape) for tape in SYNTHETIC_TAPES]
    assert [item.oracle_hash for item in first] == [item.oracle_hash for item in second]
    assert [(fill.quantity, fill.price) for fill in first[1].fills] == [(1.0, 101.0), (2.0, 102.0)]
    assert first[2].fills == ()
    assert first[3].fills == ()
    assert first[4].position == 1.0
    assert first[5].position == 1.0
    assert first[6].total_fees == pytest.approx(1.0)
    assert first[6].ending_cash == pytest.approx(9599.0)


def test_comparison_contract_uses_only_capability_intersection() -> None:
    contract = ComparisonContract(
        "left", "right", frozenset({"bars", "fees"}),
        frozenset({"fees", "queue"}), frozenset(), {"pnl": 0.01},
    )
    assert contract.capability_intersection == frozenset({"fees"})
    assert contract.compare({"pnl": 1.0}, {"pnl": 1.0}, required_capability="queue").status is ComparisonStatus.NOT_COMPARABLE
    assert contract.compare({"pnl": 1.0}, {"pnl": 1.005}, required_capability="fees").status is ComparisonStatus.PASS


def test_certification_levels_cannot_skip_a_failed_predecessor() -> None:
    checks = tuple(
        CertificationCheck(f"c{level.value}", level, level is not CertificationLevel.C2_EXACT_REPLAY, canonical_sha256(level.name), level.name)
        for level in CertificationLevel
    )
    artifact = EngineCertificationArtifact(_fingerprint(), checks, ("immediate_fill",), {"queue_no_fill": "unsupported"})
    assert artifact.achieved_level is CertificationLevel.C1_ACCOUNTING_EVENTS
    assert artifact.to_dict()["engine_fingerprint_hash"] == _fingerprint().fingerprint_hash


def test_causal_gap_ranking_is_deterministic() -> None:
    gap = CausalRealityGap.decompose({
        "screening": 2.0, "fees": 1.8, "event_semantics": 1.5,
        "latency": 1.1, "queue": 1.0, "stress": 0.8,
    })
    assert gap.total_gap == pytest.approx(1.2)
    assert gap.survival_ratio == pytest.approx(0.4)
    assert gap.largest_degradation.stage == "latency"
    assert gap.second_degradation.stage == "event_semantics"
