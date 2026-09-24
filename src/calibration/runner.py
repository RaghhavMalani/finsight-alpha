"""Rescore the immutable v0.2 baseline into a derived v0.2.2 artifact."""

from __future__ import annotations

import csv
import json
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from src.benchmark import load_benchmark_case
from src.calibration.metrics import discrimination_report, reward_histogram
from src.calibration.taxonomy import classify_failure
from src.eval.canonical import canonical_sha256
from src.rewards import (
    CalibratedRewardModel,
    CalibrationConfig,
    ResourceUsage,
)
from src.sandbox.cleanup import remove_runner_tree
from src.verifiers.core import CheckResult, VerificationResult, VerificationStatus


CALIBRATION_TAG = "FORGE_REWARD_CALIBRATION_V0_2_2"
SOURCE_BASELINE_TAG = "FORGE_BASELINE_V0_2"
SOURCE_BASELINE_ID = (
    "980fd548426b1cb9cc7d00697b2efc74021235685a97e1b07f66f5db9e4a6b15"
)
ALPHA_CANDIDATES = (0.25, 0.30, 0.35, 0.40)


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _verification_result(value: Mapping[str, Any]) -> VerificationResult:
    return VerificationResult(
        verifier=str(value["verifier"]),
        status=VerificationStatus(str(value["status"])),
        score=float(value["score"]),
        checks=tuple(
            CheckResult(
                code=str(check["code"]),
                passed=bool(check["passed"]),
                message=str(check["message"]),
                details=dict(check.get("details") or {}),
            )
            for check in value.get("checks", ())
        ),
    )


def _validate_baseline(path: Path) -> dict[str, Any]:
    manifest_path = path / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"baseline manifest is missing: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("tag") != SOURCE_BASELINE_TAG:
        raise ValueError("calibration source has the wrong baseline tag")
    if manifest.get("baseline_id") != SOURCE_BASELINE_ID:
        raise ValueError("calibration source has the wrong baseline identity")
    identity_payload = dict(manifest)
    supplied_id = identity_payload.pop("baseline_id")
    if canonical_sha256(identity_payload) != supplied_id:
        raise ValueError("baseline manifest identity does not verify")
    for name, expected_hash in manifest.get("artifacts", {}).items():
        artifact = path / name
        if not artifact.is_file():
            raise FileNotFoundError(f"baseline artifact is missing: {artifact}")
        actual_hash = canonical_sha256(artifact.read_text(encoding="utf-8"))
        if actual_hash != expected_hash:
            raise ValueError(f"baseline artifact hash mismatch: {name}")
    if manifest.get("episodes") != 150:
        raise ValueError("calibration requires the frozen 150-episode baseline")
    return manifest


def _task_paths(tasks: Path) -> dict[str, Path]:
    values: dict[str, Path] = {}
    for path in sorted(tasks.glob("*.json")):
        case = load_benchmark_case(path)
        values[case.task.task_id] = path
    return values


