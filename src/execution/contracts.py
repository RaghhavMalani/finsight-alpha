"""Canonical, engine-neutral contracts for Forge execution simulation."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Mapping, Protocol

from src.eval.canonical import canonical_sha256


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REVISION_RE = re.compile(r"^[0-9a-f]{7,64}$")
CANONICAL_METRICS = (
    "pnl",
    "turnover",
    "fees",
    "slippage",
    "max_drawdown",
    "fill_rate",
    "queue_position",
    "latency_ms",
    "sharpe",
)


class ContractError(ValueError):
    """Raised when an engine attempts to cross the canonical boundary incorrectly."""


class MeasurementState(str, Enum):
    MEASURED = "MEASURED"
    UNAVAILABLE = "UNAVAILABLE"
    UNSUPPORTED = "UNSUPPORTED"
    NOT_MEASURED = "NOT_MEASURED"
    ERROR = "ERROR"


class SimulationMode(str, Enum):
    BACKTEST = "BACKTEST"
    PAPER = "PAPER"


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{label} must be a non-empty string")
    return value.strip()


def _sha256(value: Any, label: str) -> str:
    digest = _text(value, label).lower()
    if SHA256_RE.fullmatch(digest) is None:
        raise ContractError(f"{label} must be a lowercase SHA-256 digest")
    return digest


def _revision(value: Any, label: str) -> str:
    revision = _text(value, label).lower()
    if REVISION_RE.fullmatch(revision) is None:
        raise ContractError(f"{label} must be a 7-64 character lowercase hex revision")
    return revision


def _finite(value: Any, label: str) -> float:
    if type(value) not in {int, float} or not math.isfinite(float(value)):
        raise ContractError(f"{label} must be a finite number")
    return float(value)


def _integer(value: Any, label: str, *, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum:
        raise ContractError(f"{label} must be an integer >= {minimum}")
    return value


def _utc(value: Any, label: str) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ContractError(f"{label} must be an ISO-8601 timestamp") from exc
    else:
        raise ContractError(f"{label} must be an ISO-8601 timestamp")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ContractError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ContractError(f"{label} must be an object")
    return {str(key): item for key, item in value.items()}


@dataclass(frozen=True)
class EpistemicValue:
    """A scalar that can be absent without being misrepresented as zero."""

    state: MeasurementState
    value: str | float | int | bool | None = None
    unit: str | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        state = self.state
        if not isinstance(state, MeasurementState):
            try:
                state = MeasurementState(str(state))
            except ValueError as exc:
                raise ContractError(f"unknown measurement state {self.state!r}") from exc
            object.__setattr__(self, "state", state)
        if state is MeasurementState.MEASURED:
            if self.value is None:
                raise ContractError("MEASURED values require a value")
            if type(self.value) in {int, float}:
                _finite(self.value, "measured value")
            elif not isinstance(self.value, (str, bool)):
                raise ContractError("measured values must be finite scalars")
            object.__setattr__(self, "unit", _text(self.unit, "measured value unit"))
            if self.reason is not None:
                object.__setattr__(self, "reason", _text(self.reason, "reason"))
        else:
            if self.value is not None:
                raise ContractError(f"{state.value} must not carry a value")
            if self.unit is not None:
                raise ContractError(f"{state.value} must not carry a unit")
            object.__setattr__(self, "reason", _text(self.reason, "absence reason"))

    @classmethod
    def measured(cls, value: str | float | int | bool, unit: str) -> "EpistemicValue":
        return cls(MeasurementState.MEASURED, value=value, unit=unit)

    @classmethod
    def absent(cls, state: MeasurementState, reason: str) -> "EpistemicValue":
        if state is MeasurementState.MEASURED:
            raise ContractError("use measured() for measured values")
        return cls(state, reason=reason)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "EpistemicValue":
        data = _mapping(value, "epistemic value")
        allowed = {"state", "value", "unit", "reason"}
        if set(data) - allowed or "state" not in data:
            raise ContractError("epistemic value has invalid fields")
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {"state": self.state.value}
        if self.state is MeasurementState.MEASURED:
            data.update({"value": self.value, "unit": self.unit})
            if self.reason is not None:
                data["reason"] = self.reason
        else:
            data["reason"] = self.reason
        return data


def _default_assumption(reason: str) -> EpistemicValue:
    return EpistemicValue.absent(MeasurementState.NOT_MEASURED, reason)


@dataclass(frozen=True)
class ExecutionAssumptions:
    fees: EpistemicValue = field(default_factory=lambda: _default_assumption("fee model not supplied"))
    latency_model: EpistemicValue = field(default_factory=lambda: _default_assumption("latency model not supplied"))
    queue_model: EpistemicValue = field(default_factory=lambda: _default_assumption("queue model not supplied"))
    slippage_model: EpistemicValue = field(default_factory=lambda: _default_assumption("slippage model not supplied"))
    market_impact_model: EpistemicValue = field(default_factory=lambda: _default_assumption("market-impact model not supplied"))

    def __post_init__(self) -> None:
        for name in (
            "fees",
            "latency_model",
            "queue_model",
            "slippage_model",
            "market_impact_model",
        ):
            if not isinstance(getattr(self, name), EpistemicValue):
                raise ContractError(f"execution assumption {name} must be an EpistemicValue")

    @property
    def assumptions_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ExecutionAssumptions":
        data = _mapping(value, "execution assumptions")
        fields = {
            "fees",
            "latency_model",
            "queue_model",
            "slippage_model",
            "market_impact_model",
        }
        if set(data) != fields:
            raise ContractError(f"execution assumptions fields must be exactly {sorted(fields)}")
        return cls(**{name: EpistemicValue.from_dict(data[name]) for name in fields})

    def to_dict(self) -> dict[str, Any]:
        return {
            name: getattr(self, name).to_dict()
            for name in (
                "fees",
                "latency_model",
                "queue_model",
                "slippage_model",
                "market_impact_model",
            )
        }


@dataclass(frozen=True)
class SimulationRequest:
    world_hash: str
    strategy_hash: str
    dataset_hash: str
    core_lock_hash: str
    start: datetime
    end: datetime
    seed: int
    mode: SimulationMode
    scenario_id: str
    required_capabilities: tuple[str, ...]
    execution: ExecutionAssumptions
    inputs: Mapping[str, Any]
    schema_version: str = "0.2.3"

    def __post_init__(self) -> None:
        for name in ("world_hash", "strategy_hash", "dataset_hash", "core_lock_hash"):
            object.__setattr__(self, name, _sha256(getattr(self, name), name))
        start = _utc(self.start, "start")
        end = _utc(self.end, "end")
        if end <= start:
            raise ContractError("simulation end must be after start")
        object.__setattr__(self, "start", start)
        object.__setattr__(self, "end", end)
        object.__setattr__(self, "seed", _integer(self.seed, "seed"))
        if not isinstance(self.mode, SimulationMode):
            try:
                object.__setattr__(self, "mode", SimulationMode(str(self.mode)))
            except ValueError as exc:
                raise ContractError("only BACKTEST and PAPER modes are allowed") from exc
        object.__setattr__(self, "scenario_id", _text(self.scenario_id, "scenario_id"))
        capabilities = tuple(_text(item, "required capability") for item in self.required_capabilities)
        if len(capabilities) != len(set(capabilities)):
            raise ContractError("required capabilities must be unique")
        object.__setattr__(self, "required_capabilities", capabilities)
        if not isinstance(self.execution, ExecutionAssumptions):
            raise ContractError("execution must be ExecutionAssumptions")
        inputs = _mapping(self.inputs, "inputs")
        object.__setattr__(self, "inputs", inputs)
        if canonical_sha256(inputs) != self.dataset_hash:
            raise ContractError("dataset_hash does not match canonical inputs")
        if self.schema_version != "0.2.3":
            raise ContractError("unsupported simulation request schema_version")

    @property
    def request_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "SimulationRequest":
        data = _mapping(value, "simulation request")
        fields = {
            "schema_version", "world_hash", "strategy_hash", "dataset_hash",
            "core_lock_hash", "start", "end", "seed", "mode", "scenario_id",
            "required_capabilities", "execution", "inputs",
        }
        if set(data) != fields:
            raise ContractError(f"simulation request fields must be exactly {sorted(fields)}")
        return cls(
            schema_version=data["schema_version"],
            world_hash=data["world_hash"],
            strategy_hash=data["strategy_hash"],
            dataset_hash=data["dataset_hash"],
            core_lock_hash=data["core_lock_hash"],
            start=data["start"],
            end=data["end"],
            seed=data["seed"],
            mode=data["mode"],
            scenario_id=data["scenario_id"],
            required_capabilities=tuple(data["required_capabilities"]),
            execution=ExecutionAssumptions.from_dict(data["execution"]),
            inputs=data["inputs"],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "world_hash": self.world_hash,
            "strategy_hash": self.strategy_hash,
            "dataset_hash": self.dataset_hash,
            "core_lock_hash": self.core_lock_hash,
            "start": _iso(self.start),
            "end": _iso(self.end),
            "seed": self.seed,
            "mode": self.mode.value,
            "scenario_id": self.scenario_id,
            "required_capabilities": list(self.required_capabilities),
            "execution": self.execution.to_dict(),
            "inputs": dict(self.inputs),
        }


@dataclass(frozen=True)
class EngineDescriptor:
    engine_id: str
    role: str
    capabilities: tuple[str, ...]
    license_spdx: str
    license_note: str
    source_url: str
    install_extra: str
    live_order_submission: bool = False
    isolation: str = "external-json-rpc-worker"

    def __post_init__(self) -> None:
        for name in ("engine_id", "role", "license_spdx", "license_note", "source_url", "install_extra", "isolation"):
            object.__setattr__(self, name, _text(getattr(self, name), name))
        capabilities = tuple(_text(item, "capability") for item in self.capabilities)
        if len(capabilities) != len(set(capabilities)):
            raise ContractError("engine capabilities must be unique")
        object.__setattr__(self, "capabilities", capabilities)
        if self.live_order_submission:
            raise ContractError("Forge v0.2.3 forbids live order submission")

    def to_dict(self) -> dict[str, Any]:
        return {
            "engine_id": self.engine_id,
            "role": self.role,
            "capabilities": list(self.capabilities),
            "license_spdx": self.license_spdx,
            "license_note": self.license_note,
            "source_url": self.source_url,
            "install_extra": self.install_extra,
            "live_order_submission": self.live_order_submission,
            "isolation": self.isolation,
        }


@dataclass(frozen=True)
class CanonicalOrder:
    order_id: str
    symbol: str
    side: str
    order_type: str
    quantity: float
    signal_ns: int
    submitted_ns: int
    limit_price: float | None = None

    def __post_init__(self) -> None:
        for name in ("order_id", "symbol", "order_type"):
            object.__setattr__(self, name, _text(getattr(self, name), name))
        side = _text(self.side, "side").upper()
        if side not in {"BUY", "SELL"}:
            raise ContractError("order side must be BUY or SELL")
        object.__setattr__(self, "side", side)
        quantity = _finite(self.quantity, "order quantity")
        if quantity <= 0:
            raise ContractError("order quantity must be > 0")
        object.__setattr__(self, "quantity", quantity)
        object.__setattr__(self, "signal_ns", _integer(self.signal_ns, "signal_ns"))
        object.__setattr__(self, "submitted_ns", _integer(self.submitted_ns, "submitted_ns"))
        if self.limit_price is not None:
            price = _finite(self.limit_price, "limit_price")
            if price <= 0:
                raise ContractError("limit_price must be > 0")
            object.__setattr__(self, "limit_price", price)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "CanonicalOrder":
        data = _mapping(value, "canonical order")
        fields = {"order_id", "symbol", "side", "order_type", "quantity", "signal_ns", "submitted_ns", "limit_price"}
        if set(data) != fields:
            raise ContractError(f"canonical order fields must be exactly {sorted(fields)}")
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {
            "order_id": self.order_id, "symbol": self.symbol, "side": self.side,
            "order_type": self.order_type, "quantity": self.quantity,
            "signal_ns": self.signal_ns, "submitted_ns": self.submitted_ns,
            "limit_price": self.limit_price,
        }


@dataclass(frozen=True)
class CanonicalFill:
    fill_id: str
    order_id: str
    symbol: str
    side: str
    quantity: float
    price: float
    fee: float
    event_ns: int
    latency_ns: EpistemicValue
    queue_ahead_quantity: EpistemicValue
    available_quantity: EpistemicValue

    def __post_init__(self) -> None:
        for name in ("fill_id", "order_id", "symbol"):
            object.__setattr__(self, name, _text(getattr(self, name), name))
        side = _text(self.side, "side").upper()
        if side not in {"BUY", "SELL"}:
            raise ContractError("fill side must be BUY or SELL")
        object.__setattr__(self, "side", side)
        for name in ("quantity", "price"):
            numeric = _finite(getattr(self, name), name)
            if numeric <= 0:
                raise ContractError(f"{name} must be > 0")
            object.__setattr__(self, name, numeric)
        fee = _finite(self.fee, "fee")
        if fee < 0:
            raise ContractError("fee must be >= 0")
        object.__setattr__(self, "fee", fee)
        object.__setattr__(self, "event_ns", _integer(self.event_ns, "event_ns"))
        for name in ("latency_ns", "queue_ahead_quantity", "available_quantity"):
            if not isinstance(getattr(self, name), EpistemicValue):
                raise ContractError(f"{name} must be an EpistemicValue")

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "CanonicalFill":
        data = _mapping(value, "canonical fill")
        fields = {"fill_id", "order_id", "symbol", "side", "quantity", "price", "fee", "event_ns", "latency_ns", "queue_ahead_quantity", "available_quantity"}
        if set(data) != fields:
            raise ContractError(f"canonical fill fields must be exactly {sorted(fields)}")
        for name in ("latency_ns", "queue_ahead_quantity", "available_quantity"):
            data[name] = EpistemicValue.from_dict(data[name])
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {
            "fill_id": self.fill_id, "order_id": self.order_id, "symbol": self.symbol,
            "side": self.side, "quantity": self.quantity, "price": self.price,
            "fee": self.fee, "event_ns": self.event_ns,
            "latency_ns": self.latency_ns.to_dict(),
            "queue_ahead_quantity": self.queue_ahead_quantity.to_dict(),
            "available_quantity": self.available_quantity.to_dict(),
        }


@dataclass(frozen=True)
class AccountState:
    initial_cash: float
    ending_cash: float
    positions: Mapping[str, float]

    def __post_init__(self) -> None:
        object.__setattr__(self, "initial_cash", _finite(self.initial_cash, "initial_cash"))
        object.__setattr__(self, "ending_cash", _finite(self.ending_cash, "ending_cash"))
        positions = _mapping(self.positions, "positions")
        object.__setattr__(self, "positions", {symbol: _finite(qty, f"position {symbol}") for symbol, qty in positions.items()})

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "AccountState":
        data = _mapping(value, "account state")
        fields = {"initial_cash", "ending_cash", "positions"}
        if set(data) != fields:
            raise ContractError(f"account state fields must be exactly {sorted(fields)}")
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {"initial_cash": self.initial_cash, "ending_cash": self.ending_cash, "positions": dict(self.positions)}


@dataclass(frozen=True)
class EngineProvenance:
    engine_id: str
    engine_version: str
    engine_commit: str
    adapter_version: str
    runtime: str
    rust_version: EpistemicValue
    dependency_lock_hash: str
    worker_hash: str
    license_spdx: str

    def __post_init__(self) -> None:
        for name in ("engine_id", "engine_version", "adapter_version", "runtime", "license_spdx"):
            object.__setattr__(self, name, _text(getattr(self, name), name))
        object.__setattr__(self, "engine_commit", _revision(self.engine_commit, "engine_commit"))
        for name in ("dependency_lock_hash", "worker_hash"):
            object.__setattr__(self, name, _sha256(getattr(self, name), name))
        if not isinstance(self.rust_version, EpistemicValue):
            raise ContractError("rust_version must be an EpistemicValue")

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "EngineProvenance":
        data = _mapping(value, "engine provenance")
        data["rust_version"] = EpistemicValue.from_dict(data["rust_version"])
        fields = {"engine_id", "engine_version", "engine_commit", "adapter_version", "runtime", "rust_version", "dependency_lock_hash", "worker_hash", "license_spdx"}
        if set(data) != fields:
            raise ContractError(f"engine provenance fields must be exactly {sorted(fields)}")
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {
            "engine_id": self.engine_id, "engine_version": self.engine_version,
            "engine_commit": self.engine_commit, "adapter_version": self.adapter_version,
            "runtime": self.runtime, "rust_version": self.rust_version.to_dict(),
            "dependency_lock_hash": self.dependency_lock_hash,
            "worker_hash": self.worker_hash, "license_spdx": self.license_spdx,
        }


@dataclass(frozen=True)
class SimulationResult:
    provenance: EngineProvenance
    request_hash: str
    world_hash: str
    strategy_hash: str
    dataset_hash: str
    assumptions_hash: str
    seed: int
    orders: tuple[CanonicalOrder, ...]
    fills: tuple[CanonicalFill, ...]
    account: AccountState
    metrics: Mapping[str, EpistemicValue]
    runtime_ms: float
    schema_version: str = "0.2.3"

    def __post_init__(self) -> None:
        if not isinstance(self.provenance, EngineProvenance):
            raise ContractError("provenance must be EngineProvenance")
        for name in ("request_hash", "world_hash", "strategy_hash", "dataset_hash", "assumptions_hash"):
            object.__setattr__(self, name, _sha256(getattr(self, name), name))
        object.__setattr__(self, "seed", _integer(self.seed, "seed"))
        if len({item.order_id for item in self.orders}) != len(self.orders):
            raise ContractError("order IDs must be unique")
        if len({item.fill_id for item in self.fills}) != len(self.fills):
            raise ContractError("fill IDs must be unique")
        if not isinstance(self.account, AccountState):
            raise ContractError("account must be AccountState")
        metrics = dict(self.metrics)
        if set(metrics) != set(CANONICAL_METRICS):
            raise ContractError(f"metrics must be exactly {sorted(CANONICAL_METRICS)}")
        if not all(isinstance(item, EpistemicValue) for item in metrics.values()):
            raise ContractError("every metric must be an EpistemicValue")
        object.__setattr__(self, "metrics", metrics)
        runtime = _finite(self.runtime_ms, "runtime_ms")
        if runtime < 0:
            raise ContractError("runtime_ms must be >= 0")
        object.__setattr__(self, "runtime_ms", runtime)
        if self.schema_version != "0.2.3":
            raise ContractError("unsupported simulation result schema_version")

    @property
    def replay_hash(self) -> str:
        payload = self._payload()
        payload.pop("runtime_ms")
        return canonical_sha256(payload)

    @property
    def result_hash(self) -> str:
        return canonical_sha256(self._payload())

    def _payload(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "provenance": self.provenance.to_dict(),
            "request_hash": self.request_hash,
            "world_hash": self.world_hash,
            "strategy_hash": self.strategy_hash,
            "dataset_hash": self.dataset_hash,
            "assumptions_hash": self.assumptions_hash,
            "seed": self.seed,
            "orders": [item.to_dict() for item in self.orders],
            "fills": [item.to_dict() for item in self.fills],
            "account": self.account.to_dict(),
            "metrics": {name: self.metrics[name].to_dict() for name in sorted(self.metrics)},
            "runtime_ms": self.runtime_ms,
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "SimulationResult":
        data = _mapping(value, "simulation result")
        supplied_result = data.get("result_hash")
        fields = {"schema_version", "provenance", "request_hash", "world_hash", "strategy_hash", "dataset_hash", "assumptions_hash", "seed", "orders", "fills", "account", "metrics", "runtime_ms", "result_hash", "replay_hash"}
        if set(data) != fields:
            raise ContractError(f"simulation result fields must be exactly {sorted(fields)}")
        data.pop("result_hash")
        supplied_replay = data.pop("replay_hash", None)
        result = cls(
            schema_version=data["schema_version"],
            provenance=EngineProvenance.from_dict(data["provenance"]),
            request_hash=data["request_hash"], world_hash=data["world_hash"],
            strategy_hash=data["strategy_hash"], dataset_hash=data["dataset_hash"],
            assumptions_hash=data["assumptions_hash"], seed=data["seed"],
            orders=tuple(CanonicalOrder.from_dict(item) for item in data["orders"]),
            fills=tuple(CanonicalFill.from_dict(item) for item in data["fills"]),
            account=AccountState.from_dict(data["account"]),
            metrics={name: EpistemicValue.from_dict(item) for name, item in data["metrics"].items()},
            runtime_ms=data["runtime_ms"],
        )
        if supplied_result is not None and supplied_result != result.result_hash:
            raise ContractError("worker supplied an invalid result_hash")
        if supplied_replay is not None and supplied_replay != result.replay_hash:
            raise ContractError("worker supplied an invalid replay_hash")
        return result

    def to_dict(self) -> dict[str, Any]:
        data = self._payload()
        data.update({"result_hash": self.result_hash, "replay_hash": self.replay_hash})
        return data


@dataclass(frozen=True)
class SimulationOutcome:
    engine_id: str
    request_hash: str
    state: MeasurementState
    result: SimulationResult | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "engine_id", _text(self.engine_id, "engine_id"))
        object.__setattr__(self, "request_hash", _sha256(self.request_hash, "request_hash"))
        state = self.state
        if not isinstance(state, MeasurementState):
            state = MeasurementState(str(state))
            object.__setattr__(self, "state", state)
        if state is MeasurementState.MEASURED:
            if not isinstance(self.result, SimulationResult):
                raise ContractError("MEASURED outcomes require a SimulationResult")
            if self.reason is not None:
                raise ContractError("MEASURED outcomes must not carry an error reason")
        else:
            if self.result is not None:
                raise ContractError(f"{state.value} outcomes must not carry a result")
            object.__setattr__(self, "reason", _text(self.reason, "outcome reason"))

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "SimulationOutcome":
        data = _mapping(value, "simulation outcome")
        fields = {"engine_id", "request_hash", "state", "result", "reason"}
        if set(data) != fields:
            raise ContractError(f"simulation outcome fields must be exactly {sorted(fields)}")
        result = SimulationResult.from_dict(data["result"]) if data["result"] is not None else None
        return cls(
            engine_id=data["engine_id"], request_hash=data["request_hash"],
            state=data["state"], result=result, reason=data["reason"],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "engine_id": self.engine_id, "request_hash": self.request_hash,
            "state": self.state.value,
            "result": self.result.to_dict() if self.result is not None else None,
            "reason": self.reason,
        }


class SimulationEngine(Protocol):
    @property
    def descriptor(self) -> EngineDescriptor: ...

    def run(self, request: SimulationRequest) -> SimulationOutcome: ...

    def replay(self, run_id: str) -> SimulationOutcome: ...
