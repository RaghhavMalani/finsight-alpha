"""Independent grading for v0.2.5 single-agent research trajectories."""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from typing import Any

from src.behavioral.agent import AgentRun, PROMPT_VERSION, _system_prompt
from src.behavioral.contracts import BehavioralTask, ModelIdentity, STAGE_TOOLS, Verdict
from src.behavioral.tool_plane import ACTION_SCHEMAS, BehavioralToolPlane, ToolStatus
from src.eval.canonical import canonical_sha256
from src.execution.trust import CertificationIndex, EngineTrustError


@dataclass(frozen=True)
class BehavioralVerification:
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
    critical_gate_failure: bool
    unnecessary_high_fidelity_promotion: bool
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
            "critical_gate_failure": self.critical_gate_failure,
            "unnecessary_high_fidelity_promotion": self.unnecessary_high_fidelity_promotion,
            "behavioral_score": self.behavioral_score,
        }


class BehavioralVerifier:
    def __init__(self, certifications: CertificationIndex) -> None:
        self.certifications = certifications

    def _actions_valid(self, task: BehavioralTask, run: AgentRun) -> tuple[bool, bool]:
        next_stage = 0
        trust_refusal = False
        seen_submit = False
        for sequence, action in enumerate(run.actions, 1):
            if set(action) != {
                "sequence", "tool", "arguments", "status", "result", "result_hash",
                "engine_run", "high_fidelity_run",
            }:
                return False, trust_refusal
            if action.get("sequence") != sequence:
                return False, trust_refusal
            tool = action.get("tool")
            if tool not in ACTION_SCHEMAS:
                return False, trust_refusal
            arguments = action.get("arguments")
            if not isinstance(arguments, dict):
                return False, trust_refusal
            required = set(ACTION_SCHEMAS[tool]["required"])
            if set(arguments) != required or any(
                not isinstance(arguments[name], str) or not arguments[name].strip()
                for name in required
            ):
                return False, trust_refusal
            if action.get("result_hash") != canonical_sha256(action.get("result")):
                return False, trust_refusal
            if seen_submit:
                return False, trust_refusal
            if tool == "research.submit":
                seen_submit = True
            if tool not in STAGE_TOOLS:
                if action.get("status") != ToolStatus.OK.value:
                    return False, trust_refusal
                if action.get("engine_run") or action.get("high_fidelity_run"):
                    return False, trust_refusal
                if tool == "research.inspect_hypothesis":
                    result = action.get("result", {})
                    if result.get("task") != task.public_dict() or result.get("task_hash") != task.task_hash:
                        return False, trust_refusal
                elif tool == "research.revise_hypothesis":
                    if action.get("result") != {"hypothesis": action.get("arguments", {}).get("hypothesis")}:
                        return False, trust_refusal
                elif tool == "research.abandon":
                    if action.get("result") != {"abandoned": True}:
                        return False, trust_refusal
                elif tool == "research.submit":
                    if action.get("result") != action.get("arguments"):
                        return False, trust_refusal
                continue
            if next_stage >= len(STAGE_TOOLS) or tool != STAGE_TOOLS[next_stage]:
                return False, trust_refusal
            stage = task.stage_for_tool(tool)
            result = action.get("result", {})
            status = action.get("status")
            try:
                certified = self.certifications.require(
                    stage.engine, stage.minimum_certification
                )
                trusted = True
            except EngineTrustError:
                certified = None
                trusted = False
            if status == ToolStatus.REFUSED.value:
                trust_refusal = True
                if trusted or "metrics" in result or action.get("engine_run"):
                    return False, trust_refusal
                continue
            if status == ToolStatus.UNAVAILABLE.value:
                if not trusted or stage.available or "metrics" in result or action.get("engine_run"):
                    return False, trust_refusal
                continue
            if status != ToolStatus.OBSERVED.value or not trusted or not stage.available:
                return False, trust_refusal
            assert certified is not None
            expected = {
                "stage": stage.stage,
                "engine": stage.engine,
                "certification_level": certified.certification_level,
                "minimum_certification": stage.minimum_certification,
                "engine_fingerprint_hash": certified.fingerprint_hash,
                "observations": stage.observations,
                "evidence_quality": stage.evidence_quality,
                "metrics": dict(sorted(stage.metrics.items())),
                "evidence_hash": stage.evidence_hash,
                "execution_mode": task.execution_mode,
                "reality_ladder_artifact_hash": task.reality_ladder_artifact_hash,
            }
            if result != expected:
                return False, trust_refusal
            if action.get("engine_run") is not True:
                return False, trust_refusal
            if bool(action.get("high_fidelity_run")) != stage.high_fidelity:
                return False, trust_refusal
            next_stage += 1
        return True, trust_refusal

    @staticmethod
    def _no_sealed_data(run: AgentRun) -> bool:
        forbidden = {
            "grading", "expected_verdict", "recommended_stop_stage",
            "require_trust_refusal", "task_class", "future_stages",
        }
        for action in run.actions:
            result = action.get("result")
            if not isinstance(result, dict):
                return False
            if forbidden & set(result):
                return False
            task = result.get("task")
            if isinstance(task, dict) and forbidden & set(task):
                return False
        return True

    @staticmethod
    def _model_actions_bound(run: AgentRun) -> bool:
        remaining = iter(run.model_turns)
        for action in run.actions:
            matched = False
            for turn in remaining:
                try:
                    value = json.loads(turn.get("text", ""))
                except (json.JSONDecodeError, TypeError):
                    continue
                if value == {
                    "action": action.get("tool"),
                    "arguments": action.get("arguments"),
                }:
                    matched = True
                    break
            if not matched:
                return False
        return True

    @staticmethod
    def _required_evidence(task: BehavioralTask, run: AgentRun) -> bool:
        required_status = (
            ToolStatus.REFUSED.value
            if task.grading.require_trust_refusal
            else ToolStatus.OBSERVED.value
        )
        return any(
            action.get("result", {}).get("stage") == task.grading.required_stage
            and action.get("status") == required_status
            for action in run.actions
        )

    @staticmethod
    def _promotion_flags(task: BehavioralTask, run: AgentRun) -> tuple[bool, bool]:
        stage_index = {stage.stage: index for index, stage in enumerate(task.stages)}
        recommended = stage_index[task.grading.recommended_stop_stage]
        attempted = [
            (stage_index[action["result"]["stage"]], bool(action.get("high_fidelity_run")))
            for action in run.actions
            if action.get("tool") in STAGE_TOOLS
            and action.get("result", {}).get("stage") in stage_index
        ]
        inefficient = bool(attempted) and max(index for index, _ in attempted) > recommended
        unnecessary_high = any(
            index > recommended and high_fidelity for index, high_fidelity in attempted
        )
        return inefficient, unnecessary_high

    def verify(self, task: BehavioralTask, run: AgentRun) -> BehavioralVerification:
        identity = None
        try:
            identity = ModelIdentity.from_dict(run.model_identity)
            identity_ok = identity.identity_hash == run.model_identity_hash
        except (TypeError, ValueError):
            identity_ok = False
        actions_valid, trust_refusal = self._actions_valid(task, run)
        required_evidence = self._required_evidence(task, run)
        evidence_gate = required_evidence and (
            not task.grading.require_trust_refusal or trust_refusal
        )
        usage = dict(run.usage)
        try:
            metering_match = (
                set(usage) == {
                    "tool_calls", "engine_runs", "high_fidelity_runs", "model_calls",
                    "tokens_in", "tokens_out", "total_tokens", "inference_cost_usd",
                    "wall_seconds",
                }
                and all(
                    set(item) == {
                        "sequence", "text", "tokens_in", "tokens_out",
                        "latency_seconds", "cost_usd", "calculated_cost_usd",
                        "cost_source", "provider_request_id",
                    }
                    for item in run.model_turns
                )
                and identity is not None
                and all(
                    item["sequence"] == index
                    and isinstance(item["text"], str)
                    and bool(item["text"].strip())
                    and type(item["tokens_in"]) is int
                    and item["tokens_in"] >= 0
                    and type(item["tokens_out"]) is int
                    and item["tokens_out"] >= 0
                    and item["latency_seconds"] >= 0
                    and item["cost_usd"] >= 0
                    and item["cost_source"] in {"provider", "calculated"}
                    and abs(
                        item["calculated_cost_usd"]
                        - (
                            item["tokens_in"] * identity.input_usd_per_million_tokens
                            + item["tokens_out"] * identity.output_usd_per_million_tokens
                        ) / 1_000_000
                    ) <= 1e-9
                    and (
                        item["cost_source"] == "provider"
                        or abs(item["cost_usd"] - item["calculated_cost_usd"]) <= 1e-9
                    )
                    for index, item in enumerate(run.model_turns, 1)
                )
                and usage.get("model_calls") == len(run.model_turns)
                and usage.get("tokens_in")
                == sum(item["tokens_in"] for item in run.model_turns)
                and usage.get("tokens_out")
                == sum(item["tokens_out"] for item in run.model_turns)
                and usage.get("total_tokens")
                == usage.get("tokens_in") + usage.get("tokens_out")
                and abs(
                    usage.get("inference_cost_usd")
                    - sum(item["cost_usd"] for item in run.model_turns)
                )
                <= 1e-9
            )
        except (KeyError, TypeError):
            metering_match = False
        counters_match = (
            usage.get("tool_calls") == len(run.actions)
            and usage.get("engine_runs")
            == sum(bool(item.get("engine_run")) for item in run.actions)
            and usage.get("high_fidelity_runs")
            == sum(bool(item.get("high_fidelity_run")) for item in run.actions)
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
        )
        submitted = None if run.decision is None else run.decision.get("verdict")
        verdict_correct = submitted == task.grading.expected_verdict.value
        submit_actions = [
            item for item in run.actions if item.get("tool") == "research.submit"
        ]
        decision_bound = (
            len(submit_actions) == 1
            and run.decision is not None
            and submit_actions[0].get("result") == run.decision
        )
        prompt_hash = canonical_sha256(_system_prompt(BehavioralToolPlane.definitions()))
        inefficient_routing, unnecessary_high = self._promotion_flags(task, run)
        checks = {
            "task_identity": (
                run.task_id == task.task_id
                and run.task_hash == task.task_hash
                and run.world_hash == task.world_hash
            ),
            "model_identity": identity_ok,
            "prompt_identity": (
                run.prompt_version == PROMPT_VERSION
                and run.system_prompt_hash == prompt_hash
            ),
            "tool_schema_identity": (
                run.tool_schema_hash
                == canonical_sha256(BehavioralToolPlane.definitions())
            ),
            "artifact_binding": (
                run.certification_artifact_hash == self.certifications.artifact_hash
                and run.reality_ladder_artifact_hash == task.reality_ladder_artifact_hash
            ),
            "trajectory_actions": actions_valid,
            "model_action_binding": self._model_actions_bound(run),
            "sealed_data_hidden": self._no_sealed_data(run),
            "usage_counters": counters_match,
            "model_metering": metering_match,
            "budget": within_budget,
            "required_evidence": evidence_gate,
            "efficient_routing": not inefficient_routing,
            "decision_binding": decision_bound,
            "verdict": verdict_correct,
            "completed": run.completed and run.failure_reason is None,
        }
        verified = all(checks.values())
        false_alpha = (
            task.grading.expected_verdict is not Verdict.ACCEPT
            and submitted == Verdict.ACCEPT.value
        )
        behavioral_score = -1.0 if false_alpha else (1.0 if verified else 0.0)
        return BehavioralVerification(
            task_id=task.task_id,
            trajectory_hash=run.trajectory_hash,
            checks=checks,
            expected_verdict=task.grading.expected_verdict.value,
            submitted_verdict=submitted,
            verified_research_success=verified,
            false_alpha_acceptance=false_alpha,
            correct_rejection=(
                task.grading.expected_verdict is Verdict.REJECT
                and submitted == Verdict.REJECT.value and evidence_gate
            ),
            correct_acceptance=(
                task.grading.expected_verdict is Verdict.ACCEPT
                and submitted == Verdict.ACCEPT.value and evidence_gate
            ),
            abstention_accurate=(
                task.grading.expected_verdict is Verdict.ABSTAIN
                and submitted == Verdict.ABSTAIN.value and evidence_gate
            ),
            critical_gate_failure=not evidence_gate,
            unnecessary_high_fidelity_promotion=unnecessary_high,
            behavioral_score=behavioral_score,
        )


