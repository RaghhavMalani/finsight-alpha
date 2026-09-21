"""Framework-neutral contracts for every Dynamics Lab market theory.

These contracts separate fitting, forecasting, scoring, falsification, and
baseline comparison. A theory adapter may use any numerical framework, but it
must emit the same public artifact before Forge can reason about its evidence.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Mapping, Protocol, Sequence, runtime_checkable


class ScientificVerdict(str, Enum):
    ACCEPT = "ACCEPT"
    REJECT = "REJECT"
    ABSTAIN = "ABSTAIN"


class CheckStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_MEASURED = "NOT_MEASURED"


@dataclass(frozen=True)
class TimeWindow:
    start: datetime
    end: datetime
    start_index: int
    end_index: int
    observations: int
    elapsed_time: float
    time_unit: str


@dataclass(frozen=True)
class TheoryWorld:
    world_hash: str
    as_of: datetime
    observable: str
    values: tuple[float, ...]
    observed_at: tuple[datetime, ...]
    available_at: tuple[datetime, ...]
    time_unit: str
    point_in_time_enforced: bool
    source: str
    revision: str


@dataclass(frozen=True)
class HypothesisLedger:
    hypotheses_considered: int
    selection_procedure: str
    selection_timestamp: datetime
    selection_metric: str
    holdout_untouched: bool
    multiplicity_adjustment: str | None = None


@dataclass(frozen=True)
class DiscoveryLedger:
    discovery_run_id: str
    world_hash: str
    as_of: datetime
    search_universe: tuple[str, ...]
    eligible_securities: int
    candidate_pairs: int
    pairs_screened: int
    cointegrated_candidates: int
    ou_candidates: int
    ou_fits_completed: int
    certified: int
    economic_survivors: int
    selection_timestamp: datetime
    selection_metric: str
    cointegration_test: str
    correction_method: str
    correction_level: float
    screen_window: TimeWindow
    hedge_ratio_window: TimeWindow
    holdout_window: TimeWindow


@dataclass(frozen=True)
class TheoryFit:
    theory: str
    parameters: Mapping[str, float | None]
    parameter_uncertainty: Mapping[str, Mapping[str, float | None]]
    identifiable: bool
    train_window: TimeWindow
    train_log_likelihood: float
    aic: float
    bic: float
    optimizer: Mapping[str, Any]
    residual_diagnostics: Mapping[str, float | None]
    state: Mapping[str, Any] = field(repr=False, compare=False, default_factory=dict)


@dataclass(frozen=True)
class ForecastHorizon:
    origin_values: tuple[float, ...]
    delta_times: tuple[float, ...]
    target_times: tuple[datetime, ...]


@dataclass(frozen=True)
class ForecastPoint:
    target_time: datetime
    delta_time: float
    mean: float
    variance: float
    lower_90: float
    upper_90: float


@dataclass(frozen=True)
class ForecastDistribution:
    target: str
    points: tuple[ForecastPoint, ...]


@dataclass(frozen=True)
class SealedHoldout:
    window: TimeWindow
    values: tuple[float, ...]


@dataclass(frozen=True)
class TheoryScore:
    negative_log_likelihood: float
    log_likelihood: float
    rmse: float
    mae: float
    coverage_90: float
    interval_score_90: float
    observations: int


@dataclass(frozen=True)
class BaselineScore:
    theory: str
    role: str
    complexity: str
    parameters: int
    score: TheoryScore


@dataclass(frozen=True)
class FalsificationCheck:
    code: str
    status: CheckStatus
    message: str
    critical: bool
    details: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TheoryEvidence:
    world: TheoryWorld
    holdout: SealedHoldout
    score: TheoryScore
    hypothesis_ledger: HypothesisLedger


@dataclass(frozen=True)
class FalsificationReport:
    checks: tuple[FalsificationCheck, ...]
    structural_stability: Mapping[str, float | bool | None]
    scientific_verdict: ScientificVerdict
    explanation: str


@dataclass(frozen=True)
class TheoryComparison:
    best_baseline: str
    best_baseline_loss: float
    theory_loss: float
    delta_baseline: float
    winner: str
    predictive_verdict: ScientificVerdict
    explanation: str


@dataclass(frozen=True)
class TheoryArtifact:
    schema_version: str
    theory: str
    equation: str
    observable: str
    world_hash: str
    as_of: datetime
    train_window: TimeWindow
    holdout_window: TimeWindow
    parameters: Mapping[str, float | None]
    parameter_uncertainty: Mapping[str, Mapping[str, float | None]]
    identifiability: Mapping[str, Any]
    forecast_distribution: ForecastDistribution
    holdout_score: TheoryScore
    baseline_scores: tuple[BaselineScore, ...]
    comparison: TheoryComparison
    structural_stability: Mapping[str, float | bool | None]
    falsification_checks: tuple[FalsificationCheck, ...]
    hypothesis_ledger: HypothesisLedger
    scientific_verdict: ScientificVerdict
    predictive_verdict: ScientificVerdict
    economic_verdict: ScientificVerdict
    final_market_claim: ScientificVerdict
    market_claim_eligible: bool
    decision_summary: str
    series: tuple[Mapping[str, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        return _jsonable(asdict(self))


def _jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items() if key != "state"}
    if isinstance(value, (tuple, list)):
        return [_jsonable(item) for item in value]
    return value


@runtime_checkable
class MarketTheory(Protocol):
    """The minimum behavioral surface required for a theory adapter."""

    name: str
    equation: str

    def fit(self, world: TheoryWorld, train_window: TimeWindow) -> TheoryFit: ...

    def forecast(
        self, fit: TheoryFit, horizon: ForecastHorizon
    ) -> ForecastDistribution: ...

    def score(
        self, forecast: ForecastDistribution, sealed_holdout: SealedHoldout
    ) -> TheoryScore: ...

    def falsify(
        self, fit: TheoryFit, evidence: TheoryEvidence
    ) -> FalsificationReport: ...

    def compare(
        self, score: TheoryScore, baselines: Sequence[BaselineScore]
    ) -> TheoryComparison: ...
