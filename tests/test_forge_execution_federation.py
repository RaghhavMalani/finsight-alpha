from __future__ import annotations

import sys
from dataclasses import replace
from pathlib import Path

import pytest

from src.eval.canonical import canonical_sha256
from src.execution import (
    ContractError,
    EngineDescriptor,
    EpistemicValue,
    ExecutionAssumptions,
    MeasurementState,
    SimulationMode,
    SimulationRequest,
    SimulationToolPlane,
    WorkerEngine,
    default_registry,
)
from src.execution.benchmark import load_execution_suite
from src.execution.reality_ladder import AlphaSurvivalCurve, LadderStage, RealityLevel
from src.execution.verifiers import (
    ExecutionVerificationContext,
    ExecutionVerifierSuite,
    LATENCY_GRID_MS,
    MICROSTRUCTURE_AXES,
)


ROOT = Path(__file__).resolve().parents[1]
TASKS = ROOT / "eval" / "tasks" / "forge_v0_2_3_execution"


def _request(*, sharpe: float = 1.2) -> SimulationRequest:
    inputs = {
        "initial_cash": 100_000.0,
        "orders": [
            {
                "order_id": "order-1", "symbol": "TEST", "side": "BUY",
                "order_type": "MARKET", "quantity": 5.0,
                "signal_ns": 500_000, "submitted_ns": 1_000_000,
                "limit_price": None,
            }
        ],
        "market_events": [
            {
                "symbol": "TEST", "event_ns": 2_000_000,
                "available_from_ns": 1_500_000,
                "bid": 99.0, "ask": 100.0, "bid_size": 8.0,
                "ask_size": 4.0, "queue_ahead": 1.0, "mark_price": 101.0,
            }
        ],
        "strategy_metrics": {"sharpe": sharpe, "max_drawdown": 0.08},
    }
    assumptions = ExecutionAssumptions(
        fees=EpistemicValue.measured(1.0, "bps"),
        latency_model=EpistemicValue.measured(1.0, "ms"),
        queue_model=EpistemicValue.measured("fifo", "model"),
        slippage_model=EpistemicValue.measured(0.0, "bps"),
        market_impact_model=EpistemicValue.absent(
            MeasurementState.UNSUPPORTED, "conformance worker has no market impact"
        ),
    )
    return SimulationRequest(
        world_hash=canonical_sha256("world"),
        strategy_hash=canonical_sha256("strategy"),
        dataset_hash=canonical_sha256(inputs),
        core_lock_hash=canonical_sha256("core-lock"),
        start="2026-01-01T00:00:00Z",
        end="2026-01-02T00:00:00Z",
        seed=42,
        mode=SimulationMode.BACKTEST,
        scenario_id="conformance",
        required_capabilities=("tick_data",),
        execution=assumptions,
        inputs=inputs,
    )


def _reference_engine() -> WorkerEngine:
    descriptor = EngineDescriptor(
        engine_id="conformance-reference",
        role="protocol conformance only",
        capabilities=("tick_data",),
        license_spdx="LicenseRef-FinSight-Project",
        license_note="Project-owned deterministic fixture, not market truth.",
        source_url="https://example.invalid/finsight-conformance",
        install_extra="none",
    )
    return WorkerEngine(
        descriptor,
        (sys.executable, "-m", "src.execution.workers.reference"),
        cwd=ROOT,
        timeout_seconds=10.0,
    )


def _with_sharpe(result, value: float, *, engine_id: str | None = None):
    metrics = dict(result.metrics)
    metrics["sharpe"] = EpistemicValue.measured(value, "ratio")
    provenance = result.provenance
    if engine_id is not None:
        provenance = replace(provenance, engine_id=engine_id)
    return replace(result, metrics=metrics, provenance=provenance)


def test_epistemic_contract_never_converts_absence_to_zero() -> None:
    with pytest.raises(ContractError, match="must not carry a value"):
        EpistemicValue(MeasurementState.UNSUPPORTED, value=0.0, reason="not supplied")
    value = EpistemicValue.absent(MeasurementState.UNAVAILABLE, "worker missing")
    assert value.to_dict() == {"state": "UNAVAILABLE", "reason": "worker missing"}


