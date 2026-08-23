from pathlib import Path

import numpy as np

from src.validation.suite import (
    REPOSITORY_ROOT,
    christoffersen_independence_test,
    kupiec_pof_test,
    render_markdown_report,
    run_black_scholes_validation,
    run_greeks_validation,
    run_markowitz_validation,
    run_ml_signal_validation,
    run_rag_validation,
    run_validation_suite,
    run_var_cvar_validation,
    write_validation_reports,
)


def test_pricing_greeks_and_markowitz_validations_pass():
    assert run_black_scholes_validation()["status"] == "pass"
    assert run_greeks_validation()["status"] == "pass"
    assert run_markowitz_validation()["status"] == "pass"


def test_var_ml_and_rag_validations_report_required_metrics():
    var_report = run_var_cvar_validation(repository_root=REPOSITORY_ROOT)
    assert {row["confidence_level"] for row in var_report["summary"]} == {0.95, 0.99}
    assert all("p_value" in row["kupiec_pof"] for row in var_report["summary"])
    assert all(
        "p_value" in row["christoffersen_independence"]
        for row in var_report["summary"]
    )

    ml_report = run_ml_signal_validation(
        repository_root=REPOSITORY_ROOT, shuffle_repeats=40
    )
    assert ml_report["status"] == "pass"
    assert all("roc_auc" in row for row in ml_report["folds"])

    rag_report = run_rag_validation(repository_root=REPOSITORY_ROOT)
    assert rag_report["status"] == "pass"
    assert set(rag_report["summary"]["hit_rate_at_k"]) == {"1", "3", "5"}


def test_coverage_tests_return_finite_probabilities():
    independent = np.array(([False] * 19 + [True]) * 20)
    kupiec = kupiec_pof_test(independent, expected_probability=0.05)
    christoffersen = christoffersen_independence_test(independent)
    assert 0.0 <= kupiec["p_value"] <= 1.0
    assert 0.0 <= christoffersen["p_value"] <= 1.0


def test_suite_writes_json_and_markdown(tmp_path: Path):
    report = run_validation_suite(
        repository_root=REPOSITORY_ROOT,
        mc_path_counts=(10_000, 100_000),
    )
    json_path, markdown_path = write_validation_reports(report, tmp_path)
    assert json_path.exists()
    assert markdown_path.exists()
    markdown = render_markdown_report(report)
    assert "| Option | Paths | MC price |" in markdown
    assert "| Confidence | Observed breaches |" in markdown