def _score_rows(
    episodes: Iterable[Mapping[str, Any]],
    *,
    task_paths: Mapping[str, Path],
    alpha: float,
) -> tuple[list[dict[str, Any]], CalibrationConfig]:
    config = CalibrationConfig(critical_failure_multiplier=alpha)
    model = CalibratedRewardModel(config)
    rows: list[dict[str, Any]] = []
    for episode in episodes:
        task_id = str(episode["task_id"])
        task = load_benchmark_case(
            task_paths[task_id], seed_override=int(episode["seed"])
        ).task
        verifier_results = tuple(
            _verification_result(value) for value in episode["verifier_outputs"]
        )
        evaluation = model.score(
            verifier_results,
            required_verifiers=task.required_verifiers,
            usage=ResourceUsage.from_dict(episode.get("usage")),
            budget=task.budget,
        )
        labels = classify_failure(episode)
        rows.append(
            {
                "episode_id": episode["episode_id"],
                "trajectory_hash": episode["trajectory_hash"],
                "task_id": task_id,
                "split": episode["split"],
                "seed": int(episode["seed"]),
                "configuration": episode["configuration"],
                "verified": bool(episode["verified"]),
                "critical_gate_passed": evaluation.critical_gate_passed,
                "old_reward": float(episode["reward"]),
                "verifier_scores": evaluation.verifier_scores,
                "verifier_statuses": evaluation.verifier_statuses,
                "research_quality": evaluation.research_quality,
                "efficiency_score": evaluation.efficiency_score,
                "failure_multiplier": evaluation.failure_multiplier,
                "training_reward": evaluation.training_reward,
                "failure_labels": list(labels),
                "tool_calls": int(episode["tool_calls"]),
                "sandbox_executions": int(episode["sandbox_executions"]),
                "compute_time_seconds": float(episode["compute_time_seconds"]),
                "wall_clock_seconds": float(episode["wall_clock_seconds"]),
                "replay_complete": len(episode.get("replay_hashes", ())) >= 2,
            }
        )
    return rows, config


def _acceptance(report: Mapping[str, Any]) -> dict[str, bool]:
    return {
        "auc_above_0_95": report["reward_discrimination_auc"] > 0.95,
        "median_separation_above_0_30": report["median_separation"] > 0.30,
        "failed_above_0_80_at_most_0_05": (
            report["failed_above_0_80_fraction"] <= 0.05
        ),
        "near_perfect_at_most_0_05": (
            report["near_perfect_above_0_95_fraction"] <= 0.05
        ),
        "variable_task_fraction_at_least_0_80": (
            report["variable_task_fraction"] >= 0.80
        ),
    }


def _difficulty(verified_rate: float) -> str:
    if verified_rate >= 0.85:
        return "easy"
    if verified_rate >= 0.65:
        return "medium"
    if verified_rate >= 0.40:
        return "hard"
    return "adversarial"


def _group_diagnostics(
    rows: Iterable[Mapping[str, Any]], key: str
) -> list[dict[str, Any]]:
    groups: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row[key])].append(row)
    diagnostics: list[dict[str, Any]] = []
    for value, group in sorted(groups.items()):
        old = [float(row["old_reward"]) for row in group]
        new = [float(row["training_reward"]) for row in group]
        verified_rate = sum(bool(row["verified"]) for row in group) / len(group)
        failures = Counter(
            label for row in group for label in row.get("failure_labels", ())
        )
        record = {
            key: value,
            "episodes": len(group),
            "verified_rate": verified_rate,
            "old_reward_mean": statistics.fmean(old),
            "old_reward_std": statistics.pstdev(old),
            "old_reward_min": min(old),
            "old_reward_max": max(old),
            "training_reward_mean": statistics.fmean(new),
            "training_reward_std": statistics.pstdev(new),
            "training_reward_min": min(new),
            "training_reward_max": max(new),
            "training_reward_variance": statistics.pvariance(new),
            "failure_modes": dict(sorted(failures.items())),
            "critical_failure_rate": sum(
                not bool(row["critical_gate_passed"]) for row in group
            )
            / len(group),
            "mean_tool_calls": statistics.fmean(
                int(row["tool_calls"]) for row in group
            ),
            "mean_compute_time_seconds": statistics.fmean(
                float(row["compute_time_seconds"]) for row in group
            ),
            "mean_wall_clock_seconds": statistics.fmean(
                float(row["wall_clock_seconds"]) for row in group
            ),
            "replay_rate": sum(bool(row["replay_complete"]) for row in group)
            / len(group),
        }
        if key == "task_id":
            record["difficulty"] = _difficulty(verified_rate)
        diagnostics.append(record)
    return diagnostics


