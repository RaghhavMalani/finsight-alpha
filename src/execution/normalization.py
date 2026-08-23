"""Strict normalization entrypoint for worker-owned JSON."""

from __future__ import annotations

from typing import Any, Mapping

from src.execution.contracts import ContractError, EngineDescriptor, SimulationOutcome, SimulationRequest


def normalize_worker_outcome(
    payload: Mapping[str, Any],
    *,
    descriptor: EngineDescriptor,
    request: SimulationRequest,
) -> SimulationOutcome:
    outcome = SimulationOutcome.from_dict(payload)
    if outcome.engine_id != descriptor.engine_id or outcome.request_hash != request.request_hash:
        raise ContractError("worker outcome is not bound to the adapter and request")
    if outcome.result is not None:
        result = outcome.result
        if result.provenance.engine_id != descriptor.engine_id:
            raise ContractError("worker provenance engine mismatch")
        if result.provenance.license_spdx != descriptor.license_spdx:
            raise ContractError("worker provenance license mismatch")
        if (
            result.world_hash != request.world_hash
            or result.strategy_hash != request.strategy_hash
            or result.dataset_hash != request.dataset_hash
            or result.assumptions_hash != request.execution.assumptions_hash
            or result.seed != request.seed
        ):
            raise ContractError("worker result is not content-bound to the request")
    return outcome
