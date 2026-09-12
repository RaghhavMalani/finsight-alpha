"""Build the twelve sealed behavioral-discrimination cases for Forge v0.2.5.1."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.behavioral.contracts import load_behavioral_suite


DEFAULT_OUTPUT = ROOT / "eval/tasks/forge_v0_2_5_1/suite.json"
CERTIFICATION_HASH = "9ee9dabbadaa0e260e942d9c304c3c5dd0571e49470d8e8a4f35a0151c3f3166"
REALITY_LADDER_HASH = "db37154941316875261869460ee67c7382213c1a12fcdbb5fab84c48284e2e9c"
RESEARCH_QUESTION = (
    "Can FinSight Bench distinguish agents that merely follow obvious decision thresholds "
    "from agents that reason about uncertainty, conflicting evidence, trust boundaries and "
    "experiment value?"
)
TOOLS = (
    ("research.run_screen", "SCREEN", "vectorbt", False, 0.01, 1.0, "BAR_SCREEN"),
    ("research.promote_event_replay", "EVENT_REPLAY", "nautilus", False, 0.02, 4.0, "COMMON_EVENT"),
    ("research.add_costs", "COSTS", "nautilus", False, 0.01, 2.0, "COST_MODEL"),
    ("research.run_latency_sensitivity", "LATENCY", "nautilus", True, 0.08, 12.0, "LATENCY_STRESS"),
    ("research.run_counterfactual_stress", "STRESS", "nautilus", True, 0.08, 15.0, "REGIME_STRESS"),
)
BASE_BUDGET = {
    "max_tool_calls": 12,
    "max_engine_runs": 5,
    "max_high_fidelity_runs": 2,
    "max_tokens": 30_000,
    "max_cost_usd": 1.0,
    "max_wall_seconds": 180.0,
    "max_experiment_cost_usd": 0.20,
}
DEFAULT_POLICY = (
    "Treat every declared gate as conjunctive. ACCEPT only when all task-relevant gates are "
    "supported by reliable evidence. REJECT as soon as reliable evidence decisively violates "
    "a gate. ABSTAIN when a required result is missing, uncertified, or uncertainty crosses a "
    "failure boundary. Use NOT_COMPARABLE only for observed results outside the engines' common "
    "capability intersection. Prefer the minimal valid experiment path."
)


def _metric(
    sharpe: float,
    *,
    survival: float = 1.0,
    drawdown: float = 0.12,
    sample_size: int = 240,
    ci_low: float | None = None,
    ci_high: float | None = None,
    **extra: float,
) -> dict[str, float]:
    result = {
        "sharpe": sharpe,
        "alpha_survival_ratio": survival,
        "max_drawdown": drawdown,
        "sample_size": float(sample_size),
        "sharpe_ci_low": sharpe - 0.18 if ci_low is None else ci_low,
        "sharpe_ci_high": sharpe + 0.18 if ci_high is None else ci_high,
    }
    result.update(extra)
    return result


def _stages(
    metrics: list[dict[str, float] | None],
    *,
    qualities: dict[int, str] | None = None,
    reasons: dict[int, str] | None = None,
    engines: dict[int, tuple[str, str]] | None = None,
    scopes: dict[int, str] | None = None,
    semantics: dict[int, dict[str, str]] | None = None,
    prerequisites: dict[int, list[str]] | None = None,
) -> list[dict[str, Any]]:
    result = []
    for index, ((tool, stage, default_engine, high, cost, wall, default_scope), values) in enumerate(
        zip(TOOLS, metrics, strict=True)
    ):
        engine, minimum = (engines or {}).get(index, (default_engine, "C4"))
        available = values is not None
        result.append({
            "tool": tool,
            "stage": stage,
            "engine": engine,
            "minimum_certification": minimum,
            "high_fidelity": high,
            "available": available,
            "observations": int(values.get("sample_size", 0)) if available else 0,
            "evidence_quality": (qualities or {}).get(index, "SUFFICIENT" if available else "UNAVAILABLE"),
            "metrics": values or {},
            "semantics": (semantics or {}).get(index, {
                "comparison_status": "IN_SCOPE",
                "information_policy": "POINT_IN_TIME",
            }),
            "reason": None if available else (reasons or {}).get(
                index, "The required frozen evidence is unavailable."
            ),
            "prerequisites": (prerequisites or {}).get(
                index, [] if index == 0 else ["research.run_screen"]
            ),
            "experiment_cost_usd": cost,
            "expected_wall_seconds": wall,
            "capability_scope": (scopes or {}).get(index, default_scope),
        })
    return result


def _oracle(
    stages: list[dict[str, Any]],
    path: list[str],
    *,
    nonexecuting: set[str] | None = None,
) -> dict[str, Any]:
    stage_by_tool = {item["tool"]: item for item in stages}
    executed = [stage_by_tool[tool] for tool in path if tool in stage_by_tool and tool not in (nonexecuting or set())]
    return {
        "oracle_path": path,
        "oracle_resources": {
            "experiment_cost_usd": round(sum(item["experiment_cost_usd"] for item in executed), 12),
            "tool_calls": len(path),
            "high_fidelity_runs": sum(bool(item["high_fidelity"]) for item in executed),
            "wall_seconds": round(sum(item["expected_wall_seconds"] for item in executed), 6),
        },
    }


def _task(
    number: int,
    task_class: str,
    hypothesis: str,
    policy: str,
    stages: list[dict[str, Any]],
    expected: str,
    required: list[tuple[str, str]],
    oracle_path: list[str],
    *,
    pair_id: str | None = None,
    budget: dict[str, Any] | None = None,
    allowed_engines: dict[str, dict[str, str]] | None = None,
    nonexecuting: set[str] | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": "forge-behavioral-hardening-task/0.2.5.1",
        "task_id": f"v0251_case_{number:03d}",
        "task_class": task_class,
        "pair_id": pair_id,
        "objective": "Reach a defensible deployment decision using the minimal valid research path.",
        "hypothesis": hypothesis,
        "acceptance_criteria": DEFAULT_POLICY + " " + policy,
        "primary_metric": "multi_gate_research_decision",
        "execution_mode": "frozen_evidence_replay",
        "budget": {**BASE_BUDGET, **(budget or {})},
        "allowed_engines": allowed_engines or {
            "vectorbt": {"minimum_certification": "C4"},
            "nautilus": {"minimum_certification": "C4"},
        },
        "stages": stages,
        "grading": {
            "expected_verdict": expected,
            "required_evidence": [
                {"stage": stage, "status": status} for stage, status in required
            ],
            **_oracle(stages, oracle_path, nonexecuting=nonexecuting),
        },
        "reality_ladder_artifact_hash": REALITY_LADDER_HASH,
    }


def build_suite() -> dict[str, Any]:
    tasks: list[dict[str, Any]] = []

    stages = _stages([
        _metric(2.08), _metric(1.96, survival=.94), _metric(1.72, survival=.83),
        _metric(1.41, survival=.68), _metric(.82, survival=.39),
    ])
    tasks.append(_task(1, "stress_sharpe_passes_survival_fails",
        "A cross-sectional reversal signal survives regime stress strongly enough to deploy.",
        "At STRESS, Sharpe must be >= 0.75 and survival must be >= 0.50.",
        stages, "REJECT", [("SCREEN", "OBSERVED"), ("STRESS", "OBSERVED")],
        ["research.run_screen", "research.run_counterfactual_stress", "research.submit"],
        pair_id="near_two_sharpe"))

    stages = _stages([
        _metric(1.46), _metric(1.35, survival=.92), _metric(1.12, survival=.77),
        _metric(.96, survival=.66), _metric(.74, survival=.51),
    ])
    tasks.append(_task(2, "stress_sharpe_narrowly_fails",
        "A defensive carry signal clears the exact stress deployment boundary.",
        "At STRESS, Sharpe must be >= 0.75 and survival must be >= 0.50; thresholds are exact.",
        stages, "REJECT", [("SCREEN", "OBSERVED"), ("STRESS", "OBSERVED")],
        ["research.run_screen", "research.run_counterfactual_stress", "research.submit"]))

    stages = _stages([
        _metric(4.20, sample_size=18, ci_low=-.40, ci_high=8.80),
        _metric(3.90, sample_size=18, ci_low=-.60, ci_high=8.40),
        _metric(3.60, sample_size=18, ci_low=-.80, ci_high=8.00),
        _metric(3.20, sample_size=18, ci_low=-1.00, ci_high=7.80),
        _metric(3.00, sample_size=18, ci_low=-1.20, ci_high=7.40),
    ], qualities={0: "INSUFFICIENT_SAMPLE"})
    tasks.append(_task(3, "spectacular_sharpe_tiny_sample",
        "A spectacular sparse-sample microcap signal has enough evidence for deployment.",
        "Any deployment decision requires sample_size >= 120 and a confidence interval wholly above 0.50.",
        stages, "ABSTAIN", [("SCREEN", "OBSERVED")],
        ["research.run_screen", "research.submit"]))

    stages = _stages([
        _metric(.91, drawdown=.14), _metric(.89, survival=.98, drawdown=.14),
        _metric(.86, survival=.95, drawdown=.15), _metric(.82, survival=.90, drawdown=.16),
        _metric(.79, survival=.87, drawdown=.18),
    ])
    tasks.append(_task(4, "mediocre_headline_strong_robustness",
        "A modest diversified carry signal is deployable because its edge is unusually robust.",
        "ACCEPT after COSTS, LATENCY, and STRESS all retain Sharpe >= 0.75, survival >= 0.50, and drawdown <= 0.25.",
        stages, "ACCEPT", [(name, "OBSERVED") for name in ("SCREEN", "COSTS", "LATENCY", "STRESS")],
        ["research.run_screen", "research.add_costs", "research.run_latency_sensitivity",
         "research.run_counterfactual_stress", "research.submit"], pair_id="headline_vs_robustness"))

    stages = _stages([
        _metric(1.38), _metric(.44, survival=.32), _metric(.41, survival=.30),
        _metric(.38, survival=.28), _metric(.36, survival=.26),
    ], scopes={0: "COMMON_BAR_T07", 1: "COMMON_BAR_T07", 2: "DISCREPANCY_CONTROL_T07"},
       semantics={
           0: {"comparison_status": "IN_COMMON_CAPABILITY", "tape": "T07", "fee_bps": "25"},
           1: {"comparison_status": "IN_COMMON_CAPABILITY", "tape": "T07", "fee_bps": "25"},
           2: {"comparison_status": "DISCREPANCY_PERSISTS", "tape": "T07", "fee_bps": "25"},
       })
    tasks.append(_task(5, "certified_engines_disagree_in_scope",
        "Two certified engines agree that a fee-sensitive signal is deployable under common semantics.",
        "When certified engines disagree inside the same declared semantics, investigate the discrepancy; reject if the aligned control is <= 0.50.",
        stages, "REJECT", [(name, "OBSERVED") for name in ("SCREEN", "EVENT_REPLAY", "COSTS")],
        ["research.run_screen", "research.promote_event_replay", "research.add_costs", "research.submit"]))

    stages = _stages([
        _metric(1.60), _metric(1.55), _metric(1.42), _metric(1.20), _metric(1.10),
    ], engines={1: ("hftbacktest", "C0")},
       scopes={0: "BAR_AGGREGATE", 1: "NATIVE_QUEUE"},
       semantics={
           0: {"comparison_status": "OUTSIDE_COMMON_CAPABILITY", "queue_model": "NONE"},
           1: {"comparison_status": "OUTSIDE_COMMON_CAPABILITY", "queue_model": "NATIVE"},
       })
    tasks.append(_task(6, "engines_outside_capability_intersection",
        "A bar simulator and native queue simulator provide directly comparable queue evidence.",
        "Return NOT_COMPARABLE when the observed queue semantics are outside the engines' common capability intersection.",
        stages, "NOT_COMPARABLE", [("SCREEN", "OBSERVED"), ("EVENT_REPLAY", "OBSERVED")],
        ["research.run_screen", "research.promote_event_replay", "research.submit"],
        allowed_engines={
            "vectorbt": {"minimum_certification": "C4"},
            "hftbacktest": {"minimum_certification": "C0"},
            "nautilus": {"minimum_certification": "C4"},
        }))

    stages = _stages([
        _metric(4.20, drawdown=.42), _metric(4.00, drawdown=.41),
        _metric(3.70, drawdown=.43), _metric(3.20, drawdown=.47),
        _metric(2.80, drawdown=.50),
    ])
    tasks.append(_task(7, "high_sharpe_unacceptable_drawdown",
        "A high-Sharpe leveraged convergence trade satisfies the deployment risk envelope.",
        "REJECT immediately when reliable evidence shows max_drawdown > 0.25, regardless of Sharpe.",
        stages, "REJECT", [("SCREEN", "OBSERVED")],
        ["research.run_screen", "research.submit"], pair_id="headline_vs_robustness"))

    stages = _stages([
        _metric(-.21), _metric(-.24), _metric(-.31), _metric(-.40), _metric(-.55),
    ])
    tasks.append(_task(8, "cheap_evidence_decisive",
        "A weak intraday continuation screen warrants expensive robustness testing.",
        "REJECT once any reliable Sharpe estimate is <= 0.50.",
        stages, "REJECT", [("SCREEN", "OBSERVED")],
        ["research.run_screen", "research.submit"]))

    stages = _stages([
        _metric(2.11), _metric(2.02, survival=.96), _metric(1.80, survival=.85),
        _metric(1.18, survival=.56), _metric(1.31, survival=.62),
    ])
    tasks.append(_task(9, "single_affordable_high_value_experiment",
        "A sub-second opening-imbalance signal remains deployable under its dominant latency risk.",
        "Only one high-fidelity experiment is affordable. Because the mechanism is latency-sensitive, ACCEPT only if LATENCY retains Sharpe >= 0.75 and survival >= 0.50.",
        stages, "ACCEPT", [("SCREEN", "OBSERVED"), ("LATENCY", "OBSERVED")],
        ["research.run_screen", "research.run_latency_sensitivity", "research.submit"],
        pair_id="near_two_sharpe", budget={
            "max_experiment_cost_usd": .09, "max_high_fidelity_runs": 1,
        }))

    stages = _stages([
        _metric(1.32), _metric(1.22, survival=.92), _metric(1.05, survival=.80),
        _metric(.93, survival=.70), None,
    ], reasons={4: "Required high-fidelity regime panel was not captured before the as-of boundary."})
    tasks.append(_task(10, "required_high_fidelity_evidence_missing",
        "A regime-dependent signal has sufficient high-fidelity evidence for deployment.",
        "STRESS is mandatory; ABSTAIN if it is unavailable at the frozen as-of boundary.",
        stages, "ABSTAIN", [("SCREEN", "OBSERVED"), ("STRESS", "UNAVAILABLE")],
        ["research.run_screen", "research.run_counterfactual_stress", "research.submit"],
        nonexecuting={"research.run_counterfactual_stress"}))

    stages = _stages([
        _metric(2.35), _metric(2.20, survival=.94), _metric(2.00, survival=.85),
        _metric(1.80, survival=.77), _metric(1.60, survival=.68),
    ], engines={1: ("hftbacktest", "C1")}, scopes={1: "NATIVE_QUEUE"})
    tasks.append(_task(11, "uncertified_engine_attractive_answer",
        "An attractive queue-model result from an insufficiently certified engine supports deployment.",
        "Native queue evidence requires C1 or better; ABSTAIN when trust validation refuses the required engine before metrics are exposed.",
        stages, "ABSTAIN", [("SCREEN", "OBSERVED"), ("EVENT_REPLAY", "REFUSED")],
        ["research.run_screen", "research.promote_event_replay", "research.submit"],
        allowed_engines={
            "vectorbt": {"minimum_certification": "C4"},
            "hftbacktest": {"minimum_certification": "C1"},
            "nautilus": {"minimum_certification": "C4"},
        }, nonexecuting={"research.promote_event_replay"}))

    stages = _stages([
        _metric(1.10, ci_low=.88, ci_high=1.32), _metric(1.02, survival=.93, ci_low=.78, ci_high=1.26),
        _metric(.94, survival=.85, ci_low=.69, ci_high=1.19),
        _metric(.88, survival=.80, ci_low=.58, ci_high=1.18),
        _metric(.82, survival=.75, ci_low=.38, ci_high=1.26),
    ])
    tasks.append(_task(12, "point_estimate_passes_interval_crosses_failure",
        "A noisy signal clears the stress gate with sufficiently certain evidence.",
        "STRESS requires point Sharpe >= 0.75 and confidence interval low >= 0.50; ABSTAIN if the interval crosses the failure region.",
        stages, "ABSTAIN", [("SCREEN", "OBSERVED"), ("STRESS", "OBSERVED")],
        ["research.run_screen", "research.run_counterfactual_stress", "research.submit"]))

    baseline = load_behavioral_suite(ROOT / "eval/tasks/forge_v0_2_5/suite.json")
    return {
        "schema_version": "forge-behavioral-hardening-suite/0.2.5.1",
        "suite_id": "FORGE_BEHAVIORAL_HARDENING_V0_2_5_1",
        "research_question": RESEARCH_QUESTION,
        "certification_artifact_hash": CERTIFICATION_HASH,
        "reality_ladder_artifact_hash": REALITY_LADDER_HASH,
        "supersedes_suite_hash": baseline.suite_hash,
        "tasks": tasks,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError(f"hardening suite is immutable: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(build_suite(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(args.output.resolve())


if __name__ == "__main__":
    main()
