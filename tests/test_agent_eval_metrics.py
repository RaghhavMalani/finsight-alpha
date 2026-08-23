from __future__ import annotations

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

import pytest

from src.eval import (
    AttemptRecord,
    EvaluationDataError,
    EvaluationThresholds,
    build_evaluation_report,
    load_attempt_records,
    render_markdown_report,
    write_evaluation_report,
)
from src.eval.models import validate_attempt_records


HEX = "a" * 64
COMMIT = "b" * 40


def _attempt(
    *,
    task: str = "task-a",
    seed: int = 0,
    world: str = "real",
    passed: bool = True,
    sharpe: float | None = 1.2,
    run_token: str | None = None,
) -> dict:
    token = run_token or f"{task}-{seed}-{world}"
    run_id = __import__("hashlib").sha256(token.encode()).hexdigest()
    digest = __import__("hashlib").sha256(f"artifact-{token}".encode()).hexdigest()
    return {
        "schema_version": "1.0",
        "run_id": run_id,
        "task_id": task,
        "commit_sha": COMMIT,
        "seed": seed,
        "world": world,
        "pair_id": f"pair-{task}-{seed}",
        "passed": passed,
        "cost_usd": "0.25",
        "sharpe": sharpe if world == "real" else (sharpe - 0.4 if sharpe else sharpe),
        "recorded_at_utc": f"2026-08-{seed + 1:02d}T00:00:00Z",
        "prompt_sha256": HEX,
        "snapshot_sha256": "c" * 64,
        "plan_sha256": "d" * 64,
        "findings": (
            [{"finding_id": f"finding-{task}-{seed}", "verifier_passed": True}]
            if world == "real"
            else []
        ),
        "replays": [
            {"replay_index": index, "artifact_sha256": digest, "byte_count": 128}
            for index in range(5)
        ],
        "faults": (
            [
                {
                    "fault_id": f"fault-{task}-{seed}",
                    "fault_type": "tool_timeout",
                    "recovered": True,
                }
            ]
            if world == "real"
            else []
        ),
        "judgments": (
            [
                {
                    "judgment_id": f"judgment-{task}-{seed}",
                    "judge_label": "supported" if seed % 2 == 0 else "unsupported",
                    "human_label": "supported" if seed % 2 == 0 else "unsupported",
                }
            ]
            if world == "real"
            else []
        ),
    }


def _complete_records() -> tuple[AttemptRecord, ...]:
    rows = [
        AttemptRecord.from_dict(_attempt(task=task, seed=seed, world=world))
        for task in ("task-a", "task-b")
        for seed in range(5)
        for world in ("real", "counterfactual")
    ]
    return validate_attempt_records(rows)


def test_complete_scorecard_publishes_all_six_metrics() -> None:
    report = build_evaluation_report(_complete_records())
    metrics = report["metrics"]

    assert report["publication_status"] == "complete"
    assert report["all_gates_passed"] is True
    assert metrics["replay_fidelity"]["fidelity"] == 1.0
    assert metrics["contamination_estimate"]["estimate"] == pytest.approx(0.4)
    assert metrics["cost_per_verified_finding"]["cost_per_verified_finding_usd"] == 0.5
    assert metrics["fault_recovery_rate"]["recovery_rate"] == 1.0
    assert metrics["judge_human_agreement"]["cohens_kappa"] == 1.0
    commit = metrics["regression_by_commit"]["commits"][0]
    assert commit["pass_rate"] == 1.0
    assert commit["seed_variance"] == 0.0


def test_loader_rejects_unknown_fields_and_duplicate_final_attempts(tmp_path: Path) -> None:
    unknown = _attempt()
    unknown["cheap_claim_count"] = 999
    with pytest.raises(EvaluationDataError, match="unknown fields"):
        AttemptRecord.from_dict(unknown)

    path = tmp_path / "attempts.jsonl"
    row = _attempt()
    duplicate = deepcopy(row)
    duplicate["run_id"] = "e" * 64
    path.write_text(
        json.dumps(row) + "\n" + json.dumps(duplicate) + "\n",
        encoding="utf-8",
    )
    with pytest.raises(EvaluationDataError, match="exactly one final attempt"):
        load_attempt_records(path)