def test_request_hashes_inputs_and_forbids_live_mode() -> None:
    request = _request()
    assert request.dataset_hash == canonical_sha256(request.inputs)
    with pytest.raises(ContractError, match="only BACKTEST and PAPER"):
        replace(request, mode="LIVE")


def test_isolated_reference_worker_normalizes_and_replays() -> None:
    engine = _reference_engine()
    request = _request()
    outcome = engine.run(request)

    assert outcome.state is MeasurementState.MEASURED
    assert outcome.result is not None
    assert outcome.result.request_hash == request.request_hash
    assert outcome.result.provenance.dependency_lock_hash == request.core_lock_hash
    assert outcome.result.metrics["queue_position"].state is MeasurementState.MEASURED
    assert outcome.result.fills[0].quantity == 3.0

    replay = engine.replay(outcome.result.result_hash)
    assert replay.state is MeasurementState.MEASURED
    assert replay.result is not None
    assert replay.result.replay_hash == outcome.result.replay_hash


def test_registry_and_tool_plane_report_unavailable_without_fabrication() -> None:
    registry = default_registry()
    descriptions = registry.describe()
    assert {item["engine_id"] for item in descriptions} == {
        "vectorbt", "nautilus", "hftbacktest", "legacy-hft"
    }
    assert all(item["availability"] == "UNAVAILABLE" for item in descriptions)
    plane = SimulationToolPlane(registry)
    listed = plane.call("simulation.list_engines")
    outcome = plane.call("simulation.run", {"engine": "hftbacktest", "request": _request()})
    assert len(listed) == 4
    assert outcome.state is MeasurementState.UNAVAILABLE
    assert outcome.result is None


def test_reality_ladder_computes_gap_survival_and_promotion() -> None:
    curve = AlphaSurvivalCurve((
        LadderStage(RealityLevel.L0_MATHEMATICAL, "idealized", EpistemicValue.measured(1.6, "sharpe")),
        LadderStage(RealityLevel.L2_EVENT_REPLAY, "events", EpistemicValue.measured(1.5, "sharpe")),
        LadderStage(RealityLevel.L3_MICROSTRUCTURE, "fills", EpistemicValue.measured(1.4, "sharpe")),
    ))
    assert curve.alpha_survival_ratio.value == pytest.approx(0.875)
    assert curve.execution_reality_gap.value == pytest.approx(0.2)
    assert curve.promote(minimum_final=1.0, minimum_survival_ratio=0.8)


def test_all_five_execution_verifiers_run_independently() -> None:
    request = _request()
    outcome = _reference_engine().run(request)
    assert outcome.result is not None
    primary = outcome.result
    peer = _with_sharpe(primary, 1.15, engine_id="peer-reference")
    latency_results = {
        latency: _with_sharpe(primary, 1.2 - latency * 0.003)
        for latency in LATENCY_GRID_MS
    }
    stress_results = {
        axis: _with_sharpe(primary, 0.9)
        for axis in MICROSTRUCTURE_AXES
    }
    context = ExecutionVerificationContext(
        requests={request.request_hash: request},
        results=(primary, peer), metric="sharpe",
        cross_engine_tolerance=0.1,
        latency_results=latency_results,
        stress_results=stress_results,
        baseline_result=primary,
    )

    results = ExecutionVerifierSuite().run(context)
    assert {item.verifier for item in results} == {
        "execution_integrity", "fill_plausibility", "latency_robustness",
        "cross_engine_consistency", "microstructure_robustness",
    }
    assert all(item.status.value == "pass" for item in results)


def test_execution_benchmark_suite_is_exactly_twelve_strict_tasks() -> None:
    tasks = load_execution_suite(TASKS)
    assert len(tasks) == 12
    assert len({task.task_hash for task in tasks}) == 12
    assert tasks[-1].task_id == "execution_012_full_reality_ladder"
