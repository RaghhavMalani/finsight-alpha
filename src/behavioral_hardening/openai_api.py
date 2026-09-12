"""Fail-closed $2 OpenAI budget policy for Forge v0.2.5.1."""

from __future__ import annotations

import json
import math
import os
import uuid
from decimal import Decimal
from pathlib import Path

from src.behavioral.openai_api import (
    OpenAIClient,
    SpendLedger,
    append_event,
    frozen_models,
    input_bound,
    ledger_state,
    read_events,
    token_cost,
    verify_api_evidence,
)
from src.behavioral.tool_plane import BudgetExceeded


GLOBAL_CAP = 2.0
MODEL_CAPS = {model.model: GLOBAL_CAP for model in frozen_models()}


class HardeningSpendLedger(SpendLedger):
    """Use the proven append-only ledger with the v0.2.5.1 authorization."""

    def reserve(self, model, amount, request, episode_limit):
        pending, _, costs = ledger_state(self.path)
        if pending:
            raise RuntimeError("unresolved API reservation; inspect checkpoint before resuming")
        amount = Decimal(str(amount))
        if amount <= 0 or not amount.is_finite():
            raise ValueError("invalid reservation")
        if (
            sum(costs.values()) + amount > Decimal(str(GLOBAL_CAP))
            or costs[model] + amount > Decimal(str(MODEL_CAPS[model]))
            or amount > Decimal(str(episode_limit))
        ):
            raise BudgetExceeded("next request cannot fit global, model, or episode allowance")
        call_id = uuid.uuid4().hex
        append_event(self.path, {
            "kind": "reserved",
            "call_id": call_id,
            "model": model,
            "reserved_usd": float(amount),
            "request": request,
        })
        return call_id


class HardeningOpenAIFactory:
    def __init__(self, checkpoint: str | Path, api_key: str | None) -> None:
        self.ledger = HardeningSpendLedger(Path(checkpoint) / "requests.jsonl")
        self.api_key = api_key

    def __call__(self, identity):
        return OpenAIClient(self.ledger, self.api_key)

    def before_tier(self, identity, records, remaining_episodes):
        pending, settled, costs = ledger_state(self.ledger.path)
        if pending:
            raise RuntimeError("unresolved API reservation blocks resume")
        if any(not record["run"]["completed"] for record in records):
            raise RuntimeError("partial episode blocks automatic rerun")
        bound_calls = {
            turn["api_evidence"]["call_id"]
            for record in records
            for turn in record["run"]["model_turns"]
            if "api_evidence" in turn
        }
        if set(settled) != bound_calls:
            raise RuntimeError("orphan paid responses block resume; preserve checkpoint")
        estimates = [
            token_cost(
                identity,
                record["run"]["usage"]["tokens_in"],
                0,
                record["run"]["usage"]["tokens_out"],
            )
            for record in records
        ]
        per_episode = (
            sum(estimates) / len(estimates)
            if estimates
            else token_cost(identity, 15_000, 0, 15_000)
        )
        estimate = per_episode * remaining_episodes
        report = {
            "model": identity.model,
            "remaining_episodes": remaining_episodes,
            "observed_episodes": len(estimates),
            "estimated_tier_cost_usd": estimate,
            "remaining_model_usd": float(
                Decimal(str(MODEL_CAPS[identity.model])) - costs[identity.model]
            ),
            "remaining_global_usd": float(
                Decimal(str(GLOBAL_CAP)) - sum(costs.values())
            ),
            "basis": "observed_mean_uncached" if estimates else "bootstrap_30k_tokens_half_input_half_output",
        }
        self.ledger.path.parent.mkdir(parents=True, exist_ok=True)
        (self.ledger.path.parent / "tier_preflight.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        with (self.ledger.path.parent / "tier_preflights.jsonl").open("ab", buffering=0) as stream:
            stream.write((json.dumps(report, sort_keys=True) + "\n").encode())
            os.fsync(stream.fileno())
        if estimate > min(report["remaining_model_usd"], report["remaining_global_usd"]):
            raise BudgetExceeded("tier estimate cannot fit its authorized allowance")


def verify_hardening_ledger_artifact(artifact, manifest, records):
    errors: list[str] = []
    if (
        manifest.get("models") != [model.to_dict() for model in frozen_models()]
        or manifest.get("authorized_total_cost_usd") != GLOBAL_CAP
    ):
        errors.append("frozen_api_configuration")
    if "requests.jsonl" not in manifest.get("artifacts", {}):
        errors.append("request_ledger_missing")
    ledger = Path(artifact) / "requests.jsonl"
    try:
        pending, settled, costs = ledger_state(ledger)
        if pending:
            errors.append("unresolved_api_reservations")
        bound: list[str] = []
        response_models: dict[str, set[str]] = {}
        for record in records:
            run = record["run"]
            if not run["completed"]:
                errors.append("incomplete_api_episode")
            identity = next(
                model for model in frozen_models()
                if model.identity_hash == run["model_identity_hash"]
            )
            for turn in run["model_turns"]:
                evidence = turn["api_evidence"]
                call_id = evidence["call_id"]
                bound.append(call_id)
                if (
                    settled[call_id]["evidence"] != evidence
                    or settled[call_id]["cost_usd"] != turn["cost_usd"]
                    or not verify_api_evidence(identity, turn)
                ):
                    errors.append("ledger_trajectory_binding")
                response_models.setdefault(identity.model, set()).add(evidence["response_model"])
        if len(bound) != len(set(bound)) or set(bound) != set(settled):
            errors.append("paid_request_coverage")
        if any(len(versions) != 1 for versions in response_models.values()):
            errors.append("response_model_version_drift")
        spent = {model: Decimal(0) for model in MODEL_CAPS}
        reservations = {}
        for event in read_events(ledger):
            model = event["model"]
            if event["kind"] == "reserved":
                amount = Decimal(str(event["reserved_usd"]))
                if reservations or amount <= 0 or not amount.is_finite():
                    errors.append("invalid_reservation_order")
                if (
                    sum(spent.values()) + amount > Decimal(str(GLOBAL_CAP))
                    or spent[model] + amount > Decimal(str(MODEL_CAPS[model]))
                ):
                    errors.append("budget_bypass")
                reservations[event["call_id"]] = event
            else:
                reservation = reservations.pop(event["call_id"])
                evidence = event["evidence"]
                identity = next(item for item in frozen_models() if item.model == model)
                expected = token_cost(
                    identity,
                    input_bound(reservation["request"]["messages"]),
                    0,
                    reservation["request"]["max_completion_tokens"],
                )
                if (
                    expected != reservation["reserved_usd"]
                    or reservation["request"] != evidence["request"]
                    or event["cost_usd"] > expected
                ):
                    errors.append("request_reservation_binding")
                spent[model] += Decimal(str(event["cost_usd"]))
        if reservations:
            errors.append("unresolved_reservation_order")
        if sum(costs.values()) > Decimal(str(GLOBAL_CAP)):
            errors.append("api_spend_cap")
        total = float(sum(costs.values()))
        if not math.isfinite(total) or abs(total - manifest.get("total_cost_usd", -1)) > 1e-9:
            errors.append("ledger_total_cost")
    except (KeyError, TypeError, ValueError, OSError, StopIteration, RuntimeError):
        errors.append("invalid_request_ledger")
    return errors


__all__ = [
    "GLOBAL_CAP", "MODEL_CAPS", "HardeningOpenAIFactory", "HardeningSpendLedger",
    "frozen_models", "verify_hardening_ledger_artifact",
]
