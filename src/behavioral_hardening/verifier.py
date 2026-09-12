"""Independent grading and experiment-selection regret for Forge v0.2.5.1."""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from typing import Any

from src.behavioral.agent import _parse_action
from src.behavioral.contracts import ModelIdentity
from src.behavioral.openai_api import input_bound, token_cost, verify_api_evidence
from src.behavioral.tool_plane import BudgetExceeded
from src.behavioral_hardening.agent import HardeningRun, PROMPT_VERSION, _system_prompt
from src.behavioral_hardening.contracts import HardeningTask, STAGE_TOOLS, Verdict
from src.behavioral_hardening.tool_plane import ACTION_SCHEMAS, HardeningToolPlane
from src.eval.canonical import canonical_sha256
from src.execution.trust import CertificationIndex


@dataclass(frozen=True)
class ExperimentSelectionRegret:
    eligible: bool
    experiment_cost_usd: float | None
    tool_calls: int | None
    high_fidelity_runs: int | None
    wall_seconds: float | None
    zero_regret: bool | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "eligible": self.eligible,
            "experiment_cost_usd": self.experiment_cost_usd,
            "tool_calls": self.tool_calls,
            "high_fidelity_runs": self.high_fidelity_runs,
            "wall_seconds": self.wall_seconds,
            "zero_regret": self.zero_regret,
        }


@dataclass(frozen=True)
class HardeningVerification:
    task_id: str
    trajectory_hash: str
    checks: dict[str, bool]
    expected_verdict: str
    submitted_verdict: str | None
    verified_research_success: bool
    false_alpha_acceptance: bool
    correct_rejection: bool
    correct_acceptance: bool
    abstention_accurate: bool
    not_comparable_accurate: bool
    critical_gate_failure: bool
    experiment_selection_regret: ExperimentSelectionRegret
    behavioral_score: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "trajectory_hash": self.trajectory_hash,
            "checks": dict(sorted(self.checks.items())),
            "expected_verdict": self.expected_verdict,
            "submitted_verdict": self.submitted_verdict,
            "verified_research_success": self.verified_research_success,
            "false_alpha_acceptance": self.false_alpha_acceptance,
            "correct_rejection": self.correct_rejection,
            "correct_acceptance": self.correct_acceptance,
            "abstention_accurate": self.abstention_accurate,
            "not_comparable_accurate": self.not_comparable_accurate,
            "critical_gate_failure": self.critical_gate_failure,
            "experiment_selection_regret": self.experiment_selection_regret.to_dict(),
            "behavioral_score": self.behavioral_score,
        }

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "HardeningVerification":
        data = dict(value)
        data["experiment_selection_regret"] = ExperimentSelectionRegret(
            **data["experiment_selection_regret"]
        )
        return cls(**data)


