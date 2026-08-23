"""Worker-env loader for engine-specific backends installed outside Forge core."""

from __future__ import annotations

import importlib
import importlib.metadata
from dataclasses import dataclass

from src.execution.contracts import MeasurementState, SimulationOutcome, SimulationRequest


@dataclass(frozen=True)
class ExternalWorkerSpec:
    engine_id: str
    distribution: str
    backend_module: str


def execute_external(spec: ExternalWorkerSpec, request: SimulationRequest) -> SimulationOutcome:
    try:
        importlib.metadata.version(spec.distribution)
    except importlib.metadata.PackageNotFoundError:
        return SimulationOutcome(
            spec.engine_id, request.request_hash, MeasurementState.UNAVAILABLE,
            reason=f"{spec.distribution} is not installed in this isolated worker environment",
        )
    try:
        backend = importlib.import_module(spec.backend_module)
    except ModuleNotFoundError:
        return SimulationOutcome(
            spec.engine_id, request.request_hash, MeasurementState.UNSUPPORTED,
            reason=(
                f"engine is installed but canonical backend {spec.backend_module!r} is absent; "
                "Forge does not guess engine-specific strategy or data semantics"
            ),
        )
    run = getattr(backend, "run", None)
    if not callable(run):
        return SimulationOutcome(
            spec.engine_id, request.request_hash, MeasurementState.UNSUPPORTED,
            reason=f"canonical backend {spec.backend_module!r} does not expose run(request)",
        )
    outcome = run(request)
    if not isinstance(outcome, SimulationOutcome):
        raise TypeError("external backend must return canonical SimulationOutcome")
    return outcome
