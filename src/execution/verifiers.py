"""Independent host-side verifiers for untrusted simulation results."""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Mapping, Protocol

from src.execution.contracts import MeasurementState, SimulationRequest, SimulationResult
from src.verifiers.core import CheckResult, VerificationResult, VerificationStatus


LATENCY_GRID_MS = (0, 1, 5, 10, 25, 50, 100)
MICROSTRUCTURE_AXES = (
    "queue", "fees", "slippage", "latency", "spread",
    "partial_fill", "volatility", "liquidity",
)


@dataclass(frozen=True)
class ExecutionVerificationContext:
    requests: Mapping[str, SimulationRequest]
    results: tuple[SimulationResult, ...]
    metric: str = "sharpe"
    cross_engine_tolerance: float = 0.15
    maximum_latency_degradation: float = 0.50
    minimum_stress_survival: float = 0.50
    latency_results: Mapping[int, SimulationResult] = field(default_factory=dict)
    stress_results: Mapping[str, SimulationResult] = field(default_factory=dict)
    baseline_result: SimulationResult | None = None

    def __post_init__(self) -> None:
        if any(key != request.request_hash for key, request in self.requests.items()):
            raise ValueError("request mapping keys must be canonical request hashes")
        for name in ("cross_engine_tolerance", "maximum_latency_degradation", "minimum_stress_survival"):
            value = getattr(self, name)
            if type(value) not in {int, float} or not math.isfinite(float(value)) or value < 0:
                raise ValueError(f"{name} must be a finite non-negative number")


class ExecutionVerifier(Protocol):
    name: str

    def verify(self, context: ExecutionVerificationContext) -> VerificationResult: ...


def _not_measured(name: str) -> VerificationResult:
    return VerificationResult(name, VerificationStatus.NOT_MEASURED, 0.0, ())


def _request(context: ExecutionVerificationContext, result: SimulationResult) -> SimulationRequest | None:
    return context.requests.get(result.request_hash)


class ExecutionIntegrityVerifier:
    name = "execution_integrity"

    def verify(self, context: ExecutionVerificationContext) -> VerificationResult:
        if not context.results:
            return _not_measured(self.name)
        checks: list[CheckResult] = []
        for result in context.results:
            prefix = result.provenance.engine_id
            request = _request(context, result)
            checks.append(CheckResult(
                f"{prefix}.request_binding", request is not None,
                "result is bound to a host-side canonical request",
            ))
            if request is None:
                continue
            bindings_ok = all((
                result.world_hash == request.world_hash,
                result.strategy_hash == request.strategy_hash,
                result.dataset_hash == request.dataset_hash,
                result.assumptions_hash == request.execution.assumptions_hash,
                result.seed == request.seed,
            ))
            checks.append(CheckResult(
                f"{prefix}.provenance_binding", bindings_ok,
                "world, strategy, dataset, assumptions, and seed match the request",
            ))
            temporal_ok = all(order.submitted_ns >= order.signal_ns for order in result.orders)
            checks.append(CheckResult(
                f"{prefix}.signal_order_time", temporal_ok,
                "orders are submitted at or after their strategy signal",
            ))
            order_map = {order.order_id: order for order in result.orders}
            filled = defaultdict(float)
            fills_ok = True
            for fill in result.fills:
                order = order_map.get(fill.order_id)
                if order is None:
                    fills_ok = False
                    continue
                filled[order.order_id] += fill.quantity
                fills_ok = fills_ok and all((
                    fill.event_ns >= order.submitted_ns,
                    fill.symbol == order.symbol,
                    fill.side == order.side,
                    filled[order.order_id] <= order.quantity + 1e-9,
                ))
            checks.append(CheckResult(
                f"{prefix}.fill_causality", fills_ok,
                "fills follow known orders and respect side, symbol, time, and quantity",
            ))
            known_events = request.inputs.get("market_events", [])
            future_ok = True
            for fill in result.fills:
                order = order_map.get(fill.order_id)
                candidates = [event for event in known_events if event.get("symbol") == fill.symbol and int(event.get("event_ns", -1)) == fill.event_ns]
                if not candidates or order is None:
                    future_ok = False
                else:
                    future_ok = future_ok and all(int(event.get("available_from_ns", event["event_ns"])) <= fill.event_ns for event in candidates)
            checks.append(CheckResult(
                f"{prefix}.no_future_book", future_ok,
                "every fill uses a host-known book event available by order submission",
            ))
            cash = result.account.initial_cash
            positions: dict[str, float] = defaultdict(float)
            for fill in result.fills:
                signed = fill.quantity if fill.side == "BUY" else -fill.quantity
                cash -= signed * fill.price
                cash -= fill.fee
                positions[fill.symbol] += signed
            accounting_ok = math.isclose(cash, result.account.ending_cash, rel_tol=1e-9, abs_tol=1e-7)
            symbols = set(positions) | set(result.account.positions)
            accounting_ok = accounting_ok and all(
                math.isclose(positions.get(symbol, 0.0), result.account.positions.get(symbol, 0.0), rel_tol=1e-9, abs_tol=1e-9)
                for symbol in symbols
            )
            checks.append(CheckResult(
                f"{prefix}.accounting", accounting_ok,
                "cash and positions reconcile independently from canonical fills",
            ))
        return VerificationResult.from_checks(self.name, checks)