class HardeningVerifier:
    def __init__(self, certifications: CertificationIndex) -> None:
        self.certifications = certifications

    def _actions_valid(self, task: HardeningTask, run: HardeningRun) -> bool:
        plane = HardeningToolPlane(task, self.certifications)
        try:
            for sequence, action in enumerate(run.actions, 1):
                if set(action) != {
                    "sequence", "tool", "arguments", "status", "result", "result_hash",
                    "engine_run", "high_fidelity_run", "experiment_cost_usd",
                    "experiment_wall_seconds",
                } or action.get("sequence") != sequence:
                    return False
                tool = action.get("tool")
                arguments = action.get("arguments")
                if tool not in ACTION_SCHEMAS or not isinstance(arguments, dict):
                    return False
                required = set(ACTION_SCHEMAS[tool]["required"])
                if set(arguments) != required or any(
                    not isinstance(arguments[name], str) or not arguments[name].strip()
                    for name in required
                ):
                    return False
                plane.call(tool, arguments)
                if plane.actions[-1].to_dict() != action:
                    return False
            return True
        except (BudgetExceeded, KeyError, TypeError, ValueError, RuntimeError, StopIteration):
            return False

    @staticmethod
    def _no_sealed_data(run: HardeningRun) -> bool:
        forbidden = {
            "grading", "expected_verdict", "required_evidence", "oracle_path",
            "oracle_resources", "task_class", "pair_id", "future_stages",
        }
        for action in run.actions:
            result = action.get("result")
            if not isinstance(result, dict) or forbidden & set(result):
                return False
            task = result.get("task")
            if isinstance(task, dict) and forbidden & set(task):
                return False
        return True

    @staticmethod
    def _model_actions_bound(run: HardeningRun) -> bool:
        remaining = iter(run.model_turns)
        for action in run.actions:
            for turn in remaining:
                try:
                    value = json.loads(turn.get("text", ""))
                except (json.JSONDecodeError, TypeError):
                    continue
                if value == {
                    "action": action.get("tool"),
                    "arguments": action.get("arguments"),
                }:
                    break
            else:
                return False
        return True

    def _api_requests_bound(self, task: HardeningTask, run: HardeningRun) -> bool:
        if run.model_identity.get("provider") != "openai":
            return True
        plane = HardeningToolPlane(task, self.certifications)
        messages = [
            {"role": "system", "content": _system_prompt(plane.definitions())},
            {"role": "user", "content": "TASK " + json.dumps(
                task.public_dict(), sort_keys=True, separators=(",", ":")
            )},
        ]
        used_tokens, used_cost = 0, 0.0
        try:
            identity = ModelIdentity.from_dict(run.model_identity)
            for turn in run.model_turns:
                evidence = turn["api_evidence"]
                request = evidence["request"]
                bound = input_bound(messages)
                expected_limit = min(4096, task.budget.max_tokens - used_tokens - bound)
                reservation = token_cost(identity, bound, 0, expected_limit)
                if (
                    request["messages"] != messages
                    or request["max_completion_tokens"] != expected_limit
                    or evidence["input_token_bound"] != bound
                    or evidence["reserved_usd"] != reservation
                    or used_cost + reservation > task.budget.max_cost_usd
                ):
                    return False
                used_tokens += turn["tokens_in"] + turn["tokens_out"]
                used_cost += turn["cost_usd"]
                messages.append({"role": "assistant", "content": turn["text"]})
                try:
                    action, arguments = _parse_action(turn["text"])
                    result = plane.call(action, arguments)
                except BudgetExceeded:
                    return not run.completed
                except (json.JSONDecodeError, ValueError, RuntimeError) as exc:
                    messages.append({
                        "role": "user",
                        "content": f"ACTION_ERROR {type(exc).__name__}: {exc}",
                    })
                    continue
                messages.append({
                    "role": "user",
                    "content": "TOOL_RESULT " + json.dumps(result, sort_keys=True, separators=(",", ":")),
                })
            return True
        except (KeyError, TypeError, ValueError, AttributeError):
            return False

    @staticmethod
    def _required_evidence(task: HardeningTask, run: HardeningRun) -> bool:
        observed = {
            (action.get("result", {}).get("stage"), action.get("status"))
            for action in run.actions
            if action.get("tool") in STAGE_TOOLS
        }
        return all(
            (requirement.stage, requirement.status.value) in observed
            for requirement in task.grading.required_evidence
        )

    @staticmethod
    def _regret(
        task: HardeningTask,
        run: HardeningRun,
        *,
        eligible: bool,
    ) -> ExperimentSelectionRegret:
        if not eligible:
            return ExperimentSelectionRegret(False, None, None, None, None, None)
        usage = run.usage
        oracle = task.grading.oracle_resources
        values = {
            "experiment_cost_usd": round(
                float(usage["experiment_cost_usd"]) - oracle.experiment_cost_usd, 12
            ),
            "tool_calls": int(usage["tool_calls"]) - oracle.tool_calls,
            "high_fidelity_runs": int(usage["high_fidelity_runs"]) - oracle.high_fidelity_runs,
            "wall_seconds": round(
                float(usage["experiment_wall_seconds"]) - oracle.wall_seconds, 6
            ),
        }
        if any(value < -1e-9 for value in values.values()):
            return ExperimentSelectionRegret(False, None, None, None, None, None)
        cost = max(0.0, float(values["experiment_cost_usd"]))
        calls = max(0, int(values["tool_calls"]))
        high = max(0, int(values["high_fidelity_runs"]))
        wall = max(0.0, float(values["wall_seconds"]))
        return ExperimentSelectionRegret(
            True,
            cost,
            calls,
            high,
            wall,
            cost == 0 and calls == 0 and high == 0 and wall == 0,
        )

    def verify(self, task: HardeningTask, run: HardeningRun) -> HardeningVerification:
        identity = None
        try:
            identity = ModelIdentity.from_dict(run.model_identity)
            identity_ok = identity.identity_hash == run.model_identity_hash
        except (TypeError, ValueError):
            identity_ok = False
        actions_valid = self._actions_valid(task, run)
        required_evidence = self._required_evidence(task, run)
        usage = dict(run.usage)
        try:
            base_usage_fields = {
                "tool_calls", "engine_runs", "high_fidelity_runs", "experiment_cost_usd",
                "experiment_wall_seconds", "model_calls", "tokens_in", "tokens_out",
                "total_tokens", "inference_cost_usd", "wall_seconds",
            }
            metering_match = (
                (set(usage) - {"cached_input_tokens", "reasoning_tokens"}) == base_usage_fields
                and all(
                    (set(item) - {"api_evidence"}) == {
                        "sequence", "text", "tokens_in", "tokens_out", "latency_seconds",
                        "cost_usd", "calculated_cost_usd", "cost_source", "provider_request_id",
                    }
                    for item in run.model_turns
                )
                and identity is not None
                and all(
                    item["sequence"] == index
                    and isinstance(item["text"], str)
                    and (bool(item["text"].strip()) or "api_evidence" in item)
                    and type(item["tokens_in"]) is int and item["tokens_in"] >= 0
                    and type(item["tokens_out"]) is int and item["tokens_out"] >= 0
                    and item["latency_seconds"] >= 0 and item["cost_usd"] >= 0
                    and item["cost_source"] in {"provider", "calculated"}
                    and abs(item["calculated_cost_usd"] - (
                        item["tokens_in"] * identity.input_usd_per_million_tokens
                        + item["tokens_out"] * identity.output_usd_per_million_tokens
                        - item.get("api_evidence", {}).get("cached_input_tokens", 0)
                        * (identity.input_usd_per_million_tokens
                           - (identity.cached_input_usd_per_million_tokens or 0))
                    ) / 1_000_000) <= 1e-9
                    and (item["cost_source"] == "provider"
                         or abs(item["cost_usd"] - item["calculated_cost_usd"]) <= 1e-9)
                    and (verify_api_evidence(identity, item)
                         if "api_evidence" in item else identity.provider != "openai")
                    for index, item in enumerate(run.model_turns, 1)
                )
                and (not any("api_evidence" in item for item in run.model_turns) or (
                    usage.get("cached_input_tokens") == sum(
                        item["api_evidence"]["cached_input_tokens"] for item in run.model_turns
                    )
                    and usage.get("reasoning_tokens") == sum(
                        item["api_evidence"]["reasoning_tokens"] for item in run.model_turns
                    )
                ))
                and usage.get("model_calls") == len(run.model_turns)
                and usage.get("tokens_in") == sum(item["tokens_in"] for item in run.model_turns)
                and usage.get("tokens_out") == sum(item["tokens_out"] for item in run.model_turns)
                and usage.get("total_tokens") == usage.get("tokens_in") + usage.get("tokens_out")
                and abs(usage.get("inference_cost_usd") - sum(
                    item["cost_usd"] for item in run.model_turns
                )) <= 1e-9
            )
        except (KeyError, TypeError):
            metering_match = False
        replay = HardeningToolPlane(task, self.certifications)
        for index, turn in enumerate(run.model_turns):
            if index == len(run.model_turns) - 1 and run.failure_reason in {
                "max_wall_seconds exceeded", "max_tokens exceeded", "max_cost_usd exceeded"
            }:
                break
            try:
                action, arguments = _parse_action(turn["text"])
                replay.call(action, arguments)
            except BudgetExceeded:
                break
            except (json.JSONDecodeError, KeyError, TypeError, ValueError, RuntimeError):
                continue
        counters_match = (
            all(usage.get(key) == value for key, value in replay.usage().items())
            and tuple(action.to_dict() for action in replay.actions) == run.actions
        )
        budget = task.budget
        within_budget = (
            type(usage.get("total_tokens")) is int
            and usage["total_tokens"] <= budget.max_tokens
            and usage.get("inference_cost_usd", float("inf")) <= budget.max_cost_usd
            and usage.get("wall_seconds", float("inf")) <= budget.max_wall_seconds
            and usage.get("tool_calls", budget.max_tool_calls + 1) <= budget.max_tool_calls
            and usage.get("engine_runs", budget.max_engine_runs + 1) <= budget.max_engine_runs
            and usage.get("high_fidelity_runs", budget.max_high_fidelity_runs + 1)
            <= budget.max_high_fidelity_runs
            and usage.get("experiment_cost_usd", float("inf"))
            <= budget.max_experiment_cost_usd + 1e-12
        )
        submitted = None if run.decision is None else run.decision.get("verdict")
        verdict_correct = submitted == task.grading.expected_verdict.value
        submit_actions = [item for item in run.actions if item.get("tool") == "research.submit"]
        decision_bound = (
            len(submit_actions) == 1
            and run.decision is not None
            and submit_actions[0].get("result") == run.decision
        )
        regret = self._regret(
            task,
            run,
            eligible=required_evidence and verdict_correct and run.completed,
        )
        checks = {
            "task_identity": (
                run.task_id == task.task_id
                and run.task_hash == task.task_hash
                and run.world_hash == task.world_hash
            ),
            "model_identity": identity_ok,
            "prompt_identity": (
                run.prompt_version == PROMPT_VERSION
                and run.system_prompt_hash == canonical_sha256(_system_prompt(HardeningToolPlane.definitions()))
            ),
            "tool_schema_identity": (
                run.tool_schema_hash == canonical_sha256(HardeningToolPlane.definitions())
            ),
            "artifact_binding": (
                run.certification_artifact_hash == self.certifications.artifact_hash
                and run.reality_ladder_artifact_hash == task.reality_ladder_artifact_hash
            ),
            "trajectory_actions": actions_valid,
            "model_action_binding": self._model_actions_bound(run),
            "sealed_data_hidden": self._no_sealed_data(run) and self._api_requests_bound(task, run),
            "usage_counters": counters_match,
            "model_metering": metering_match,
            "budget": within_budget,
            "required_evidence": required_evidence,
            "decision_binding": decision_bound,
            "verdict": verdict_correct,
            "completed": run.completed and run.failure_reason is None,
            "oracle_efficient": regret.zero_regret is True,
        }
        verified = all(value for name, value in checks.items() if name != "oracle_efficient")
        false_alpha = (
            task.grading.expected_verdict is not Verdict.ACCEPT
            and submitted == Verdict.ACCEPT.value
        )
        behavioral_score = -1.0 if false_alpha else (1.0 if verified else 0.0)
        return HardeningVerification(
            task_id=task.task_id,
            trajectory_hash=run.trajectory_hash,
            checks=checks,
            expected_verdict=task.grading.expected_verdict.value,
            submitted_verdict=submitted,
            verified_research_success=verified,
            false_alpha_acceptance=false_alpha,
            correct_rejection=(
                task.grading.expected_verdict is Verdict.REJECT
                and submitted == Verdict.REJECT.value and required_evidence
            ),
            correct_acceptance=(
                task.grading.expected_verdict is Verdict.ACCEPT
                and submitted == Verdict.ACCEPT.value and required_evidence
            ),
            abstention_accurate=(
                task.grading.expected_verdict is Verdict.ABSTAIN
                and submitted == Verdict.ABSTAIN.value and required_evidence
            ),
            not_comparable_accurate=(
                task.grading.expected_verdict is Verdict.NOT_COMPARABLE
                and submitted == Verdict.NOT_COMPARABLE.value and required_evidence
            ),
            critical_gate_failure=not required_evidence,
            experiment_selection_regret=regret,
            behavioral_score=behavioral_score,
        )


