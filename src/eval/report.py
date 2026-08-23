"""Stable JSON and Markdown renderers for the public agent-eval scorecard."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _percent(value: float | None) -> str:
    return "NOT MEASURED" if value is None else f"{100.0 * value:.3f}%"


def _number(value: float | None, *, digits: int = 4) -> str:
    return "NOT MEASURED" if value is None else f"{value:.{digits}f}"


def _money(value: float | None) -> str:
    return "NOT MEASURED" if value is None else f"${value:.6f}"


def _metric_rows(report: dict[str, Any]) -> list[tuple[str, str, str, str]]:
    metrics = report["metrics"]
    replay = metrics["replay_fidelity"]
    contamination = metrics["contamination_estimate"]
    cost = metrics["cost_per_verified_finding"]
    recovery = metrics["fault_recovery_rate"]
    agreement = metrics["judge_human_agreement"]
    regression = metrics["regression_by_commit"]

    replay_value = _percent(replay.get("fidelity"))
    replay_evidence = (
        f"{replay.get('replay_runs', 0)} runs / "
        f"{replay.get('run_groups', 0)} groups"
    )
    contamination_value = _number(contamination.get("estimate"))
    contamination_evidence = f"{contamination.get('complete_pairs', 0)} paired worlds"
    cost_value = _money(cost.get("cost_per_verified_finding_usd"))
    cost_evidence = f"{cost.get('verified_findings', 0)} verified findings"
    recovery_value = _percent(recovery.get("recovery_rate"))
    recovery_evidence = (
        f"{recovery.get('recovered', 0)} / {recovery.get('fault_trials', 0)} faults"
    )
    agreement_value = _number(agreement.get("cohens_kappa"), digits=3)
    agreement_evidence = f"{agreement.get('judgments', 0)} paired labels"
    commit_rows = regression.get("commits", [])
    if commit_rows:
        regression_value = "; ".join(
            f"{row['commit_sha'][:12]}: {_percent(row['pass_rate'])}, "
            f"variance={row['seed_variance']:.6f}"
            for row in commit_rows
        )
        regression_evidence = f"{sum(row['attempts'] for row in commit_rows)} attempts"
    else:
        regression_value = "NOT MEASURED"
        regression_evidence = "0 attempts"

    return [
        ("Replay fidelity", replay_value, replay_evidence, replay["status"]),
        (
            "Contamination estimate (Sharpe)",
            contamination_value,
            contamination_evidence,
            contamination["status"],
        ),
        (
            "Cost per verified finding",
            cost_value,
            cost_evidence,
            cost["status"],
        ),
        ("Fault recovery rate", recovery_value, recovery_evidence, recovery["status"]),
        (
            "Judge-human agreement (Cohen's kappa)",
            agreement_value,
            agreement_evidence,
            agreement["status"],
        ),
        (
            "Regression pass rate + seed variance",
            regression_value,
            regression_evidence,
            regression["status"],
        ),
    ]


def render_markdown_report(report: dict[str, Any]) -> str:
    """Render a compact scorecard without filling evidence gaps with zeroes."""

    lines = [
        "# FinSight coding-agent evaluation scorecard",
        "",
        f"Publication status: **{report['publication_status'].upper()}**  ",
        f"All configured gates passed: **{'YES' if report['all_gates_passed'] else 'NO'}**  ",
        f"Evaluation ID: `{report['evaluation_id']}`  ",
        f"Evidence cutoff: `{report['evidence_cutoff_utc']}`  ",
        f"Attempt records: `{report['attempt_records']}`",
        "",
        "| Metric | Value | Evidence | Status |",
        "| --- | ---: | --- | --- |",
    ]
    for name, value, evidence, status in _metric_rows(report):
        lines.append(f"| {name} | {value} | {evidence} | {status.upper()} |")

    regression = report["metrics"]["regression_by_commit"]
    if regression.get("commits"):
        lines.extend(
            [
                "",
                "## Regression detail by commit",
                "",
                "| Commit | Pass rate | Seed variance | Seed stddev | Seeds | Coverage | Status |",
                "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
            ]
        )
        for row in regression["commits"]:
            lines.append(
                "| "
                f"`{row['commit_sha']}` | {_percent(row['pass_rate'])} | "
                f"{row['seed_variance']:.6f} | {row['seed_stddev']:.6f} | "
                f"{row['seeds']} | {_percent(row['task_seed_coverage'])} | "
                f"{row['status'].upper()} |"
            )

    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "- Replay fidelity compares both SHA-256 and byte length with replay 0; the gate is exactly 100%.",
            "- Contamination is the paired mean of real-world minus counterfactual-world Sharpe.",
            "- Cost includes failed attempts; the denominator includes only verifier-passing findings.",
            "- Missing pairs, labels, fault trials, replay counts, or seeds make the report incomplete.",
            "",
        ]
    )
    return "\n".join(lines)


def write_evaluation_report(
    report: dict[str, Any], output_directory: str | Path
) -> tuple[Path, Path]:
    """Write stable JSON and Markdown. Identical reports produce identical bytes."""

    directory = Path(output_directory)
    directory.mkdir(parents=True, exist_ok=True)
    json_path = directory / "agent_eval_report.json"
    markdown_path = directory / "agent_eval_report.md"
    json_path.write_text(
        json.dumps(
            report,
            ensure_ascii=False,
            sort_keys=True,
            indent=2,
            allow_nan=False,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    markdown_path.write_text(
        render_markdown_report(report), encoding="utf-8", newline="\n"
    )
    return json_path, markdown_path
