import csv
import json
from pathlib import Path

import pytest

from src.calibration.metrics import discrimination_auc
from src.calibration.runner import CalibrationFreezeRunner
from src.calibration.taxonomy import classify_failure
from src.findings import ResearchBudget
from src.rewards import CalibratedRewardModel, ResourceUsage
from src.verifiers import CheckResult, VerificationResult, VerificationStatus


ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "data" / "exports" / "forge_v0_2_baseline"
TASKS = ROOT / "eval" / "tasks" / "forge_v0_2"


def _result(name: str, score: float = 1.0, *, passed: bool = True):
    return VerificationResult(
        verifier=name,
        status=VerificationStatus.PASS if passed else VerificationStatus.FAIL,
        score=score,
        checks=(CheckResult(f"{name}_check", passed, name),),
    )


def _score(results):
    return CalibratedRewardModel().score(
        results,
        required_verifiers=(
            "temporal",
            "evidence",
            "numerical",
            "reproducibility",
            "robustness",
        ),
        usage=ResourceUsage(latency_seconds=0.1, tool_calls=4),
        budget=ResearchBudget(
            max_tool_calls=4, max_compute_seconds=10.0, max_cost_usd=0.1
        ),
    )


def test_evaluation_separates_validity_quality_efficiency_and_training_reward():
    evaluation = _score(
        [_result(name) for name in (
            "temporal", "evidence", "numerical", "reproducibility", "robustness"
        )]
    )
    assert evaluation.verified
    assert evaluation.critical_gate_passed
    assert evaluation.research_quality == pytest.approx(1.0)
    assert 0.9 < evaluation.efficiency_score < 0.95
    assert evaluation.training_reward == pytest.approx(evaluation.efficiency_score)
    assert evaluation.reward == evaluation.training_reward
    assert evaluation.verified_quality == evaluation.research_quality


def test_critical_failure_is_not_compensated_by_perfect_other_verifiers():
    results = [
        _result("temporal"),
        _result("evidence"),
        _result("numerical", 0.75, passed=False),
        _result("reproducibility"),
        _result("robustness"),
    ]
    evaluation = _score(results)
    assert not evaluation.verified
    assert not evaluation.critical_gate_passed
    assert evaluation.failure_multiplier == pytest.approx(0.40)
    assert evaluation.verifier_statuses["numerical"] == "partial"
    assert evaluation.training_reward < evaluation.failure_multiplier


def test_quality_only_failure_preserves_more_partial_credit_than_critical_failure():
    critical = _score([
        _result("temporal"), _result("evidence"),
        _result("numerical", 0.5, passed=False),
        _result("reproducibility"), _result("robustness"),
    ])
    quality = _score([
        _result("temporal"), _result("evidence"), _result("numerical"),
        _result("reproducibility"), _result("robustness", 0.5, passed=False),
    ])
    assert quality.critical_gate_passed
    assert quality.failure_multiplier == pytest.approx(0.65)
    assert quality.training_reward > critical.training_reward
    assert quality.training_reward < 0.65


def test_discrimination_auc_is_pairwise_ranking_probability():
    assert discrimination_auc([0.8, 0.9], [0.1, 0.2]) == 1.0
    assert discrimination_auc([0.5], [0.5]) == 0.5


def test_failure_taxonomy_is_multi_label():
    episode = {
        "verified": False,
        "task_id": "task_007_covariance_instability",
        "task_completion": True,
        "tool_calls": 4,
        "verifier_outputs": [
            {
                "verifier": "numerical",
                "status": "fail",
                "checks": [{"code": "claim:value", "passed": False}],
            }
        ],
        "trajectory": {"actions": []},
    }
    assert classify_failure(episode) == ("NUMERICAL_ERROR", "STATISTICAL_ERROR")


def test_calibration_rescores_without_mutating_the_source_baseline(tmp_path):
    original_manifest = (BASELINE / "manifest.json").read_bytes()
    output = tmp_path / "calibration"
    manifest = CalibrationFreezeRunner(
        baseline=BASELINE,
        tasks=TASKS,
        output=output,
    ).run()
    assert set(path.name for path in output.iterdir()) == {
        "calibration_manifest.json",
        "old_vs_new_scores.csv",
        "discrimination.json",
        "distributions.json",
        "failure_analysis.md",
    }
    assert manifest["source"]["baseline_id"].startswith("980fd54842")
    assert manifest["results"]["accepted"]
    assert manifest["results"]["new_median_separation"] > 0.30
    assert (BASELINE / "manifest.json").read_bytes() == original_manifest
    with (output / "old_vs_new_scores.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 150
    discrimination = json.loads((output / "discrimination.json").read_text())
    assert discrimination["not_authorized_for_training"] is True
