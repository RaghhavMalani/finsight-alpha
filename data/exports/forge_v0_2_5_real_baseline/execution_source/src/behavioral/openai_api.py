"""Fail-closed OpenAI adapter for the authorized $8 real API baseline.

The ledger is written before dispatch. Unknown outcomes retain their full
reservation and block resumption; no request is automatically retried.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import time
import uuid
from decimal import Decimal
from pathlib import Path

import requests

from src.behavioral.agent import ModelTurn
from src.behavioral.contracts import ModelIdentity
from src.behavioral.tool_plane import BudgetExceeded
from src.eval.canonical import canonical_sha256

MODEL_SETTINGS = (
    ("gpt-5.6-luna", "medium", 0.2, 0.02, 1.2, 0.5),
    ("gpt-5.6-terra", "medium", 2.0, 0.2, 12.0, 2.5),
    ("gpt-5.6-sol", "high", 4.0, 0.4, 20.0, 5.0),
)
GLOBAL_CAP = 8.0
MODEL_CAPS = {row[0]: row[5] for row in MODEL_SETTINGS}
ENDPOINT = "https://api.openai.com/v1/chat/completions"


def frozen_models():
    return tuple(ModelIdentity(
        provider="openai", model=model, model_version=model,
        model_kind="live", temperature=None, seed_supported=False,
        reasoning_effort=effort, input_usd_per_million_tokens=inp,
        cached_input_usd_per_million_tokens=cached,
        output_usd_per_million_tokens=out,
    ) for model, effort, inp, cached, out, _ in MODEL_SETTINGS)


def token_cost(identity, inputs, cached, outputs):
    return float((Decimal(inputs - cached) * Decimal(str(identity.input_usd_per_million_tokens))
                  + Decimal(cached) * Decimal(str(identity.cached_input_usd_per_million_tokens))
                  + Decimal(outputs) * Decimal(str(identity.output_usd_per_million_tokens)))
                 / Decimal(1_000_000))


def input_bound(messages):
    # Byte-level text tokenizers cannot emit more text tokens than UTF-8 bytes.
    # Reserve additional framing tokens per message and per request. This adapter
    # permits plain text only, no images, native tools, or long-context pricing.
    return 1024 + sum(len(m["content"].encode("utf-8")) + 128 for m in messages)


def read_events(path):
    if not path.exists():
        return []
    events = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    previous = None
    for event in events:
        payload = {k: v for k, v in event.items() if k != "event_hash"}
        if event["previous_hash"] != previous or canonical_sha256(payload) != event["event_hash"]:
            raise RuntimeError("request ledger hash chain does not verify")
        previous = event["event_hash"]
    return events


def append_event(path, event):
    path.parent.mkdir(parents=True, exist_ok=True)
    events = read_events(path)
    event = dict(event, previous_hash=events[-1]["event_hash"] if events else None)
    event["event_hash"] = canonical_sha256(event)
    data = (json.dumps(event, sort_keys=True, separators=(",", ":")) + "\n").encode()
    with path.open("ab", buffering=0) as stream:
        stream.write(data)
        os.fsync(stream.fileno())
    return event


def ledger_state(path):
    pending, settled = {}, {}
    for event in read_events(path):
        key = event["call_id"]
        if event["kind"] == "reserved":
            if key in pending or key in settled:
                raise RuntimeError("duplicate ledger reservation")
            pending[key] = event
        elif event["kind"] == "settled":
            reservation = pending.pop(key)
            if event["model"] != reservation["model"]:
                raise RuntimeError("ledger model changed")
            settled[key] = event
        else:
            raise RuntimeError("unknown ledger event")
    costs = {model: Decimal(0) for model in MODEL_CAPS}
    for event in [*pending.values(), *settled.values()]:
        amount = event["reserved_usd"] if event["kind"] == "reserved" else event["cost_usd"]
        if not math.isfinite(amount) or amount < 0:
            raise RuntimeError("invalid ledger cost")
        costs[event["model"]] += Decimal(str(amount))
    return pending, settled, costs


class SpendLedger:
    def __init__(self, path):
        self.path = Path(path)

    def reserve(self, model, amount, request, episode_limit):
        pending, _, costs = ledger_state(self.path)
        if pending:
            raise RuntimeError("unresolved API reservation; inspect partial checkpoint before resuming")
        amount = Decimal(str(amount))
        if amount <= 0 or not amount.is_finite():
            raise ValueError("invalid reservation")
        if (sum(costs.values()) + amount > Decimal(str(GLOBAL_CAP))
                or costs[model] + amount > Decimal(str(MODEL_CAPS[model]))
                or amount > Decimal(str(episode_limit))):
            raise BudgetExceeded("next request cannot fit global, model, or episode allowance")
        call_id = uuid.uuid4().hex
        append_event(self.path, dict(kind="reserved", call_id=call_id, model=model,
                                    reserved_usd=float(amount), request=request))
        return call_id

    def settle(self, call_id, model, cost, evidence):
        pending, _, _ = ledger_state(self.path)
        if cost > pending[call_id]["reserved_usd"]:
            raise RuntimeError("provider usage exceeded reservation; retain reservation and stop")
        append_event(self.path, dict(kind="settled", call_id=call_id, model=model,
                                    cost_usd=cost, evidence=evidence))


def parse_usage(raw):
    usage = raw["usage"]
    inputs, outputs = usage["prompt_tokens"], usage["completion_tokens"]
    cached = usage["prompt_tokens_details"]["cached_tokens"]
    reasoning = usage["completion_tokens_details"]["reasoning_tokens"]
    if any(type(v) is not int or v < 0 for v in (inputs, outputs, cached, reasoning)):
        raise ValueError("invalid usage")
    if cached > inputs or reasoning > outputs or usage["total_tokens"] != inputs + outputs:
        raise ValueError("inconsistent usage")
    return inputs, cached, outputs, reasoning


def verify_api_evidence(identity, turn):
    try:
        evidence = turn["api_evidence"]
        raw_text = evidence["raw_response"]
        if hashlib.sha256(raw_text.encode("utf-8")).hexdigest() != evidence["raw_response_sha256"]:
            return False
        raw = json.loads(raw_text)
        inputs, cached, outputs, reasoning = parse_usage(raw)
        cost = token_cost(identity, inputs, cached, outputs)
        request = evidence["request"]
        return (
            evidence["endpoint"] == ENDPOINT
            and request["model"] == identity.model
            and request["reasoning_effort"] == identity.reasoning_effort
            and request["service_tier"] == "default"
            and "seed" not in request and "temperature" not in request
            and request["max_completion_tokens"] <= 4096
            and inputs <= evidence["input_token_bound"] < 272000
            and outputs <= request["max_completion_tokens"]
            and evidence["request_sha256"] == canonical_sha256(request)
            and evidence["raw_usage"] == raw["usage"]
            and evidence["response_model"] == raw["model"]
            and (raw["model"] == identity.model or raw["model"].startswith(identity.model + "-"))
            and evidence["response_id"] == raw["id"]
            and bool(turn["provider_request_id"])
            and turn["provider_request_id"] == evidence["provider_request_id"]
            and turn["tokens_in"] == inputs and turn["tokens_out"] == outputs
            and evidence["cached_input_tokens"] == cached
            and evidence["reasoning_tokens"] == reasoning
            and turn["text"] == (raw["choices"][0]["message"].get("content") or "")
            and abs(turn["cost_usd"] - cost) < 1e-12
            and abs(turn["calculated_cost_usd"] - cost) < 1e-12
            and evidence["cost_basis"] == "token_estimate_not_invoice"
            and evidence["billed_cost_usd"] is None
        )
    except (KeyError, TypeError, ValueError, IndexError, AttributeError):
        return False


class OpenAIClient:
    model_kind = "live"
    enforces_request_budget = True

    def __init__(self, ledger, api_key, transport=None):
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured locally")
        self.ledger = ledger
        self.api_key = api_key
        self.transport = transport or requests.post

    def complete(self, messages, *, identity, seed, max_output_tokens, max_cost_usd,
                 remaining_tokens, remaining_seconds):
        if identity not in frozen_models():
            raise ValueError("model identity differs from authorized OpenAI configuration")
        bound = input_bound(messages)
        output_limit = min(max_output_tokens, remaining_tokens - bound)
        if output_limit <= 0 or bound >= 272000 or remaining_seconds <= 0:
            raise BudgetExceeded("next request cannot fit remaining token/time allowance")
        request = {"model": identity.model, "messages": list(messages),
                   "reasoning_effort": identity.reasoning_effort,
                   "max_completion_tokens": output_limit, "service_tier": "default",
                   "stream": False, "store": False}
        reserved = token_cost(identity, bound, 0, output_limit)
        call_id = self.ledger.reserve(identity.model, reserved, request, max_cost_usd)
        started = time.perf_counter()
        try:
            # Direct HTTP: no SDK retries, redirects, provider fallback, or model seed.
            response = self.transport(ENDPOINT, json=request,
                headers={"Authorization": "Bearer " + self.api_key},
                timeout=max(0.001, min(remaining_seconds, 120)), allow_redirects=False)
            raw_text = response.content.decode("utf-8")
            # Preserve even HTTP errors and malformed responses before parsing.
            raw_path = self.ledger.path.parent / "responses" / (call_id + ".json")
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            with raw_path.open("xb") as stream:
                stream.write(response.content)
                stream.flush()
                os.fsync(stream.fileno())
            if response.status_code != 200:
                raise RuntimeError(f"OpenAI HTTP {response.status_code}; reservation retained, no retry")
            raw = json.loads(raw_text)
            inputs, cached, outputs, reasoning = parse_usage(raw)
            if inputs > bound or outputs > output_limit:
                raise RuntimeError("usage exceeded request bounds")
            model = raw["model"]
            if model != identity.model and not model.startswith(identity.model + "-"):
                raise RuntimeError("response model differs from requested model")
            if raw.get("service_tier", "default") != "default":
                raise RuntimeError("unexpected provider service tier")
            _, previous_responses, _ = ledger_state(self.ledger.path)
            prior_versions = {event["evidence"]["response_model"] for event in previous_responses.values()
                              if event["model"] == identity.model}
            if prior_versions and prior_versions != {model}:
                raise RuntimeError("response model version changed during tier")
            request_id = response.headers.get("x-request-id")
            if not request_id:
                raise RuntimeError("missing provider request ID")
            cost = token_cost(identity, inputs, cached, outputs)
            evidence = dict(call_id=call_id, endpoint=ENDPOINT, request=request,
                request_sha256=canonical_sha256(request), raw_response=raw_text,
                raw_response_sha256=hashlib.sha256(response.content).hexdigest(),
                raw_usage=raw["usage"], response_model=model, response_id=raw["id"],
                provider_request_id=request_id, cached_input_tokens=cached,
                reasoning_tokens=reasoning, input_token_bound=bound, reserved_usd=reserved,
                cost_basis="token_estimate_not_invoice", billed_cost_usd=None,
                seed_semantics="task_world_only")
            self.ledger.settle(call_id, identity.model, cost, evidence)
            content = raw["choices"][0]["message"].get("content") or ""
            return ModelTurn(text=content, tokens_in=inputs, tokens_out=outputs,
                latency_seconds=time.perf_counter() - started, cost_usd=cost,
                provider_request_id=request_id, api_evidence=evidence)
        except Exception as exc:
            # Never include provider text, request headers, or credential values in errors.
            raise RuntimeError(f"API call stopped ({type(exc).__name__}); inspect durable request ledger") from None


class OpenAIFactory:
    def __init__(self, checkpoint, api_key):
        self.ledger = SpendLedger(Path(checkpoint) / "requests.jsonl")
        self.api_key = api_key

    def __call__(self, identity):
        return OpenAIClient(self.ledger, self.api_key)

    def before_tier(self, identity, records, remaining_episodes):
        pending, settled, costs = ledger_state(self.ledger.path)
        if pending:
            raise RuntimeError("unresolved API reservation blocks resume")
        bound_calls = {t["api_evidence"]["call_id"] for r in records
                       for t in r["run"]["model_turns"] if "api_evidence" in t}
        if set(settled) != bound_calls:
            raise RuntimeError("orphan paid responses block resume; preserve checkpoint")
        if any(not r["run"]["completed"] for r in records):
            raise RuntimeError("partial episode blocks automatic rerun")
        if settled:
            report = verify_ledger_artifact(self.ledger.path.parent, {
                "models": [m.to_dict() for m in frozen_models()],
                "authorized_total_cost_usd": GLOBAL_CAP, "artifacts": {"requests.jsonl": "checkpoint"},
                "total_cost_usd": sum(r["run"]["usage"]["inference_cost_usd"] for r in records),
            }, records)
            if report:
                raise RuntimeError("checkpoint ledger does not independently verify: " + ", ".join(report))
        estimates = []
        for record in records:
            run = record["run"]
            # Use undiscounted input and observed output (includes reasoning).
            estimates.append(token_cost(identity, run["usage"]["tokens_in"], 0,
                                        run["usage"]["tokens_out"]))
        # Bootstrap assumption: 30k total tokens split evenly input/output.
        # This is a planning estimate, never a replacement for request reservations.
        per_episode = sum(estimates) / len(estimates) if estimates else token_cost(identity, 15000, 0, 15000)
        estimate = per_episode * remaining_episodes
        report = dict(model=identity.model, remaining_episodes=remaining_episodes,
            observed_episodes=len(estimates), estimated_tier_cost_usd=estimate,
            remaining_model_usd=float(Decimal(str(MODEL_CAPS[identity.model])) - costs[identity.model]),
            remaining_global_usd=float(Decimal(str(GLOBAL_CAP)) - sum(costs.values())),
            basis="observed_mean_uncached" if estimates else "bootstrap_30k_tokens_half_input_half_output")
        self.ledger.path.parent.mkdir(parents=True, exist_ok=True)
        (self.ledger.path.parent / "tier_preflight.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8")
        with (self.ledger.path.parent / "tier_preflights.jsonl").open("ab", buffering=0) as stream:
            stream.write((json.dumps(report, sort_keys=True) + "\n").encode())
            os.fsync(stream.fileno())
        if estimate > min(report["remaining_model_usd"], report["remaining_global_usd"]):
            raise BudgetExceeded("tier estimate cannot fit its authorized allowance")


def verify_ledger_artifact(artifact, manifest, records):
    errors = []
    if manifest["models"] != [m.to_dict() for m in frozen_models()] or manifest["authorized_total_cost_usd"] != GLOBAL_CAP:
        errors.append("frozen_api_configuration")
    if "requests.jsonl" not in manifest["artifacts"]:
        errors.append("request_ledger_missing")
    ledger = artifact / "requests.jsonl"
    pending, settled, costs = ledger_state(ledger)
    if pending:
        errors.append("unresolved_api_reservations")
    bound = []
    response_models = {}
    for record in records:
        run = record["run"]
        if not run["completed"]:
            errors.append("incomplete_api_episode")
        for turn in run["model_turns"]:
            evidence = turn["api_evidence"]
            key = evidence["call_id"]
            bound.append(key)
            if settled[key]["evidence"] != evidence or settled[key]["cost_usd"] != turn["cost_usd"]:
                errors.append("ledger_trajectory_binding")
            model = run["model_identity"]["model"]
            response_models.setdefault(model, set()).add(evidence["response_model"])
    if len(bound) != len(set(bound)) or set(bound) != set(settled):
        errors.append("paid_request_coverage")
    if any(len(versions) != 1 for versions in response_models.values()):
        errors.append("response_model_version_drift")
    # Replay every reservation against prior settled spend, independently.
    spent = {model: Decimal(0) for model in MODEL_CAPS}
    reservations = {}
    for event in read_events(ledger):
        model = event["model"]
        if event["kind"] == "reserved":
            amount = Decimal(str(event["reserved_usd"]))
            if reservations or amount <= 0 or not amount.is_finite():
                errors.append("invalid_reservation_order")
            if sum(spent.values()) + amount > Decimal(str(GLOBAL_CAP)) or spent[model] + amount > Decimal(str(MODEL_CAPS[model])):
                errors.append("budget_bypass")
            reservations[event["call_id"]] = event
        else:
            reservation = reservations.pop(event["call_id"])
            evidence = event["evidence"]
            identity = next(m for m in frozen_models() if m.model == model)
            expected = token_cost(identity, input_bound(reservation["request"]["messages"]), 0,
                                  reservation["request"]["max_completion_tokens"])
            if (expected != reservation["reserved_usd"] or reservation["request"] != evidence["request"]
                    or event["cost_usd"] > expected):
                errors.append("request_reservation_binding")
            spent[model] += Decimal(str(event["cost_usd"]))
    if sum(costs.values()) > Decimal(str(GLOBAL_CAP)) or any(costs[m] > Decimal(str(MODEL_CAPS[m])) for m in costs):
        errors.append("api_spend_cap")
    if abs(float(sum(costs.values())) - manifest["total_cost_usd"]) > 1e-9:
        errors.append("ledger_total_cost")
    return errors