class FillPlausibilityVerifier:
    name = "fill_plausibility"

    def verify(self, context: ExecutionVerificationContext) -> VerificationResult:
        if not context.results:
            return _not_measured(self.name)
        checks: list[CheckResult] = []
        for result in context.results:
            prefix = result.provenance.engine_id
            request = _request(context, result)
            if request is None:
                checks.append(CheckResult(f"{prefix}.request", False, "host request is available"))
                continue
            events = request.inputs.get("market_events", [])
            order_map = {order.order_id: order for order in result.orders}
            price_ok = volume_ok = partial_ok = True
            for fill in result.fills:
                order = order_map.get(fill.order_id)
                candidates = [event for event in events if event.get("symbol") == fill.symbol and int(event.get("event_ns", -1)) == fill.event_ns]
                if order is None or not candidates:
                    price_ok = volume_ok = partial_ok = False
                    continue
                event = candidates[0]
                base = float(event["ask"] if fill.side == "BUY" else event["bid"])
                slip = request.execution.slippage_model
                slip_bps = float(slip.value) if slip.state is MeasurementState.MEASURED and type(slip.value) in {int, float} else 0.0
                expected = base * (1.0 + slip_bps / 10_000.0 * (1 if fill.side == "BUY" else -1))
                price_ok = price_ok and math.isclose(fill.price, expected, rel_tol=1e-9, abs_tol=1e-9)
                book_size = float(event["ask_size"] if fill.side == "BUY" else event["bid_size"])
                if fill.available_quantity.state is MeasurementState.MEASURED:
                    volume_ok = volume_ok and math.isclose(float(fill.available_quantity.value), book_size, rel_tol=1e-9, abs_tol=1e-9)
                else:
                    volume_ok = False
                if fill.queue_ahead_quantity.state is MeasurementState.MEASURED:
                    queue = float(fill.queue_ahead_quantity.value)
                else:
                    queue = 0.0
                    if request.execution.queue_model.state is MeasurementState.MEASURED:
                        volume_ok = False
                volume_ok = volume_ok and fill.quantity + queue <= book_size + 1e-9
                partial_ok = partial_ok and fill.quantity <= order.quantity + 1e-9
            checks.extend((
                CheckResult(f"{prefix}.price", price_ok, "fill prices agree with contemporaneous side-of-book and declared slippage"),
                CheckResult(f"{prefix}.volume_queue", volume_ok, "fills do not exceed independently observed volume after queue-ahead quantity"),
                CheckResult(f"{prefix}.partial_fill", partial_ok, "partial and aggregate fills do not exceed order quantity"),
            ))
        return VerificationResult.from_checks(self.name, checks)