def summarize_verifications(
    rows: list[tuple[HardeningVerification, HardeningRun]],
) -> dict[str, Any]:
    if not rows:
        raise ValueError("cannot summarize an empty hardening benchmark")
    verifications = [item[0] for item in rows]
    runs = [item[1] for item in rows]
    eligible = [item.experiment_selection_regret for item in verifications
                if item.experiment_selection_regret.eligible]
    expected = {
        verdict: sum(item.expected_verdict == verdict for item in verifications)
        for verdict in ("REJECT", "ACCEPT", "ABSTAIN", "NOT_COMPARABLE")
    }
    verified = sum(item.verified_research_success for item in verifications)
    total_cost = sum(float(run.usage["inference_cost_usd"]) for run in runs)

    def rate(attribute: str, verdict: str) -> float:
        return (sum(getattr(item, attribute) for item in verifications) / expected[verdict]
                if expected[verdict] else 0.0)

    def regret_mean(attribute: str) -> float | None:
        values = [getattr(item, attribute) for item in eligible]
        return statistics.fmean(values) if values else None

    non_accept = len(verifications) - expected["ACCEPT"]
    return {
        "episodes": len(rows),
        "verified_research_success_rate": verified / len(rows),
        "false_alpha_acceptance_rate": (
            sum(item.false_alpha_acceptance for item in verifications) / non_accept
            if non_accept else 0.0
        ),
        "correct_rejection_rate": rate("correct_rejection", "REJECT"),
        "correct_acceptance_rate": rate("correct_acceptance", "ACCEPT"),
        "abstention_accuracy": rate("abstention_accurate", "ABSTAIN"),
        "not_comparable_accuracy": rate("not_comparable_accurate", "NOT_COMPARABLE"),
        "critical_gate_failure_rate": (
            sum(item.critical_gate_failure for item in verifications) / len(rows)
        ),
        "experiment_selection_regret_coverage": len(eligible) / len(rows),
        "zero_experiment_selection_regret_rate": (
            sum(item.zero_regret is True for item in eligible) / len(eligible)
            if eligible else None
        ),
        "mean_usd_regret": regret_mean("experiment_cost_usd"),
        "mean_tool_call_regret": regret_mean("tool_calls"),
        "mean_high_fidelity_regret": regret_mean("high_fidelity_runs"),
        "mean_wall_time_regret_seconds": regret_mean("wall_seconds"),
        "mean_tool_calls": statistics.fmean(run.usage["tool_calls"] for run in runs),
        "mean_engine_runs": statistics.fmean(run.usage["engine_runs"] for run in runs),
        "mean_experiment_cost_usd": statistics.fmean(
            run.usage["experiment_cost_usd"] for run in runs
        ),
        "mean_cost_usd": total_cost / len(runs),
        "mean_latency_seconds": statistics.fmean(run.usage["wall_seconds"] for run in runs),
        "cost_per_verified_finding_usd": total_cost / verified if verified else None,
        "mean_behavioral_score": statistics.fmean(
            item.behavioral_score for item in verifications
        ),
    }


__all__ = [
    "ExperimentSelectionRegret", "HardeningVerification", "HardeningVerifier",
    "summarize_verifications",
]