def test_sharpe_requires_a_counterfactual_pair_identifier() -> None:
    row = _attempt()
    row["pair_id"] = None
    with pytest.raises(EvaluationDataError, match="pair_id is required"):
        AttemptRecord.from_dict(row)


def test_contamination_pairs_are_scoped_by_commit() -> None:
    rows = []
    for commit, real_sharpe, counterfactual_sharpe in (
        ("1" * 40, 1.4, 1.0),
        ("2" * 40, 0.9, 0.2),
    ):
        real = _attempt(run_token=f"{commit}-real")
        real["commit_sha"] = commit
        real["sharpe"] = real_sharpe
        counterfactual = _attempt(world="counterfactual", run_token=f"{commit}-counter")
        counterfactual["commit_sha"] = commit
        counterfactual["sharpe"] = counterfactual_sharpe
        rows.extend((AttemptRecord.from_dict(real), AttemptRecord.from_dict(counterfactual)))

    contamination = build_evaluation_report(rows)["metrics"]["contamination_estimate"]

    assert contamination["complete_pairs"] == 2
    assert contamination["estimate"] == pytest.approx(0.55)
    assert {row["commit_sha"] for row in contamination["pairs"]} == {"1" * 40, "2" * 40}


def test_single_class_agreement_is_undefined_not_perfect() -> None:
    rows = []
    for seed in range(2):
        row = _attempt(seed=seed)
        row["judgments"][0]["judge_label"] = "supported"
        row["judgments"][0]["human_label"] = "supported"
        rows.append(AttemptRecord.from_dict(row))
    report = build_evaluation_report(
        rows,
        thresholds=EvaluationThresholds(minimum_seeds=2),
    )
    agreement = report["metrics"]["judge_human_agreement"]
    assert agreement["status"] == "undefined"
    assert agreement["raw_agreement"] == 1.0


def test_report_output_is_byte_identical_for_identical_evidence(tmp_path: Path) -> None:
    report = build_evaluation_report(_complete_records(), source_sha256="f" * 64)
    first_json, first_markdown = write_evaluation_report(report, tmp_path / "first")
    second_json, second_markdown = write_evaluation_report(report, tmp_path / "second")

    assert first_json.read_bytes() == second_json.read_bytes()
    assert first_markdown.read_bytes() == second_markdown.read_bytes()
    markdown = render_markdown_report(report)
    assert "Replay fidelity | 100.000%" in markdown
    assert "Contamination estimate (Sharpe)" in markdown
    assert "Regression detail by commit" in markdown


def test_cli_builds_a_complete_gated_report(tmp_path: Path) -> None:
    evidence = tmp_path / "attempts.jsonl"
    evidence.write_text(
        "\n".join(json.dumps(record.to_dict()) for record in _complete_records()) + "\n",
        encoding="utf-8",
    )
    output = tmp_path / "report"
    repository_root = Path(__file__).resolve().parents[1]

    completed = subprocess.run(
        [
            sys.executable,
            str(repository_root / "scripts" / "build_agent_eval_report.py"),
            "--input",
            str(evidence),
            "--output-dir",
            str(output),
            "--require-gates",
        ],
        cwd=repository_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr
    report = json.loads((output / "agent_eval_report.json").read_text(encoding="utf-8"))
    assert report["publication_status"] == "complete"
    assert report["all_gates_passed"] is True


def test_partial_samples_are_never_rendered_as_zero() -> None:
    row = _attempt(sharpe=None)
    row["pair_id"] = None
    row["replays"] = []
    row["findings"] = []
    row["faults"] = []
    row["judgments"] = []
    report = build_evaluation_report([AttemptRecord.from_dict(row)])
    markdown = render_markdown_report(report)

    assert report["publication_status"] == "incomplete"
    assert markdown.count("NOT MEASURED") >= 5
    assert "Cost per verified finding | $0" not in markdown
