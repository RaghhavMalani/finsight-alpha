"""Host-side adapters for untrusted simulation workers."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Mapping, Sequence

from src.eval.canonical import canonical_json_bytes, canonical_sha256
from src.execution.contracts import (
    ContractError,
    EngineDescriptor,
    MeasurementState,
    SimulationOutcome,
    SimulationRequest,
)


RPC_VERSION = "forge-sim-rpc/1"


class WorkerEngine:
    """Strict JSON/stdin adapter. It never imports the external engine package."""

    def __init__(
        self,
        descriptor: EngineDescriptor,
        command: Sequence[str] | None,
        *,
        timeout_seconds: float = 60.0,
        max_output_bytes: int = 8_000_000,
        cwd: str | Path | None = None,
    ) -> None:
        self._descriptor = descriptor
        self._command = tuple(command or ())
        if any(not isinstance(item, str) or not item for item in self._command):
            raise ValueError("worker command must contain non-empty strings")
        if timeout_seconds <= 0 or max_output_bytes <= 0:
            raise ValueError("worker limits must be positive")
        self.timeout_seconds = float(timeout_seconds)
        self.max_output_bytes = int(max_output_bytes)
        self.cwd = str(cwd) if cwd is not None else None
        self._requests: dict[str, SimulationRequest] = {}
        self._replay_hashes: dict[str, str] = {}

    @property
    def descriptor(self) -> EngineDescriptor:
        return self._descriptor

    @property
    def configured(self) -> bool:
        return bool(self._command)

    def run(self, request: SimulationRequest) -> SimulationOutcome:
        if not isinstance(request, SimulationRequest):
            raise TypeError("request must be a SimulationRequest")
        missing = set(request.required_capabilities) - set(self.descriptor.capabilities)
        if missing:
            return SimulationOutcome(
                self.descriptor.engine_id,
                request.request_hash,
                MeasurementState.UNSUPPORTED,
                reason=f"engine lacks required capabilities: {sorted(missing)}",
            )
        if not self._command:
            return SimulationOutcome(
                self.descriptor.engine_id,
                request.request_hash,
                MeasurementState.UNAVAILABLE,
                reason=(
                    f"{self.descriptor.engine_id} worker is not configured; provide its "
                    "separately locked worker command"
                ),
            )
        envelope = {
            "protocol_version": RPC_VERSION,
            "method": "simulate",
            "engine_id": self.descriptor.engine_id,
            "request_hash": request.request_hash,
            "request": request.to_dict(),
        }
        safe_env = {
            key: value
            for key, value in os.environ.items()
            if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "PYTHONPATH"}
        }
        safe_env["PYTHONUTF8"] = "1"
        safe_env["PYTHONHASHSEED"] = str(request.seed)
        try:
            completed = subprocess.run(
                self._command,
                input=canonical_json_bytes(envelope),
                capture_output=True,
                shell=False,
                timeout=self.timeout_seconds,
                cwd=self.cwd,
                env=safe_env,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return SimulationOutcome(
                self.descriptor.engine_id,
                request.request_hash,
                MeasurementState.ERROR,
                reason=f"worker launch failed: {type(exc).__name__}: {exc}",
            )
        if len(completed.stdout) > self.max_output_bytes:
            return SimulationOutcome(
                self.descriptor.engine_id,
                request.request_hash,
                MeasurementState.ERROR,
                reason="worker response exceeded the configured byte limit",
            )
        if completed.returncode != 0:
            stderr = completed.stderr[:1000].decode("utf-8", errors="replace").strip()
            return SimulationOutcome(
                self.descriptor.engine_id,
                request.request_hash,
                MeasurementState.ERROR,
                reason=f"worker exited {completed.returncode}: {stderr or 'no diagnostic'}",
            )
        try:
            response = json.loads(completed.stdout.decode("utf-8"))
            if set(response) != {"protocol_version", "outcome"}:
                raise ContractError("RPC response fields are not canonical")
            if response["protocol_version"] != RPC_VERSION:
                raise ContractError("RPC protocol version mismatch")
            outcome = SimulationOutcome.from_dict(response["outcome"])
            self._validate_binding(outcome, request)
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ContractError, ValueError) as exc:
            return SimulationOutcome(
                self.descriptor.engine_id,
                request.request_hash,
                MeasurementState.ERROR,
                reason=f"invalid worker response: {type(exc).__name__}: {exc}",
            )
        if outcome.state is MeasurementState.MEASURED:
            assert outcome.result is not None
            self._requests[outcome.result.result_hash] = request
            self._replay_hashes[outcome.result.result_hash] = outcome.result.replay_hash
        return outcome

    def replay(self, run_id: str) -> SimulationOutcome:
        request = self._requests.get(run_id)
        if request is None:
            raise KeyError(f"unknown simulation run {run_id!r}")
        expected = self._replay_hashes[run_id]
        outcome = self.run(request)
        if outcome.state is MeasurementState.MEASURED:
            assert outcome.result is not None
            if outcome.result.replay_hash != expected:
                return SimulationOutcome(
                    self.descriptor.engine_id,
                    request.request_hash,
                    MeasurementState.ERROR,
                    reason="worker replay hash diverged from the original run",
                )
        return outcome

    def _validate_binding(self, outcome: SimulationOutcome, request: SimulationRequest) -> None:
        if outcome.engine_id != self.descriptor.engine_id:
            raise ContractError("worker engine_id does not match configured adapter")
        if outcome.request_hash != request.request_hash:
            raise ContractError("worker outcome is bound to a different request")
        if outcome.result is None:
            return
        result = outcome.result
        if result.provenance.engine_id != self.descriptor.engine_id:
            raise ContractError("result provenance engine_id mismatch")
        if result.provenance.license_spdx != self.descriptor.license_spdx:
            raise ContractError("worker license metadata mismatch")
        for name in ("world_hash", "strategy_hash", "dataset_hash", "seed"):
            if getattr(result, name) != getattr(request, name):
                raise ContractError(f"result {name} is not bound to the request")
        if result.assumptions_hash != request.execution.assumptions_hash:
            raise ContractError("result assumptions_hash mismatch")


def worker_command_hash(command: Sequence[str]) -> str:
    return canonical_sha256(list(command))


class EngineRegistry:
    def __init__(self, engines: Sequence[WorkerEngine] = ()) -> None:
        self._engines = {engine.descriptor.engine_id: engine for engine in engines}
        if len(self._engines) != len(engines):
            raise ValueError("engine IDs must be unique")

    @property
    def engine_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._engines))

    def get(self, engine_id: str) -> WorkerEngine:
        try:
            return self._engines[engine_id]
        except KeyError as exc:
            raise KeyError(f"unknown simulation engine {engine_id!r}") from exc

    def describe(self) -> tuple[dict[str, object], ...]:
        return tuple(
            {
                **self._engines[engine_id].descriptor.to_dict(),
                "availability": (
                    MeasurementState.MEASURED.value
                    if self._engines[engine_id].configured
                    else MeasurementState.UNAVAILABLE.value
                ),
            }
            for engine_id in self.engine_ids
        )


def _descriptor(
    engine_id: str,
    role: str,
    capabilities: tuple[str, ...],
    license_spdx: str,
    license_note: str,
    source_url: str,
) -> EngineDescriptor:
    return EngineDescriptor(
        engine_id=engine_id,
        role=role,
        capabilities=capabilities,
        license_spdx=license_spdx,
        license_note=license_note,
        source_url=source_url,
        install_extra=f"execution-{engine_id}",
    )


ENGINE_DESCRIPTORS = {
    "vectorbt": _descriptor(
        "vectorbt", "fast parameter and hypothesis screening",
        ("vectorized", "parameter_sweep", "walk_forward", "portfolio_screening"),
        "Apache-2.0 WITH Commons-Clause",
        "Optional only; Commons Clause requires a commercialization review.",
        "https://github.com/polakowo/vectorbt",
    ),
    "nautilus": _descriptor(
        "nautilus", "deterministic event-driven backtest and paper execution",
        ("event_driven", "order_book", "tick_data", "multi_asset", "multi_venue", "paper_execution"),
        "LGPL-3.0-only",
        "Keep a replaceable worker/library boundary and preserve LGPL obligations.",
        "https://github.com/nautechsystems/nautilus_trader",
    ),
    "hftbacktest": _descriptor(
        "hftbacktest", "latency, queue, L2/L3, and fill realism",
        ("tick_data", "latency", "queue", "l2", "l3", "partial_fills", "multi_asset"),
        "MIT",
        "Optional isolated worker; retain the upstream copyright and license notice.",
        "https://github.com/nkaz001/hftbacktest",
    ),
    "legacy-hft": _descriptor(
        "legacy-hft", "independent legacy differential reference",
        ("tick_data", "execution_delay", "order_book", "differential_reference"),
        "Apache-2.0",
        "Legacy May-2020-era reference only, not a production-equivalent engine.",
        "https://github.com/evgerher/hft-backtesting",
    ),
}


def default_registry(commands: Mapping[str, Sequence[str]] | None = None, *, cwd: str | Path | None = None) -> EngineRegistry:
    configured = commands or {}
    unknown = set(configured) - set(ENGINE_DESCRIPTORS)
    if unknown:
        raise ValueError(f"commands supplied for unknown engines: {sorted(unknown)}")
    return EngineRegistry(
        tuple(
            WorkerEngine(descriptor, configured.get(engine_id), cwd=cwd)
            for engine_id, descriptor in ENGINE_DESCRIPTORS.items()
        )
    )