class LatencyRobustnessVerifier:
    name = "latency_robustness"

    def verify(self, context: ExecutionVerificationContext) -> VerificationResult:
        if not context.latency_results:
            return _not_measured(self.name)
        missing = sorted(set(LATENCY_GRID_MS) - set(context.latency_results))
        measured: dict[int, float] = {}
        for latency, result in context.latency_results.items():
            observation = result.metrics.get(context.metric)
            if observation is not None and observation.state is MeasurementState.MEASURED:
                measured[int(latency)] = float(observation.value)
        coverage = not missing and set(measured) == set(LATENCY_GRID_MS)
        checks = [CheckResult(
            "latency.grid", coverage,
            "all required latency scenarios have measured host-comparable metrics",
            {"missing": missing, "measured": sorted(measured)},
        )]
        if 0 in measured and len(measured) > 1:
            base = measured[0]
            denominator = abs(base) + 1e-12
            degradations = {latency: (base - value) / denominator for latency, value in measured.items() if latency != 0}
            worst = max(degradations.values())
            checks.append(CheckResult(
                "latency.degradation", worst <= context.maximum_latency_degradation,
                "worst D_L stays within the configured independent gate",
                {"D_L": degradations, "maximum": context.maximum_latency_degradation},
            ))
        else:
            checks.append(CheckResult("latency.degradation", False, "zero-latency baseline and stressed results are present"))
        return VerificationResult.from_checks(self.name, checks)


class CrossEngineConsistencyVerifier:
    name = "cross_engine_consistency"

    def verify(self, context: ExecutionVerificationContext) -> VerificationResult:
        values: dict[str, float] = {}
        bindings: set[tuple[str, str]] = set()
        for result in context.results:
            observation = result.metrics.get(context.metric)
            if observation is not None and observation.state is MeasurementState.MEASURED:
                values[result.provenance.engine_id] = float(observation.value)
                bindings.add((result.world_hash, result.strategy_hash))
        if len(values) < 2:
            return _not_measured(self.name)
        spread = max(values.values()) - min(values.values())
        checks = (
            CheckResult("cross_engine.binding", len(bindings) == 1, "engines evaluated the same world and strategy"),
            CheckResult(
                "cross_engine.disagreement", spread <= context.cross_engine_tolerance,
                "engine metric spread stays within the simplified-assumption tolerance",
                {"values": values, "spread": spread, "tolerance": context.cross_engine_tolerance},
            ),
        )
        return VerificationResult.from_checks(self.name, checks)


class MicrostructureRobustnessVerifier:
    name = "microstructure_robustness"

    def verify(self, context: ExecutionVerificationContext) -> VerificationResult:
        if context.baseline_result is None or not context.stress_results:
            return _not_measured(self.name)
        baseline = context.baseline_result.metrics.get(context.metric)
        if baseline is None or baseline.state is not MeasurementState.MEASURED:
            return _not_measured(self.name)
        missing = sorted(set(MICROSTRUCTURE_AXES) - set(context.stress_results))
        base = float(baseline.value)
        denominator = abs(base) + 1e-12
        survivals: dict[str, float] = {}
        unavailable: list[str] = []
        for axis, result in context.stress_results.items():
            observation = result.metrics.get(context.metric)
            if observation is None or observation.state is not MeasurementState.MEASURED:
                unavailable.append(axis)
            else:
                survivals[axis] = float(observation.value) / denominator
        coverage = not missing and not unavailable
        worst = min(survivals.values()) if survivals else -math.inf
        checks = (
            CheckResult("microstructure.coverage", coverage, "all eight stress axes are independently measured", {"missing": missing, "unavailable": unavailable}),
            CheckResult(
                "microstructure.survival", worst >= context.minimum_stress_survival,
                "worst stressed alpha survival clears the configured gate",
                {"survivals": survivals, "minimum": context.minimum_stress_survival},
            ),
        )
        return VerificationResult.from_checks(self.name, checks)


class ExecutionVerifierSuite:
    def __init__(self, verifiers: tuple[ExecutionVerifier, ...] | None = None) -> None:
        configured = verifiers or (
            ExecutionIntegrityVerifier(), FillPlausibilityVerifier(),
            LatencyRobustnessVerifier(), CrossEngineConsistencyVerifier(),
            MicrostructureRobustnessVerifier(),
        )
        self._verifiers = {verifier.name: verifier for verifier in configured}
        if len(self._verifiers) != len(configured):
            raise ValueError("execution verifier names must be unique")

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(sorted(self._verifiers))

    def run(self, context: ExecutionVerificationContext, names: tuple[str, ...] | None = None) -> tuple[VerificationResult, ...]:
        requested = names or tuple(self._verifiers)
        unknown = set(requested) - set(self._verifiers)
        if unknown:
            raise ValueError(f"unknown execution verifiers: {sorted(unknown)}")
        return tuple(self._verifiers[name].verify(context) for name in requested)
