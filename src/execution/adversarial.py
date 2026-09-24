"""Executable host mutation certification; no worker-supplied certification flags.

The synthetic positive control tests only shared production guards. Real engine
semantic observations, when supplied, are mutated and graded independently too.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
import sys
from typing import Any, Mapping, Sequence

from src.eval.canonical import canonical_sha256
from src.execution.contracts import (
    CANONICAL_METRICS, AccountState, CanonicalFill, CanonicalOrder, ContractError,
    EngineDescriptor, EngineProvenance, EpistemicValue, ExecutionAssumptions,
    MeasurementState, SimulationMode, SimulationOutcome, SimulationRequest,
    SimulationResult,
)
from src.execution.engines import WorkerEngine
from src.execution.events import CanonicalEventType, CanonicalExecutionEvent, NativeEngineEvent
from src.execution.failures import FailureCode
from src.execution.fingerprints import EngineFingerprint
from src.execution.normalization import normalize_worker_outcome

MUTATION_EXPECTATIONS = {
    "engine_version_changes": "ENGINE_DRIFT",
    "dependency_lock_mutation": "ENGINE_DRIFT",
    "adapter_source_mutation": "ENGINE_DRIFT",
    "input_tape_mutation": "REPLAY_MISMATCH",
    "native_output_mutation": "REPLAY_MISMATCH",
    "canonical_output_mutation": "REPLAY_MISMATCH",
    "request_hash_mismatch": "REPLAY_MISMATCH",
    "nested_request_hash_mismatch": "REPLAY_MISMATCH",
    "replay_hash_mismatch": "REPLAY_MISMATCH",
    "negative_fill_quantity": "FILL_IMPOSSIBLE",
    "fill_before_order": "TIMESTAMP_CAUSALITY_FAILURE",
    "fill_after_valid_prior_cancellation": "TIMESTAMP_CAUSALITY_FAILURE",
    "fill_above_requested_quantity": "FILL_IMPOSSIBLE",
    "duplicate_fill_ids": "FILL_IMPOSSIBLE",
    "non_monotonic_timestamps": "TIMESTAMP_CAUSALITY_FAILURE",
    "impossible_cash_balance": "ACCOUNTING_MISMATCH",
    "incorrect_fee_sign": "ACCOUNTING_MISMATCH",
    "position_mismatch": "ACCOUNTING_MISMATCH",
    "nan_metrics": "SCHEMA_INVALID",
    "infinite_metrics": "SCHEMA_INVALID",
    "unknown_enum_values": "SCHEMA_INVALID",
    "missing_provenance": "PROVENANCE_MISSING",
    "oversized_stdout": "WORKER_RESOURCE_FAILURE",
    "oversized_stderr": "WORKER_RESOURCE_FAILURE",
    "malformed_json": "SCHEMA_INVALID",
    "worker_timeout": "WORKER_RESOURCE_FAILURE",
    "worker_crash": "WORKER_RESOURCE_FAILURE",
    "zero_exit_invalid_schema": "SCHEMA_INVALID",
    "engine_claims_unsupported_capability": "CAPABILITY_FALSE_CLAIM",
}


def conformance_fixture(fingerprint: EngineFingerprint) -> tuple[EngineDescriptor, SimulationRequest, SimulationOutcome]:
    """A Forge positive control; never evidence of external engine semantics."""
    descriptor = EngineDescriptor(
        engine_id=fingerprint.engine, role="host boundary mutation fixture",
        capabilities=("tick_data",), license_spdx="LicenseRef-HostFixture",
        license_note="Forge-owned synthetic boundary fixture",
        source_url="https://example.invalid/host-boundary-fixture", install_extra="none",
    )
    order = CanonicalOrder("o1", "TEST", "BUY", "LIMIT", 2.0, 5, 10, 101.0)
    inputs = {"initial_cash": 10000.0, "orders": [order.to_dict()],
              "market_events": [{"symbol": "TEST", "event_ns": 20, "ask": 100.0},
                                {"symbol": "TEST", "event_ns": 30, "ask": 100.0}]}
    request = SimulationRequest(
        world_hash=canonical_sha256("stress-world"), strategy_hash=canonical_sha256("stress-strategy"),
        dataset_hash=canonical_sha256(inputs), core_lock_hash=fingerprint.dependency_lock_hash,
        start="2026-01-01T00:00:00Z", end="2026-01-02T00:00:00Z", seed=42,
        mode=SimulationMode.BACKTEST, scenario_id="host-boundary-positive-control",
        required_capabilities=("tick_data",), execution=ExecutionAssumptions(), inputs=inputs,
    )
    absent = EpistemicValue.absent(MeasurementState.NOT_MEASURED, "not needed by boundary fixture")
    fills = tuple(CanonicalFill(f"f{i}", "o1", "TEST", "BUY", 1.0, 100.0, 0.1, ns, absent, absent, absent)
                  for i, ns in enumerate((20, 30), 1))
    native = [NativeEngineEvent(fingerprint.engine, "fixture.fill", fill.event_ns, fill.to_dict(), canonical_sha256(inputs["market_events"][i]))
              for i, fill in enumerate(fills)]
    canonical = [CanonicalExecutionEvent(f"e{i}", CanonicalEventType.PARTIAL_FILL, fill.event_ns, native[i].native_event_hash,
                                         native[i].input_market_event_hash, "o1", fill.fill_id, fill.quantity, fill.price)
                 for i, fill in enumerate(fills)]
    native.append(NativeEngineEvent(fingerprint.engine, "fixture.cancel", 40, {"order_id": "o1"}, native[-1].input_market_event_hash))
    canonical.append(CanonicalExecutionEvent("cancel", CanonicalEventType.ORDER_CANCELED, 40, native[-1].native_event_hash,
                                             native[-1].input_market_event_hash, order_id="o1"))
    absence_states = {state.value: state for state in MeasurementState if state is not MeasurementState.MEASURED}
    rust = (EpistemicValue.absent(absence_states[fingerprint.rust_version], "fixture runtime")
            if fingerprint.rust_version in absence_states else EpistemicValue.measured(fingerprint.rust_version, "version"))
    provenance = EngineProvenance(
        engine_id=fingerprint.engine, engine_version=fingerprint.engine_version,
        engine_commit=fingerprint.upstream_commit, adapter_version=fingerprint.adapter_version,
        runtime="host boundary fixture", rust_version=rust,
        dependency_lock_hash=fingerprint.dependency_lock_hash, worker_hash=fingerprint.worker_image_hash,
        license_spdx=descriptor.license_spdx, python_version=fingerprint.python_version, platform=fingerprint.platform,
    )
    metrics = {name: absent for name in CANONICAL_METRICS}
    metrics["fees"] = EpistemicValue.measured(0.2, "currency")
    result = SimulationResult(
        provenance, request.request_hash, request.world_hash, request.strategy_hash,
        request.dataset_hash, request.execution.assumptions_hash, request.seed, (order,), fills,
        AccountState(10000.0, 9799.8, {"TEST": 2.0}), metrics, 0.0, tuple(native), tuple(canonical),
    )
    return descriptor, request, SimulationOutcome(fingerprint.engine, request.request_hash, MeasurementState.MEASURED, result)


def reseal_result(result: dict[str, Any]) -> None:
    """Recompute outer hashes to force semantic attacks beyond integrity checks."""
    payload = {key: value for key, value in result.items() if key not in {"result_hash", "replay_hash"}}
    result["result_hash"] = canonical_sha256(payload)
    result["replay_hash"] = canonical_sha256({key: value for key, value in payload.items() if key != "runtime_ms"})


def _evidence(mutation: str, expected: str, detected: Sequence[str], detail: str, *, scope: str = "host_boundary") -> dict[str, Any]:
    row = {"mutation": mutation, "expected_code": expected, "detected_codes": sorted(set(detected)),
           "passed": expected in detected, "detail": detail, "scope": scope}
    return dict(row, evidence_hash=canonical_sha256(row))


WORKER_ATTACKS = {
    "oversized_stdout": "import sys; sys.stdout.buffer.write(b'x' * 65536); sys.stdout.flush()",
    "oversized_stderr": "import sys; sys.stderr.buffer.write(b'x' * 65536); sys.stderr.flush()",
    "malformed_json": "print('{broken json')",
    "worker_timeout": "import time; time.sleep(30)",
    "worker_crash": "import sys; sys.exit(17)",
    "zero_exit_invalid_schema": "print('{}')",
}


def run_adversarial_suite(
    fingerprint: EngineFingerprint, *,
    semantic_results: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Execute production guard mutations and optionally actual C1 record attacks."""
    descriptor, request, baseline = conformance_fixture(fingerprint)
    normalize_worker_outcome(baseline.to_dict(), descriptor=descriptor, request=request,
                             expected_fingerprint_hash=fingerprint.fingerprint_hash)
    cases = []
    for mutation, expected in MUTATION_EXPECTATIONS.items():
        if mutation in WORKER_ATTACKS:
            engine = WorkerEngine(descriptor, (sys.executable, "-I", "-c", WORKER_ATTACKS[mutation]),
                                  timeout_seconds=0.25 if mutation == "worker_timeout" else 5.0, max_output_bytes=4096)
            outcome = engine.run(request)
            detail = outcome.reason or "worker accepted the mutation"
            codes = [detail.split(":", 1)[0]] if outcome.state is MeasurementState.ERROR else []
            cases.append(_evidence(mutation, expected, codes, detail))
            continue
        payload = deepcopy(baseline.to_dict())
        result = payload["result"]
        mutated_request, mutated_descriptor, reseal = request, descriptor, True
        try:
            if mutation in {"engine_version_changes", "dependency_lock_mutation", "adapter_source_mutation"}:
                changes = {"engine_version_changes": {"engine_version": "mutated-version"},
                           "dependency_lock_mutation": {"dependency_lock_hash": canonical_sha256("mutated-lock")},
                           "adapter_source_mutation": {"worker_hash": canonical_sha256("mutated-adapter-source")}}[mutation]
                provenance = replace(baseline.result.provenance, **changes)
                result["provenance"], result["engine_fingerprint_hash"] = provenance.to_dict(), provenance.fingerprint_hash
            elif mutation == "input_tape_mutation":
                raw_request = deepcopy(request.to_dict())
                raw_request["inputs"]["market_events"][0]["ask"] = 777.0
                mutated_request = SimulationRequest.from_dict(raw_request)
            elif mutation == "native_output_mutation":
                result["native_events"][0]["payload"]["price"] += 1
                reseal = False
            elif mutation == "canonical_output_mutation":
                result["canonical_events"][0]["price"] += 1
                reseal = False
            elif mutation == "request_hash_mismatch":
                payload["request_hash"] = canonical_sha256("wrong-request")
            elif mutation == "nested_request_hash_mismatch":
                result["request_hash"] = canonical_sha256("wrong-request")
            elif mutation == "replay_hash_mismatch":
                result["replay_hash"] = canonical_sha256("wrong-replay")
                reseal = False
            elif mutation == "negative_fill_quantity":
                result["fills"][0]["quantity"] = -1
            elif mutation == "fill_before_order":
                result["fills"][0]["event_ns"] = 9
            elif mutation == "fill_after_valid_prior_cancellation":
                cancellation = result["canonical_events"][-1]
                cancellation["event_ns"] = 15
                source = result["native_events"][-1]
                source["event_ns"] = 15
                source["native_event_hash"] = canonical_sha256({key: value for key, value in source.items() if key != "native_event_hash"})
                cancellation["native_event_hash"] = source["native_event_hash"]
                result["canonical_events"].sort(key=lambda event: event["event_ns"])
                result["native_events"].sort(key=lambda event: event["event_ns"])
            elif mutation == "fill_above_requested_quantity":
                result["fills"][0]["quantity"] = 3.0
            elif mutation == "duplicate_fill_ids":
                result["fills"][1]["fill_id"] = result["fills"][0]["fill_id"]
            elif mutation == "non_monotonic_timestamps":
                result["fills"].reverse()
            elif mutation == "impossible_cash_balance":
                result["account"]["ending_cash"] += 1234
            elif mutation == "incorrect_fee_sign":
                result["fills"][0]["fee"] = -0.1
            elif mutation == "position_mismatch":
                result["account"]["positions"]["TEST"] = 3.0
            elif mutation in {"nan_metrics", "infinite_metrics"}:
                result["metrics"]["fees"]["value"] = float("nan" if mutation == "nan_metrics" else "inf")
                reseal = False
            elif mutation == "unknown_enum_values":
                result["fills"][0]["side"] = "ROTATE"
            elif mutation == "missing_provenance":
                del result["provenance"]
                reseal = False
            elif mutation == "engine_claims_unsupported_capability":
                mutated_descriptor = replace(descriptor, capabilities=())
            if reseal:
                reseal_result(result)
            normalize_worker_outcome(payload, descriptor=mutated_descriptor, request=mutated_request,
                                     expected_fingerprint_hash=fingerprint.fingerprint_hash)
            cases.append(_evidence(mutation, expected, [], "production guard accepted the mutation"))
        except (ContractError, ValueError, KeyError, TypeError) as exc:
            code = getattr(exc, "code", FailureCode.SCHEMA_INVALID)
            cases.append(_evidence(mutation, expected, [code.value], str(exc)))
    semantic = run_semantic_mutations(fingerprint.engine, semantic_results) if semantic_results is not None else None
    report = {
        "schema_version": "forge-adversarial/0.2.4",
        "scope": "shared production host boundary; synthetic positive control",
        "engine_fingerprint_hash": fingerprint.fingerprint_hash,
        "positive_control_hash": baseline.result.result_hash,
        "required_mutations": list(MUTATION_EXPECTATIONS), "cases": cases,
        "semantic_mutations": semantic,
        "complete": len(cases) == len(MUTATION_EXPECTATIONS) and all(case["passed"] for case in cases)
                    and (semantic is None or semantic["complete"]),
    }
    return dict(report, report_hash=canonical_sha256(report))