def _write_csv(path: Path, rows: list[Mapping[str, Any]]) -> None:
    fields = (
        "episode_id",
        "trajectory_hash",
        "task_id",
        "split",
        "seed",
        "configuration",
        "verified",
        "critical_gate_passed",
        "old_reward",
        "verifier_scores",
        "verifier_statuses",
        "research_quality",
        "efficiency_score",
        "failure_multiplier",
        "training_reward",
        "failure_labels",
        "tool_calls",
        "sandbox_executions",
        "compute_time_seconds",
        "wall_clock_seconds",
        "replay_complete",
    )
    with path.open("x", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            serialized = dict(row)
            for field in ("verifier_scores", "verifier_statuses", "failure_labels"):
                serialized[field] = json.dumps(
                    serialized[field], sort_keys=True, separators=(",", ":")
                )
            writer.writerow(serialized)


def _write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _failure_analysis(rows: list[Mapping[str, Any]]) -> str:
    failed = [row for row in rows if not row["verified"]]
    overall = Counter(label for row in failed for label in row["failure_labels"])
    lines = [
        "# Forge v0.2.2 failure analysis",
        "",
        "The 42 frozen failures are classified with a multi-label taxonomy. "
        "Percentages therefore need not sum to 100%.",
        "",
        "## Overall",
        "",
        "| Failure label | Episodes | Share of failed episodes |",
        "| --- | ---: | ---: |",
    ]
    lines.extend(
        f"| {label} | {count} | {count / len(failed):.1%} |"
        for label, count in overall.most_common()
    )
    for configuration in sorted({str(row["configuration"]) for row in rows}):
        subset = [
            row
            for row in failed
            if str(row["configuration"]) == configuration
        ]
        counts = Counter(label for row in subset for label in row["failure_labels"])
        lines.extend(
            [
                "",
                f"## {configuration}",
                "",
                "| Failure label | Episodes | Share of configuration failures |",
                "| --- | ---: | ---: |",
            ]
        )
        lines.extend(
            f"| {label} | {count} | {count / len(subset):.1%} |"
            for label, count in counts.most_common()
        )
    lines.extend(
        [
            "",
            "Labels are derived only from trusted verifier checks, episode completion, "
            "tool use, and sandbox results. No model interpretation is used.",
            "",
        ]
    )
    return "\n".join(lines)


class CalibrationFreezeRunner:
    def __init__(self, *, baseline: Path, tasks: Path, output: Path) -> None:
        self.baseline = baseline.resolve()
        self.tasks = tasks.resolve()
        self.output = output.resolve()

    def run(self) -> dict[str, Any]:
        if self.output.exists():
            raise FileExistsError(
                f"calibration artifact already exists and is immutable: {self.output}"
            )
        if self.output == self.baseline or self.baseline in self.output.parents:
            raise ValueError("calibration output must not overlap the source baseline")
        source_manifest = _validate_baseline(self.baseline)
        episodes = _read_jsonl(self.baseline / "episodes.jsonl")
        if len(episodes) != 150:
            raise ValueError("source episodes.jsonl must contain exactly 150 episodes")
        task_paths = _task_paths(self.tasks)
        missing_tasks = {str(row["task_id"]) for row in episodes} - set(task_paths)
        if missing_tasks:
            raise ValueError(f"frozen task files are missing: {sorted(missing_tasks)}")

        candidate_reports: dict[str, dict[str, Any]] = {}
        candidate_rows: dict[float, list[dict[str, Any]]] = {}
        candidate_configs: dict[float, CalibrationConfig] = {}
        for alpha in ALPHA_CANDIDATES:
            rows, config = _score_rows(
                episodes, task_paths=task_paths, alpha=alpha
            )
            report = discrimination_report(rows, score_key="training_reward")
            report["acceptance"] = _acceptance(report)
            report["accepted"] = all(report["acceptance"].values())
            candidate_reports[f"{alpha:.2f}"] = report
            candidate_rows[alpha] = rows
            candidate_configs[alpha] = config
        accepted = [
            alpha
            for alpha in ALPHA_CANDIDATES
            if candidate_reports[f"{alpha:.2f}"]["accepted"]
        ]
        if not accepted:
            raise ValueError("no calibrated failure multiplier meets acceptance criteria")
        selected_alpha = max(accepted)
        rows = candidate_rows[selected_alpha]
        selected_config = candidate_configs[selected_alpha]
        old_report = discrimination_report(rows, score_key="old_reward")
        new_report = candidate_reports[f"{selected_alpha:.2f}"]

        staging = self.output.with_name(f".{self.output.name}.staging")
        if staging.exists():
            raise FileExistsError(f"calibration staging directory exists: {staging}")
        staging.mkdir(parents=True)
        try:
            _write_csv(staging / "old_vs_new_scores.csv", rows)
            discrimination = {
                "schema_version": "0.2.2",
                "source_baseline_id": source_manifest["baseline_id"],
                "acceptance_thresholds": {
                    "reward_discrimination_auc": "> 0.95",
                    "median_separation": "> 0.30",
                    "failed_above_0_80_fraction": "<= 0.05",
                    "near_perfect_above_0_95_fraction": "<= 0.05",
                    "variable_task_fraction": ">= 0.80",
                },
                "old_reward": old_report,
                "alpha_candidates": candidate_reports,
                "selected_critical_failure_multiplier": selected_alpha,
                "calibrated_training_reward": new_report,
                "accepted_for_future_model_baselines": bool(new_report["accepted"]),
                "not_authorized_for_training": True,
            }
            _write_json(staging / "discrimination.json", discrimination)
            distributions = {
                "schema_version": "0.2.2",
                "overall": {
                    "old_reward_histogram": reward_histogram(
                        row["old_reward"] for row in rows
                    ),
                    "training_reward_histogram": reward_histogram(
                        row["training_reward"] for row in rows
                    ),
                },
                "per_task": _group_diagnostics(rows, "task_id"),
                "per_configuration": _group_diagnostics(rows, "configuration"),
            }
            _write_json(staging / "distributions.json", distributions)
            (staging / "failure_analysis.md").write_text(
                _failure_analysis(rows), encoding="utf-8", newline="\n"
            )
            artifact_hashes = {
                path.name: canonical_sha256(path.read_text(encoding="utf-8"))
                for path in sorted(staging.iterdir())
            }
            manifest = {
                "schema_version": "0.2.2",
                "tag": CALIBRATION_TAG,
                "created_at": datetime.now(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
                "source": {
                    "baseline_tag": source_manifest["tag"],
                    "baseline_id": source_manifest["baseline_id"],
                    "episodes": len(episodes),
                    "artifact_hashes": source_manifest["artifacts"],
                },
                "method": {
                    "trajectory_policy": "same trajectories, findings, and verifier outputs; scoring only",
                    "quality_aggregation": "weighted geometric mean",
                    "critical_verifiers": list(selected_config.critical_verifiers),
                    "selected_config": selected_config.to_dict(),
                    "selection_rule": "largest candidate alpha satisfying every frozen acceptance criterion",
                },
                "results": {
                    "old_reward_discrimination_auc": old_report[
                        "reward_discrimination_auc"
                    ],
                    "new_reward_discrimination_auc": new_report[
                        "reward_discrimination_auc"
                    ],
                    "old_median_separation": old_report["median_separation"],
                    "new_median_separation": new_report["median_separation"],
                    "selected_critical_failure_multiplier": selected_alpha,
                    "accepted": bool(new_report["accepted"]),
                },
                "artifacts": artifact_hashes,
            }
            manifest["calibration_id"] = canonical_sha256(manifest)
            _write_json(staging / "calibration_manifest.json", manifest)
            unchanged_manifest = _validate_baseline(self.baseline)
            if unchanged_manifest != source_manifest:
                raise ValueError("source baseline changed during calibration")
            staging.rename(self.output)
            return manifest
        except BaseException:
            if staging.exists():
                remove_runner_tree(staging)
            raise