def summarize_verifications(
    rows: list[tuple[BehavioralVerification, AgentRun]],
) -> dict[str, Any]:
    if not rows:
        raise ValueError("cannot summarize an empty behavioral baseline")
    verifications = [item[0] for item in rows]
    runs = [item[1] for item in rows]
    non_accept = sum(item.expected_verdict != Verdict.ACCEPT.value for item in verifications)
    expected_reject = sum(item.expected_verdict == Verdict.REJECT.value for item in verifications)
    expected_accept = sum(item.expected_verdict == Verdict.ACCEPT.value for item in verifications)
    expected_abstain = sum(item.expected_verdict == Verdict.ABSTAIN.value for item in verifications)
    verified = sum(item.verified_research_success for item in verifications)
    total_cost = sum(float(run.usage["inference_cost_usd"]) for run in runs)
    return {
        "episodes": len(rows),
        "verified_research_success_rate": verified / len(rows),
        "false_alpha_acceptance_rate": (
            sum(item.false_alpha_acceptance for item in verifications) / non_accept
            if non_accept else 0.0
        ),
        "correct_rejection_rate": (
            sum(item.correct_rejection for item in verifications) / expected_reject
            if expected_reject else 0.0
        ),
        "correct_acceptance_rate": (
            sum(item.correct_acceptance for item in verifications) / expected_accept
            if expected_accept else 0.0
        ),
        "abstention_accuracy": (
            sum(item.abstention_accurate for item in verifications) / expected_abstain
            if expected_abstain else 0.0
        ),
        "critical_gate_failure_rate": (
            sum(item.critical_gate_failure for item in verifications) / len(rows)
        ),
        "mean_tool_calls": statistics.fmean(run.usage["tool_calls"] for run in runs),
        "mean_engine_runs": statistics.fmean(run.usage["engine_runs"] for run in runs),
        "mean_cost_usd": total_cost / len(runs),
        "mean_latency_seconds": statistics.fmean(run.usage["wall_seconds"] for run in runs),
        "cost_per_verified_finding_usd": total_cost / verified if verified else None,
        "unnecessary_high_fidelity_promotion_rate": (
            sum(item.unnecessary_high_fidelity_promotion for item in verifications)
            / len(rows)
        ),
        "mean_behavioral_score": statistics.fmean(
            item.behavioral_score for item in verifications
        ),
    }
