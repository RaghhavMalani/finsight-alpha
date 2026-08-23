"""Named builders for explicit execution assumptions."""

from __future__ import annotations

from src.execution.contracts import EpistemicValue, ExecutionAssumptions, MeasurementState


def idealized_assumptions() -> ExecutionAssumptions:
    return ExecutionAssumptions(
        fees=EpistemicValue.measured(0.0, "bps"),
        latency_model=EpistemicValue.measured(0.0, "ms"),
        queue_model=EpistemicValue.absent(MeasurementState.UNSUPPORTED, "idealized level has no order queue"),
        slippage_model=EpistemicValue.measured(0.0, "bps"),
        market_impact_model=EpistemicValue.absent(MeasurementState.UNSUPPORTED, "idealized level has no market impact"),
    )


def explicit_execution_assumptions(
    *,
    fees_bps: float,
    latency_ms: float,
    queue_model: str,
    slippage_bps: float,
    market_impact_model: str | None,
) -> ExecutionAssumptions:
    impact = (
        EpistemicValue.measured(market_impact_model, "model")
        if market_impact_model is not None
        else EpistemicValue.absent(MeasurementState.NOT_MEASURED, "market-impact model was not supplied")
    )
    return ExecutionAssumptions(
        fees=EpistemicValue.measured(fees_bps, "bps"),
        latency_model=EpistemicValue.measured(latency_ms, "ms"),
        queue_model=EpistemicValue.measured(queue_model, "model"),
        slippage_model=EpistemicValue.measured(slippage_bps, "bps"),
        market_impact_model=impact,
    )
