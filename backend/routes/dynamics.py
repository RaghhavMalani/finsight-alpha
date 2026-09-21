"""Dynamics Lab API: point-in-time market-theory certification."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from src.dynamics import (
    DynamicsInputError,
    EstimatorTournamentError,
    FailureDecompositionError,
    IdentifiabilityError,
    NonlinearDynamicsError,
    TargetedRecoveryError,
    HypothesisLedger,
    certify_ou,
    generate_exact_ou,
    generate_stat_arb_reference,
    generate_nonlinear_reference,
    load_frozen_estimator_tournament,
    load_frozen_failure_decomposition,
    load_frozen_identifiability_artifact,
    load_frozen_targeted_recovery,
    run_ou_certification_suite,
    run_nonlinear_certification_suite,
    run_ou_power_map,
    selection_aware_pair_search,
    StatArbInputError,
    fit_nonlinear_dynamics,
)

router = APIRouter(prefix="/dynamics", tags=["dynamics lab"])


class DynamicsObservation(BaseModel):
    value: float
    observed_at: datetime
    available_at: datetime

    @model_validator(mode="after")
    def validate_timestamps(self) -> "DynamicsObservation":
        if self.observed_at.tzinfo is None or self.available_at.tzinfo is None:
            raise ValueError("observed_at and available_at must include a timezone")
        if self.available_at < self.observed_at:
            raise ValueError("available_at cannot precede observed_at")
        return self


class OUFitRequest(BaseModel):
    experiment_name: str = Field(min_length=1, max_length=120)
    observable: str = Field(min_length=1, max_length=120)
    as_of: datetime
    time_unit: Literal["minute", "hour", "day"] = "day"
    train_fraction: float = Field(default=0.72, ge=0.60, le=0.85)
    hypothesis_count: int = Field(default=1, ge=1, le=1_000_000)
    selection_procedure: str = Field(
        default="pre-registered single-theory request", min_length=1, max_length=240
    )
    selection_timestamp: datetime | None = None
    selection_metric: str = Field(
        default="sealed holdout negative log likelihood", min_length=1, max_length=120
    )
    holdout_untouched: bool = True
    multiplicity_adjustment: str | None = Field(default=None, max_length=120)
    execution_survival: bool | None = None
    source: str = Field(default="source-supplied", min_length=1, max_length=120)
    revision: str = Field(default="unversioned", min_length=1, max_length=120)
    observations: list[DynamicsObservation] = Field(min_length=64, max_length=10_000)

    @model_validator(mode="after")
    def validate_point_in_time_world(self) -> "OUFitRequest":
        if self.as_of.tzinfo is None:
            raise ValueError("as_of must include a timezone")
        if self.selection_timestamp is not None:
            if self.selection_timestamp.tzinfo is None:
                raise ValueError("selection_timestamp must include a timezone")
            if self.selection_timestamp > self.as_of:
                raise ValueError("selection_timestamp cannot follow as_of")
        timestamps = [item.observed_at for item in self.observations]
        if timestamps != sorted(timestamps) or len(set(timestamps)) != len(timestamps):
            raise ValueError("observations must be strictly ordered by observed_at")
        if any(item.available_at > self.as_of for item in self.observations):
            raise ValueError(
                "an observation is not available in the requested as_of world"
            )
        return self


class StatArbSecurity(BaseModel):
    symbol: str = Field(min_length=1, max_length=24)
    prices: list[float] = Field(min_length=160, max_length=5_000)


class PairExecutionEvidence(BaseModel):
    independently_measured: bool
    round_trip_cost_bps: float = Field(ge=0)
    net_return_bps: float
    trades: int = Field(ge=0)
    latency_modelled: bool
    borrow_confirmed: bool
    capacity_usd: float = Field(ge=0)


class NonlinearFitRequest(BaseModel):
    experiment_name: str = Field(min_length=1, max_length=120)
    observable: str = Field(min_length=1, max_length=120)
    as_of: datetime
    time_unit: Literal["minute", "hour", "day"] = "day"
    train_fraction: float = Field(default=0.72, ge=0.60, le=0.85)
    source: str = Field(default="source-supplied", min_length=1, max_length=120)
    revision: str = Field(default="unversioned", min_length=1, max_length=120)
    bootstrap_repetitions: int = Field(default=48, ge=8, le=200)
    execution_evidence: PairExecutionEvidence | None = None
    observations: list[DynamicsObservation] = Field(min_length=96, max_length=10_000)

    @model_validator(mode="after")
    def validate_point_in_time_world(self) -> "NonlinearFitRequest":
        if self.as_of.tzinfo is None:
            raise ValueError("as_of must include a timezone")
        timestamps = [item.observed_at for item in self.observations]
        if timestamps != sorted(timestamps) or len(set(timestamps)) != len(timestamps):
            raise ValueError("observations must be strictly ordered by observed_at")
        if any(item.available_at > self.as_of for item in self.observations):
            raise ValueError(
                "an observation is not available in the requested as_of world"
            )
        return self


class StatArbSearchRequest(BaseModel):
    as_of: datetime
    observed_at: list[datetime] = Field(min_length=160, max_length=5_000)
    available_at: list[datetime] = Field(min_length=160, max_length=5_000)
    securities: list[StatArbSecurity] = Field(min_length=2, max_length=200)
    time_unit: Literal["minute", "hour", "day"] = "day"
    price_transform: Literal["log", "level"] = "log"
    discovery_fraction: float = Field(default=0.40, ge=0.30, le=0.55)
    train_fraction: float = Field(default=0.72, ge=0.60, le=0.85)
    correction_level: float = Field(default=0.05, gt=0, le=0.20)
    max_ou_fits: int = Field(default=64, ge=1, le=256)
    source: str = Field(default="source-supplied", min_length=1, max_length=120)
    revision: str = Field(default="unversioned", min_length=1, max_length=120)
    execution_evidence: dict[str, PairExecutionEvidence] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_aligned_universe(self) -> "StatArbSearchRequest":
        if self.as_of.tzinfo is None:
            raise ValueError("as_of must include a timezone")
        count = len(self.observed_at)
        if len(self.available_at) != count:
            raise ValueError("observed_at and available_at must have equal length")
        if any(len(security.prices) != count for security in self.securities):
            raise ValueError("every price series must match the shared timestamp count")
        symbols = [security.symbol.upper() for security in self.securities]
        if len(symbols) != len(set(symbols)):
            raise ValueError("security symbols must be unique")
        return self


def _artifact_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _fit_payload(request: OUFitRequest) -> dict[str, Any]:
    selection_timestamp = (
        request.selection_timestamp or request.observations[0].observed_at
    )
    ledger = HypothesisLedger(
        hypotheses_considered=request.hypothesis_count,
        selection_procedure=request.selection_procedure,
        selection_timestamp=selection_timestamp,
        selection_metric=request.selection_metric,
        holdout_untouched=request.holdout_untouched,
        multiplicity_adjustment=request.multiplicity_adjustment,
    )
    try:
        artifact = certify_ou(
            [item.value for item in request.observations],
            observable=request.observable,
            observed_at=[item.observed_at for item in request.observations],
            available_at=[item.available_at for item in request.observations],
            as_of=request.as_of,
            time_unit=request.time_unit,
            train_fraction=request.train_fraction,
            hypothesis_ledger=ledger,
            source=request.source,
            revision=request.revision,
            execution_survival=request.execution_survival,
        )
    except DynamicsInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    payload = artifact.to_dict()
    payload.update(
        {
            "experiment": {
                "name": request.experiment_name,
                "observable": request.observable,
                "evidence_scope": request.source,
            },
            "world": {
                "world_hash": artifact.world_hash,
                "as_of": request.as_of.isoformat(),
                "time_unit": request.time_unit,
                "point_in_time_enforced": True,
                "observations": len(request.observations),
                "source": request.source,
                "revision": request.revision,
            },
            "hypothesis": {
                "question": f"Does {request.observable} exhibit forecast-useful mean reversion?",
                "mapping": f"X_t := {request.observable}",
                "target": "one-step conditional distribution",
            },
        }
    )
    payload["artifact_hash"] = _artifact_hash(payload)
    return payload


@router.post("/fit/ou")
def fit_ornstein_uhlenbeck(request: OUFitRequest) -> dict[str, Any]:
    """Fit, forecast, score, falsify, and compare an OU market theory."""

    return _fit_payload(request)


@router.get("/experiments/reference-ou")
def reference_ou_experiment() -> dict[str, Any]:
    """Return a reproducible irregular-time calibration run for the Lab UI."""

    pattern = (0.25, 0.5, 1.0, 1.75, 3.0, 0.75, 2.0)
    delta_times = [pattern[index % len(pattern)] for index in range(179)]
    values = generate_exact_ou(delta_times, seed=212)
    start = datetime(2025, 1, 2, 21, 0, tzinfo=timezone.utc)
    observed_at = [start]
    for delta_time in delta_times:
        observed_at.append(observed_at[-1] + timedelta(days=delta_time))
    observations = [
        DynamicsObservation(
            value=value,
            observed_at=timestamp,
            available_at=timestamp + timedelta(minutes=15),
        )
        for value, timestamp in zip(values, observed_at)
    ]
    request = OUFitRequest(
        experiment_name="OU irregular-time calibration control 001",
        observable="synthetic residual (dimensionless)",
        as_of=observations[-1].available_at,
        time_unit="day",
        hypothesis_count=1,
        selection_procedure="frozen exact-OU calibration protocol",
        selection_timestamp=start - timedelta(days=1),
        holdout_untouched=True,
        source="controlled-synthetic",
        revision="d0.1-reference-1",
        observations=observations,
    )
    payload = _fit_payload(request)
    payload["experiment"].update(
        {
            "id": "dyn-d01-ou-control-001",
            "seed": 212,
            "market_claim_eligible": False,
        }
    )
    payload["decision_summary"] = (
        "OU survives the scientific and predictive controls; synthetic evidence and "
        "unmeasured execution force MARKET CLAIM ABSTAIN."
    )
    payload["market_claim_eligible"] = False
    payload["final_market_claim"] = "ABSTAIN"
    payload["artifact_hash"] = _artifact_hash(
        {key: value for key, value in payload.items() if key != "artifact_hash"}
    )
    return payload


@router.get("/certification/ou")
def ou_certification_suite() -> dict[str, object]:
    """Run the frozen OU success/failure controls and expose false accepts."""

    return run_ou_certification_suite()


@router.post("/stat-arb/search")
def search_statistical_arbitrage(request: StatArbSearchRequest) -> dict[str, Any]:
    """Search an entire PIT pair family before certifying selected residuals."""

    try:
        return selection_aware_pair_search(
            {security.symbol: security.prices for security in request.securities},
            observed_at=request.observed_at,
            available_at=request.available_at,
            as_of=request.as_of,
            time_unit=request.time_unit,
            price_transform=request.price_transform,
            discovery_fraction=request.discovery_fraction,
            train_fraction=request.train_fraction,
            correction_level=request.correction_level,
            max_ou_fits=request.max_ou_fits,
            source=request.source,
            revision=request.revision,
            execution_evidence={
                pair_id.upper(): evidence.model_dump()
                for pair_id, evidence in request.execution_evidence.items()
            },
        )
    except StatArbInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/experiments/reference-stat-arb")
def reference_stat_arb_experiment() -> dict[str, Any]:
    """Return a frozen universe with one selection-aware OU spread survivor."""

    return generate_stat_arb_reference()


@router.get("/power/ou")
def ou_power_map(
    repetitions: int = Query(default=6, ge=2, le=50),
) -> dict[str, Any]:
    """Estimate a deterministic pilot power map for the OU verifier."""

    return run_ou_power_map(repetitions)


@router.post("/fit/nonlinear")
def fit_nonlinear_hierarchy(request: NonlinearFitRequest) -> dict[str, Any]:
    """Fit M0-M3 with nested pre-holdout complexity selection."""

    try:
        payload = fit_nonlinear_dynamics(
            [item.value for item in request.observations],
            observable=request.observable,
            observed_at=[item.observed_at for item in request.observations],
            available_at=[item.available_at for item in request.observations],
            as_of=request.as_of,
            time_unit=request.time_unit,
            train_fraction=request.train_fraction,
            source=request.source,
            revision=request.revision,
            execution_evidence=(
                request.execution_evidence.model_dump()
                if request.execution_evidence is not None
                else None
            ),
            bootstrap_repetitions=request.bootstrap_repetitions,
        )
    except NonlinearDynamicsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    payload["experiment"]["name"] = request.experiment_name
    payload["artifact_hash"] = _artifact_hash(
        {key: value for key, value in payload.items() if key != "artifact_hash"}
    )
    return payload


@router.get("/experiments/reference-nonlinear")
def reference_nonlinear_experiment() -> dict[str, Any]:
    """Extend the exact frozen D0.2.1 survivor through the D0.3 hierarchy."""

    try:
        return generate_nonlinear_reference()
    except NonlinearDynamicsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/certification/nonlinear")
def nonlinear_certification_suite(
    repetitions: int = Query(default=2, ge=1, le=12),
) -> dict[str, Any]:
    """Measure D0.3 theory selection, false basins, and abstention on controls."""

    try:
        return run_nonlinear_certification_suite(repetitions)
    except NonlinearDynamicsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/certification/nonlinear-identifiability")
def nonlinear_identifiability_artifact() -> dict[str, Any]:
    """Return the byte-frozen D0.3.1 power and identifiability frontier."""

    try:
        return load_frozen_identifiability_artifact()
    except IdentifiabilityError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/certification/estimator-tournament")
def estimator_tournament_artifact() -> dict[str, Any]:
    """Return the frozen D0.3.2 same-world estimator tournament."""

    try:
        return load_frozen_estimator_tournament()
    except EstimatorTournamentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/certification/failure-decomposition")
def failure_decomposition_artifact() -> dict[str, Any]:
    """Return the frozen D0.3.2.1 oracle ceiling and failure decomposition."""

    try:
        return load_frozen_failure_decomposition()
    except FailureDecompositionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/certification/targeted-recovery")
def targeted_recovery_artifact() -> dict[str, Any]:
    """Return the frozen D0.3.3 targeted nonlinear recovery result."""

    try:
        return load_frozen_targeted_recovery()
    except TargetedRecoveryError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
