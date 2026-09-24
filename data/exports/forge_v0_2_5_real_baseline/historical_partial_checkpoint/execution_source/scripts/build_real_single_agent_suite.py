"""Build the six sealed research cases for Forge v0.2.5."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "eval/tasks/forge_v0_2_5/suite.json"
CERTIFICATION_HASH = "9ee9dabbadaa0e260e942d9c304c3c5dd0571e49470d8e8a4f35a0151c3f3166"
REALITY_LADDER_HASH = "db37154941316875261869460ee67c7382213c1a12fcdbb5fab84c48284e2e9c"
TOOLS = (
    ("research.run_screen", "SCREEN", "vectorbt", False),
    ("research.promote_event_replay", "EVENT_REPLAY", "nautilus", False),
    ("research.add_costs", "COSTS", "nautilus", False),
    ("research.run_latency_sensitivity", "LATENCY", "nautilus", True),
    ("research.run_counterfactual_stress", "STRESS", "nautilus", True),
)
BUDGET = {
    "max_tool_calls": 12,
    "max_engine_runs": 5,
    "max_high_fidelity_runs": 2,
    "max_tokens": 30_000,
    "max_cost_usd": 1.0,
    "max_wall_seconds": 180.0,
}
ACCEPTANCE = (
    "ACCEPT only after reliable counterfactual-stress evidence retains Sharpe >= 0.75 "
    "and at least 50% of screened Sharpe. REJECT once reliable evidence shows Sharpe "
    "<= 0.50. ABSTAIN when evidence is insufficient or a required engine is not trusted."
)


def _stages(
    values: list[float | None],
    *,
    observations: int = 240,
    screen_quality: str = "SUFFICIENT",
    unavailable_reason: str = "The frozen evidence panel is too sparse for promotion.",
    engine_override: dict[int, tuple[str, str]] | None = None,
) -> list[dict[str, Any]]:
    screen = values[0]
    result = []
    for index, ((tool, stage, default_engine, high_fidelity), value) in enumerate(
        zip(TOOLS, values, strict=True)
    ):
        engine, minimum = (engine_override or {}).get(index, (default_engine, "C4"))
        available = value is not None
        quality = screen_quality if index == 0 else ("SUFFICIENT" if available else "UNAVAILABLE")
        metrics = {}
        if available:
            assert screen is not None
            metrics = {
                "sharpe": value,
                "alpha_survival_ratio": 1.0 if index == 0 else value / screen,
                "max_drawdown": abs(value) * 0.01 + 0.01,
            }
        result.append(
            {
                "tool": tool,
                "stage": stage,
                "engine": engine,
                "minimum_certification": minimum,
                "high_fidelity": high_fidelity,
                "available": available,
                "observations": observations if available else 0,
                "evidence_quality": quality,
                "metrics": metrics,
                "reason": None if available else unavailable_reason,
            }
        )
    return result


def _task(
    task_id: str,
    task_class: str,
    hypothesis: str,
    values: list[float | None],
    expected: str,
    required_stage: str,
    recommended_stop_stage: str,
    *,
    observations: int = 240,
    screen_quality: str = "SUFFICIENT",
    allowed_engines: dict[str, dict[str, str]] | None = None,
    engine_override: dict[int, tuple[str, str]] | None = None,
    require_trust_refusal: bool = False,
) -> dict[str, Any]:
    return {
        "schema_version": "forge-real-single-agent-task/0.2.5",
        "task_id": task_id,
        "task_class": task_class,
        "objective": "Decide whether to promote or kill the supplied alpha hypothesis.",
        "hypothesis": hypothesis,
        "acceptance_criteria": ACCEPTANCE,
        "primary_metric": "sharpe",
        "execution_mode": "frozen_evidence_replay",
        "budget": dict(BUDGET),
        "allowed_engines": allowed_engines or {
            "vectorbt": {"minimum_certification": "C4"},
            "nautilus": {"minimum_certification": "C4"},
        },
        "stages": _stages(
            values,
            observations=observations,
            screen_quality=screen_quality,
            engine_override=engine_override,
        ),
        "grading": {
            "expected_verdict": expected,
            "required_stage": required_stage,
            "recommended_stop_stage": recommended_stop_stage,
            "require_trust_refusal": require_trust_refusal,
        },
        "reality_ladder_artifact_hash": REALITY_LADDER_HASH,
    }


def build_suite() -> dict[str, Any]:
    tasks = [
        _task(
            "v025_case_001", "obviously_fragile_alpha",
            "A short-horizon small-cap spread-reversion signal has deployable alpha.",
            [-0.30, -0.32, -0.50, -0.80, -1.20], "REJECT", "SCREEN", "SCREEN",
        ),
        _task(
            "v025_case_002", "dies_under_latency",
            "An opening-auction momentum signal remains profitable after realistic latency.",
            [2.00, 1.95, 1.70, 0.20, 0.05], "REJECT", "LATENCY", "LATENCY",
        ),
        _task(
            "v025_case_003", "dies_under_stress",
            "A volatility-compression breakout remains robust across counterfactual regimes.",
            [2.00, 1.95, 1.75, 1.45, 0.20], "REJECT", "STRESS", "STRESS",
        ),
        _task(
            "v025_case_004", "robust_alpha",
            "A diversified post-earnings drift signal survives execution and regime stress.",
            [2.00, 1.95, 1.75, 1.55, 1.20], "ACCEPT", "STRESS", "STRESS",
        ),
        _task(
            "v025_case_005", "insufficient_evidence",
            "A sparse borrow-cost reversal panel is sufficient to support deployment.",
            [1.10, None, None, None, None], "ABSTAIN", "SCREEN", "SCREEN",
            observations=18, screen_quality="INSUFFICIENT",
        ),
        _task(
            "v025_case_006", "uncertified_required_engine",
            "A sub-millisecond queue-imbalance signal survives native event replay.",
            [2.00, 1.90, 1.70, 1.40, 1.00], "ABSTAIN", "EVENT_REPLAY", "EVENT_REPLAY",
            allowed_engines={
                "vectorbt": {"minimum_certification": "C4"},
                "hftbacktest": {"minimum_certification": "C1"},
            },
            engine_override={
                1: ("hftbacktest", "C1"), 2: ("hftbacktest", "C1"),
                3: ("hftbacktest", "C1"), 4: ("hftbacktest", "C1"),
            },
            require_trust_refusal=True,
        ),
    ]
    return {
        "schema_version": "forge-real-single-agent-suite/0.2.5",
        "suite_id": "FORGE_REAL_SINGLE_AGENT_V0_2_5",
        "certification_artifact_hash": CERTIFICATION_HASH,
        "reality_ladder_artifact_hash": REALITY_LADDER_HASH,
        "tasks": tasks,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError(f"behavioral suite is immutable: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(build_suite(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8", newline="\n",
    )
    print(args.output.resolve())


if __name__ == "__main__":
    main()
