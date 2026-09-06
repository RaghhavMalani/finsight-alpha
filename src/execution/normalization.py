"""Strict host-owned normalization and accounting boundary for worker JSON."""

from __future__ import annotations

import math
from typing import Any, Mapping

from src.execution.contracts import ContractError, EngineDescriptor, MeasurementState, SimulationOutcome, SimulationRequest
from src.execution.failures import FailureCode
from src.execution.invariants import verify_execution_invariants


def normalize_worker_outcome(
    payload: Mapping[str, Any], *,
    descriptor: EngineDescriptor,
    request: SimulationRequest,
    expected_fingerprint_hash: str | None = None,
) -> SimulationOutcome:
    try:
        outcome = SimulationOutcome.from_dict(payload)
    except ContractError:
        raise
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise ContractError(str(exc), getattr(exc, "code", FailureCode.SCHEMA_INVALID)) from exc
    if outcome.engine_id != descriptor.engine_id or outcome.request_hash != request.request_hash:
        raise ContractError("worker outcome is not bound to the adapter and request", FailureCode.REPLAY_MISMATCH)
    if outcome.result is None:
        return outcome
    result = outcome.result
    if set(request.required_capabilities) - set(descriptor.capabilities):
        raise ContractError("engine claims an unsupported capability", FailureCode.CAPABILITY_FALSE_CLAIM)
    if result.provenance.engine_id != descriptor.engine_id:
        raise ContractError("worker provenance engine mismatch", FailureCode.ENGINE_DRIFT)
    if result.provenance.license_spdx != descriptor.license_spdx:
        raise ContractError("worker provenance license mismatch", FailureCode.ENGINE_DRIFT)
    if expected_fingerprint_hash is not None and result.engine_fingerprint_hash != expected_fingerprint_hash:
        raise ContractError("worker engine fingerprint drifted from the pinned identity", FailureCode.ENGINE_DRIFT)
    if (
        result.request_hash != request.request_hash
        or result.world_hash != request.world_hash
        or result.strategy_hash != request.strategy_hash
        or result.dataset_hash != request.dataset_hash
        or result.assumptions_hash != request.execution.assumptions_hash
        or result.seed != request.seed
    ):
        raise ContractError("worker result is not content-bound to the request", FailureCode.REPLAY_MISMATCH)
    if "initial_cash" in request.inputs and result.account.initial_cash != request.inputs["initial_cash"]:
        raise ContractError("worker initial cash disagrees with the input tape", FailureCode.ACCOUNTING_MISMATCH)
    if "orders" in request.inputs and [order.to_dict() for order in result.orders] != request.inputs["orders"]:
        raise ContractError("worker order intents disagree with the input tape", FailureCode.FILL_IMPOSSIBLE)
    for check in verify_execution_invariants(result):
        if not check.passed:
            raise ContractError(f"{check.code}: {check.message}", check.failure_code)
    fees = result.metrics["fees"]
    if fees.state is MeasurementState.MEASURED:
        if type(fees.value) not in {int, float} or not math.isclose(float(fees.value), sum(fill.fee for fill in result.fills), rel_tol=1e-9, abs_tol=1e-9):
            raise ContractError("worker fee metric disagrees with canonical fills", FailureCode.ACCOUNTING_MISMATCH)
    return outcome
