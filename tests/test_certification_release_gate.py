from dataclasses import replace
import math

import pytest

from src.eval.canonical import canonical_sha256
from src.execution.certification import (
    CERTIFIED, DECLARED_ENGINES, FAILED_CERTIFICATION, CertificationBenchmarkArtifact,
    CertificationCheck, CertificationLevel, EngineCertificationArtifact,
)
from src.execution.comparison import ComparisonContract, ComparisonResult, ComparisonStatus
from src.execution.fingerprints import EngineFingerprint


def certified(engine, failed=None):
    fp = EngineFingerprint(engine, "1", "abcdef0", "3.12", "UNSUPPORTED",
                           canonical_sha256("lock"), canonical_sha256("worker"), "test")
    checks = tuple(CertificationCheck(f"c{level.value}", level, level != failed,
                   canonical_sha256(level.name), "audited evidence") for level in CertificationLevel)
    return EngineCertificationArtifact(fp, checks, ("T01",), {}, mandatory_tapes=("T01",))


def comparisons():
    return (ComparisonResult(ComparisonStatus.PASS, "immediate_limit", {"equity": 0.0}, None),
            ComparisonResult(ComparisonStatus.NOT_COMPARABLE, "queue", {}, "QUEUE_MODEL_NOT_IN_COMMON_CAPABILITY_SET"))


def test_engine_failures_do_not_become_system_release_blockers():
    artifacts = tuple(certified(engine, CertificationLevel.C1_ACCOUNTING_EVENTS) for engine in DECLARED_ENGINES)
    benchmark = CertificationBenchmarkArtifact(artifacts, comparisons())
    report = benchmark.to_dict()
    assert benchmark.system_valid
    assert report["system_blocking_gates"] == []
    assert report["certification_summary"] == "NONE_CERTIFIED"
    assert report["minimum_engine_level"] == "C0"
    assert report["maximum_engine_level"] == "C0"
    assert all(item["status"] == FAILED_CERTIFICATION for item in report["certifications"])
    assert all(item["blocking_gates"][0]["gate"] == "C1" for item in report["certifications"])


def test_mixed_engine_levels_are_reported_without_a_global_level():
    artifacts = tuple(certified(engine, CertificationLevel.C1_ACCOUNTING_EVENTS if engine in {"hftbacktest", "legacy-hft"} else None)
                      for engine in DECLARED_ENGINES)
    report = CertificationBenchmarkArtifact(artifacts, comparisons()).to_dict()
    assert report["certification_summary"] == "MIXED"
    assert report["minimum_engine_level"] == "C0"
    assert report["maximum_engine_level"] == "C4"
    assert "certification_level" not in report
    assert [item["status"] for item in report["certifications"]].count(CERTIFIED) == 2


def test_no_missing_mandatory_tapes_even_when_checks_claim_pass():
    artifact = replace(certified("vectorbt"), supported_tapes=(), unsupported_tapes={"T01": "not implemented"})
    assert artifact.achieved_level is CertificationLevel.C0_PROTOCOL_SCHEMA
    assert artifact.status == FAILED_CERTIFICATION
    assert "mandatory" in artifact.blocking_gates()[0]["reason"]


def test_system_requires_exact_engine_membership_and_both_comparison_families():
    artifacts = tuple(certified(engine) for engine in DECLARED_ENGINES)
    assert CertificationBenchmarkArtifact(artifacts, comparisons()).system_valid
    assert not CertificationBenchmarkArtifact((artifacts[0],) * 4, comparisons()).system_valid
    assert not CertificationBenchmarkArtifact(artifacts, ()).system_valid
    assert not CertificationBenchmarkArtifact(artifacts, comparisons()[:1]).system_valid
    assert not CertificationBenchmarkArtifact(artifacts, comparisons()[1:]).system_valid


def test_engine_status_requires_actual_c4_and_never_changes_achieved_level():
    artifact = certified("vectorbt", CertificationLevel.C4_STRESS_MUTATIONS)
    assert artifact.achieved_level is CertificationLevel.C3_SCOPED_AGREEMENT
    assert artifact.status == FAILED_CERTIFICATION
    assert artifact.to_dict()["certification_level"] == "C3"


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf, True, -1])
def test_comparison_rejects_invalid_tolerances(value):
    with pytest.raises(ValueError):
        ComparisonContract("a", "b", frozenset({"bars"}), frozenset({"bars"}), tolerances={"pnl": value})


def test_comparison_rejects_missing_nonfinite_and_mismatched_semantics():
    contract = ComparisonContract("a", "b", frozenset({"bars"}), frozenset({"bars"}),
                                  tolerances={"pnl": 0.01, "fees": 0.0})
    for metrics in ({"pnl": 1}, {"pnl": math.nan, "fees": 0}, {"pnl": 1, "fees": True}):
        assert contract.compare(metrics, {"pnl": 1, "fees": 0}, required_capability="bars").status is ComparisonStatus.FAIL
    mismatch = replace(contract, left_semantics={"latency_ns": 0}, right_semantics={"latency_ns": 1})
    assert mismatch.compare({}, {}, required_capability="bars").reason == "SEMANTIC_ASSUMPTIONS_DIFFER"


def test_queue_noncomparison_has_machine_auditable_reason():
    contract = ComparisonContract("vectorbt", "hftbacktest", frozenset({"immediate_limit"}),
                                  frozenset({"immediate_limit", "queue"}), tolerances={"equity": 0})
    result = contract.compare({"equity": 10}, {"equity": 10}, required_capability="queue")
    assert result.status is ComparisonStatus.NOT_COMPARABLE
    assert result.to_dict()["reasons"] == ["QUEUE_MODEL_NOT_IN_COMMON_CAPABILITY_SET"]


def test_same_semantics_can_disagree_and_fail():
    contract = ComparisonContract("a", "b", frozenset({"bars"}), frozenset({"bars"}), tolerances={"pnl": 0.01})
    assert contract.compare({"pnl": 1}, {"pnl": 2}, required_capability="bars").status is ComparisonStatus.FAIL