def run_semantic_mutations(engine: str, observations: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Attack actual engine records through the same independent C1 evaluator."""
    from src.execution.semantic_tapes import SEMANTIC_TAPES, evaluate_semantic_result

    by_id = {item["tape_id"]: item for item in observations}
    candidates = [(tape, by_id[tape.tape_id]) for tape in SEMANTIC_TAPES
                  if tape.tape_id in by_id and by_id[tape.tape_id].get("state") == "SUPPORTED"
                  and by_id[tape.tape_id].get("fills")]
    cases = []
    baseline_failures = []
    valid_candidates = []
    for tape, observation in candidates:
        errors = evaluate_semantic_result(tape, observation, engine=engine)
        if errors:
            baseline_failures.append({"tape_id": tape.tape_id, "failure_codes": errors,
                                      "state": "INVALID_POSITIVE_CONTROL"})
        else:
            valid_candidates.append((tape, observation))
    candidates = valid_candidates
    if not candidates:
        report = {"schema_version": "forge-semantic-adversarial/0.2.4", "engine": engine,
                  "source_observations_hash": canonical_sha256(list(observations)),
                  "complete": False, "cases": [], "baseline_failures": baseline_failures,
                  "state": "UNAVAILABLE", "reason": "no valid real engine fill observation available"}
        return dict(report, report_hash=canonical_sha256(report))
    tape, original = candidates[0]
    attacks = {
        "negative_fill_quantity": ("FILL_IMPOSSIBLE", lambda raw: raw["fills"][0].update(quantity=-1)),
        "fill_before_order": ("TIMESTAMP_CAUSALITY_FAILURE", lambda raw: raw["fills"][0].update(event_ns=0)),
        "fill_above_requested_quantity": ("FILL_IMPOSSIBLE", lambda raw: raw["fills"][0].update(quantity=1e9)),
        "duplicate_fill_ids": ("FILL_IMPOSSIBLE", lambda raw: raw["fills"].append(deepcopy(raw["fills"][0]))),
        "impossible_cash_balance": ("ACCOUNTING_MISMATCH", lambda raw: raw["account"].update(ending_cash=1e9)),
        "incorrect_fee_sign": ("ACCOUNTING_MISMATCH", lambda raw: raw["fills"][0].update(fee=-1)),
        "position_mismatch": ("ACCOUNTING_MISMATCH", lambda raw: raw["account"].update(position=1e9)),
        "nan_metrics": ("SCHEMA_INVALID", lambda raw: raw["account"].update(equity=float("nan"))),
        "infinite_metrics": ("SCHEMA_INVALID", lambda raw: raw["account"].update(equity=float("inf"))),
        "unknown_enum_values": ("SCHEMA_INVALID", lambda raw: raw.update(state="CERTIFIED")),
        "missing_provenance": ("PROVENANCE_MISSING", lambda raw: raw.pop("native_evidence")),
        "input_tape_mutation": ("REPLAY_MISMATCH", lambda raw: raw.update(tape_hash=canonical_sha256("mutated"))),
        "false_unsupported_claim": ("CAPABILITY_FALSE_CLAIM", lambda raw: (raw.clear(), raw.update(tape_id=tape.tape_id, tape_hash=tape.tape_hash, state="UNSUPPORTED", reason="avoiding mandatory coverage"))),
    }
    for mutation, (expected, mutate) in attacks.items():
        raw = deepcopy(original)
        mutate(raw)
        codes = evaluate_semantic_result(tape, raw, engine=engine)
        cases.append(_evidence(mutation, expected, codes, f"real {engine} {tape.tape_id} observation", scope="real_semantic_observation"))
    multiple = next(((t, raw) for t, raw in candidates if len(raw["fills"]) > 1 and raw["fills"][0]["event_ns"] < raw["fills"][-1]["event_ns"]), None)
    if multiple:
        multi_tape, raw = multiple
        raw = deepcopy(raw)
        raw["fills"].reverse()
        codes = evaluate_semantic_result(multi_tape, raw, engine=engine)
        cases.append(_evidence("non_monotonic_timestamps", "TIMESTAMP_CAUSALITY_FAILURE", codes, f"real {engine} {multi_tape.tape_id} observation", scope="real_semantic_observation"))
    else:
        evidence = _evidence("non_monotonic_timestamps", "TIMESTAMP_CAUSALITY_FAILURE", [], "UNAVAILABLE: missing valid real multi-fill observation", scope="real_semantic_observation")
        cases.append(evidence)
    # A genuine fill is retained and its tape canceled before that execution.
    # Grading uses the changed host tape, including its recomputed identity.
    cancel_order = dict(tape.orders[0])
    cancel_order["cancel_ns"] = cancel_order["submitted_ns"]
    cancel_tape = replace(tape, orders=(cancel_order,) + tape.orders[1:])
    raw = deepcopy(original)
    raw["tape_hash"] = cancel_tape.tape_hash
    raw["fills"][0]["event_ns"] = max(raw["fills"][0]["event_ns"], cancel_order["cancel_ns"] + tape.latency_ns + 1)
    codes = evaluate_semantic_result(cancel_tape, raw, engine=engine)
    cases.append(_evidence("fill_after_valid_prior_cancellation", "TIMESTAMP_CAUSALITY_FAILURE", codes, f"real {engine} fill after host cancellation", scope="real_semantic_observation"))
    report = {"schema_version": "forge-semantic-adversarial/0.2.4", "engine": engine,
              "source_observations_hash": canonical_sha256(list(observations)), "cases": cases,
              "baseline_failures": baseline_failures,
              "complete": not baseline_failures and all(case["passed"] for case in cases)}
    return dict(report, report_hash=canonical_sha256(report))
