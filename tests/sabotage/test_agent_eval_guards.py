"""Negative controls: each mutation must damage the published scorecard."""

from __future__ import annotations

import hashlib
from copy import deepcopy

from src.eval import AttemptRecord, build_evaluation_report
from src.eval.models import validate_attempt_records


def _row(task: str, seed: int, world: str) -> dict:
    token = f"{task}-{seed}-{world}"
    digest = hashlib.sha256(f"artifact-{token}".encode()).hexdigest()
    label = "supported" if seed % 2 == 0 else "unsupported"
    return {
        "schema_version": "1.0",
        "run_id": hashlib.sha256(token.encode()).hexdigest(),
        "task_id": task,
        "commit_sha": "a" * 40,
        "seed": seed,
        "world": world,
        "pair_id": f"pair-{task}-{seed}",
        "passed": True,
        "cost_usd": "0.10",
        "sharpe": 1.0 if world == "real" else 0.5,
        "recorded_at_utc": f"2026-08-{seed + 1:02d}T00:00:00Z",
        "prompt_sha256": "b" * 64,
        "snapshot_sha256": "c" * 64,
        "plan_sha256": "d" * 64,
        "findings": (
            [{"finding_id": f"finding-{task}-{seed}", "verifier_passed": True}]
            if world == "real"
            else []
        ),
        "replays": [
            {"replay_index": index, "artifact_sha256": digest, "byte_count": 100}
            for index in range(5)
        ],
        "faults": (
            [
                {
                    "fault_id": f"fault-{task}-{seed}",
                    "fault_type": "provider_503",
                    "recovered": True,
                }
            ]
            if world == "real"
            else []
        ),
        "judgments": (
            [
                {
                    "judgment_id": f"judge-{task}-{seed}",
                    "judge_label": label,
                    "human_label": label,
                }
            ]
            if world == "real"
            else []
        ),
    }


def _dataset() -> list[dict]:
    return [
        _row(task, seed, world)
        for task in ("a", "b")
        for seed in range(5)
        for world in ("real", "counterfactual")
    ]


def _report(rows: list[dict]) -> dict:
    records = validate_attempt_records(AttemptRecord.from_dict(row) for row in rows)
    return build_evaluation_report(records)


def test_sabotage_changed_replay_byte_fails_exact_fidelity_gate() -> None:
    rows = _dataset()
    rows[0]["replays"][4]["artifact_sha256"] = "f" * 64
    report = _report(rows)
    replay = report["metrics"]["replay_fidelity"]
    assert replay["status"] == "fail"
    assert replay["fidelity"] < 1.0
    assert report["all_gates_passed"] is False


def test_sabotage_deleted_counterfactual_makes_contamination_partial() -> None:
    rows = [
        row
        for row in _dataset()
        if not (row["task_id"] == "a" and row["seed"] == 0 and row["world"] == "counterfactual")
    ]
    report = _report(rows)
    contamination = report["metrics"]["contamination_estimate"]
    assert contamination["status"] == "partial"
    assert contamination["pair_coverage"] < 1.0
    assert report["publication_status"] == "incomplete"


def test_sabotage_unverified_claims_never_improve_cost_denominator() -> None:
    rows = _dataset()
    baseline = _report(deepcopy(rows))["metrics"]["cost_per_verified_finding"]
    rows[0]["findings"].append(
        {"finding_id": "unverified-shortcut", "verifier_passed": False}
    )
    sabotaged = _report(rows)["metrics"]["cost_per_verified_finding"]
    assert sabotaged["attempted_findings"] == baseline["attempted_findings"] + 1
    assert sabotaged["verified_findings"] == baseline["verified_findings"]
    assert sabotaged["cost_per_verified_finding_usd"] == baseline["cost_per_verified_finding_usd"]


def test_sabotage_unrecovered_fault_fails_recovery_gate() -> None:
    rows = _dataset()
    rows[0]["faults"][0]["recovered"] = False
    rows[2]["faults"][0]["recovered"] = False
    recovery = _report(rows)["metrics"]["fault_recovery_rate"]
    assert recovery["status"] == "fail"
    assert recovery["gate"]["passed"] is False


def test_sabotage_judge_label_flip_reduces_kappa() -> None:
    rows = _dataset()
    baseline = _report(deepcopy(rows))["metrics"]["judge_human_agreement"]
    rows[0]["judgments"][0]["judge_label"] = "unsupported"
    rows[2]["judgments"][0]["judge_label"] = "supported"
    sabotaged = _report(rows)["metrics"]["judge_human_agreement"]
    assert baseline["cohens_kappa"] == 1.0
    assert sabotaged["cohens_kappa"] < baseline["cohens_kappa"]
    assert sabotaged["status"] == "fail"


def test_sabotage_seed_failure_exposes_variance_per_commit() -> None:
    rows = _dataset()
    for row in rows:
        if row["world"] == "real" and row["task_id"] == "a" and row["seed"] == 4:
            row["passed"] = False
    commit = _report(rows)["metrics"]["regression_by_commit"]["commits"][0]
    assert commit["pass_rate"] < 1.0
    assert commit["seed_variance"] > 0.0
    assert commit["status"] == "fail"


def test_sabotage_missing_task_seed_cell_blocks_publication() -> None:
    rows = [
        row
        for row in _dataset()
        if not (row["task_id"] == "b" and row["seed"] == 4 and row["world"] == "real")
    ]
    report = _report(rows)
    commit = report["metrics"]["regression_by_commit"]["commits"][0]
    assert commit["task_seed_coverage"] < 1.0
    assert commit["status"] == "partial"
    assert report["publication_status"] == "incomplete"
