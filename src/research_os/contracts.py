"""Strict, content-addressed scientific objects. Receipts are separate objects."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, JsonValue, model_validator

from src.eval.canonical import canonical_json_bytes, canonical_sha256

Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Commit = Annotated[str, Field(pattern=r"^[a-f0-9]{40}$")]
Text = Annotated[str, Field(min_length=1)]


def utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamp needs a timezone")
    return parsed.astimezone(timezone.utc)


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)
    schema_version: Literal["research-os/0.1"] = "research-os/0.1"

    @model_validator(mode="after")
    def finite_json(self):
        canonical_json_bytes(self.model_dump(mode="json"))
        return self

    @property
    def identity(self) -> str:
        return canonical_sha256(self.model_dump(mode="json"))


class Verdict(str, Enum):
    SUPPORTED = "SUPPORTED"
    NOT_SUPPORTED = "NOT_SUPPORTED"
    INCONCLUSIVE = "INCONCLUSIVE"
    UNAVAILABLE = "UNAVAILABLE"


class Scorecard(Contract):
    STATISTICAL: Verdict
    ECONOMIC: Verdict
    REGIME_DEPENDENCE: Verdict
    CROSS_MARKET: Verdict
    reasons: tuple[Text, ...]


class Anchor(Contract):
    page: int = Field(ge=1)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    excerpt: Text

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start or self.end - self.start != len(self.excerpt):
            raise ValueError("Anchor offsets do not match excerpt")
        return self


class PaperClaim(Contract):
    kind: Literal["METHOD", "SAMPLE", "VARIABLE", "EQUATION", "RESULT", "LIMITATION"]
    statement: Text
    anchor: Anchor
    reported_value: FiniteFloat | None = None
    unit: Text | None = None


class Paper(Contract):
    title: Text
    authors: tuple[Text, ...] = Field(min_length=1)
    source_url: Text
    source_sha256: Digest
    extraction_status: Literal["EXTRACTED", "UNAVAILABLE"]
    pages: tuple[Text, ...] = ()
    claims: tuple[PaperClaim, ...] = ()
    original_data: Text | None = None
    original_seed: int | None = None
    original_ci: tuple[FiniteFloat, FiniteFloat] | None = None
    limitations: tuple[Text, ...] = ()
    parent: Digest | None = None

    @model_validator(mode="after")
    def anchored(self):
        if self.extraction_status == "UNAVAILABLE" and (self.pages or self.claims):
            raise ValueError("Unavailable extraction cannot carry invented evidence")
        for claim in self.claims:
            a = claim.anchor
            if a.page > len(self.pages) or self.pages[a.page - 1][a.start:a.end] != a.excerpt:
                raise ValueError("Paper claim lacks matching page evidence")
            if claim.reported_value is not None and (not claim.unit or str(claim.reported_value) not in a.excerpt):
                raise ValueError("Reported numeric claim must be explicitly anchored with units")
        return self


class Hypothesis(Contract):
    name: Text
    null: Text
    alternative: Text
    direction: Literal["greater", "less", "two-sided"]
    universe: tuple[Text, ...] = Field(min_length=1)
    dependent: Text
    independent: tuple[Text, ...] = Field(min_length=1)
    controls: tuple[Text, ...]
    primary_endpoint: Text
    falsification: tuple[Text, ...] = Field(min_length=1)
    paper: Digest | None = None
    interpretation: Literal["RESEARCHER_EXTENSION", "PAPER_REPLICATION"]
    parent: Digest | None = None

    @model_validator(mode="after")
    def no_target(self):
        if self.dependent in (*self.independent, *self.controls):
            raise ValueError("Target cannot be a feature/control")
        if len(set(self.independent)) != len(self.independent):
            raise ValueError("Duplicate independent variables")
        return self


class DatasetSnapshot(Contract):
    country: Literal["US", "INDIA", "SYNTHETIC"]
    label: Text
    content_sha256: Digest
    source_sha256: tuple[Digest, ...] = Field(min_length=1)
    source_urls: tuple[Text, ...] = Field(min_length=1)
    source_available_at: Text
    latest_observation: Text
    input_cutoff: Text
    evidence_mode: Literal["CAPTURE_ONLY", "PIT", "SYNTHETIC"]
    vintage_receipts: tuple[Digest, ...] = ()
    disclosure: Text

    @model_validator(mode="after")
    def clocks(self):
        if not utc(self.latest_observation) <= utc(self.source_available_at) <= utc(self.input_cutoff):
            raise ValueError("Observation/availability/cutoff mismatch")
        if self.evidence_mode == "PIT" and not self.vintage_receipts:
            raise ValueError("PIT requires historical vintage receipts")
        return self


class FeatureDefinition(Contract):
    name: Text
    sources: tuple[Text, ...] = Field(min_length=1)
    formula: Text
    lag_months: int = Field(ge=1)
    lookback_months: int = Field(ge=1)
    clock: Literal["OBSERVATION_SEQUENCE_FIXED_VINTAGE", "PIT"]


class Split(Contract):
    train_start: Text
    train_end: Text
    validation_start: Text
    validation_end: Text
    holdout_start: Text
    holdout_end: Text
    purge_months: int = Field(ge=1)
    embargo_months: int = Field(ge=1)
    clock: Literal["OBSERVATION_SEQUENCE_FIXED_VINTAGE", "PIT"]

    @model_validator(mode="after")
    def disjoint(self):
        import pandas as pd
        bounds = [pd.Period(v, freq="M").ordinal for v in (
            self.train_start, self.train_end, self.validation_start,
            self.validation_end, self.holdout_start, self.holdout_end)]
        a, b, c, d, e, f = bounds
        if not a <= b < c <= d < e <= f:
            raise ValueError("Split contamination or unordered bounds")
        if c - b <= self.purge_months or e - d <= self.embargo_months:
            raise ValueError("Missing purge/embargo gap")
        return self


class TestDefinition(Contract):
    method: Literal["HAC", "WELCH", "PAIRED", "BOOTSTRAP", "BLOCK_BOOTSTRAP", "PERMUTATION"]
    alternative: Literal["greater", "less", "two-sided"]
    alpha: FiniteFloat = Field(gt=0, lt=1)
    hac_lags: int = Field(ge=0)
    block_length: int = Field(ge=1)
    resamples: int = Field(ge=99)
    assumptions: tuple[Text, ...] = Field(min_length=1)


class CostModel(Contract):
    name: Text
    scope: Literal["HYPOTHETICAL_FACTOR_SENSITIVITY", "INVESTABLE"]
    commission_bps: FiniteFloat = Field(ge=0)
    spread_bps: FiniteFloat = Field(ge=0)
    statutory_bps: FiniteFloat = Field(ge=0)
    frontier_bps: tuple[FiniteFloat, ...] = Field(min_length=1)
    rationale: Text
    statutory_source: Text | None = None

    @model_validator(mode="after")
    def cost_scope(self):
        if any(x < 0 for x in self.frontier_bps) or tuple(sorted(set(self.frontier_bps))) != self.frontier_bps:
            raise ValueError("Cost frontier must be ordered, distinct and nonnegative")
        if self.scope == "INVESTABLE" and not self.statutory_source:
            raise ValueError("Investable cost claim requires source-specific costs")
        return self


class TestingFamily(Contract):
    name: Text
    trial_ids: tuple[Text, ...] = Field(min_length=1)
    corrections: tuple[Literal["HOLM", "BH"], ...] = ("HOLM", "BH")
    independent_trials: int | None = Field(default=None, ge=1)
    dependence_disclosure: Text

    @model_validator(mode="after")
    def complete(self):
        if len(set(self.trial_ids)) != len(self.trial_ids):
            raise ValueError("Duplicate trials")
        if self.independent_trials is not None and self.independent_trials > len(self.trial_ids):
            raise ValueError("Independent trials exceed counted trials")
        return self


class Preregistration(Contract):
    hypothesis: Hypothesis
    datasets: tuple[DatasetSnapshot, ...] = Field(min_length=1)
    features: tuple[FeatureDefinition, ...] = Field(min_length=1)
    splits: tuple[Split, ...] = Field(min_length=1)
    tests: tuple[TestDefinition, ...] = Field(min_length=1)
    costs: tuple[CostModel, ...] = Field(min_length=1)
    family: TestingFamily
    seeds: tuple[int, ...] = Field(min_length=1)
    parameters: dict[str, JsonValue]
    acceptance: Text
    minimum_effect: FiniteFloat = Field(gt=0)
    prospective_sigma: FiniteFloat = Field(gt=0)

    @model_validator(mode="after")
    def coherent(self):
        if len(self.datasets) != len(self.splits) or len(self.datasets) != len(self.costs):
            raise ValueError("Each dataset needs its own split and cost model")
        for dataset, split in zip(self.datasets, self.splits):
            if dataset.evidence_mode == "CAPTURE_ONLY" and split.clock != "OBSERVATION_SEQUENCE_FIXED_VINTAGE":
                raise ValueError("Revised capture cannot masquerade as historical PIT")
        if any(f.name == self.hypothesis.dependent or self.hypothesis.dependent in f.sources for f in self.features):
            raise ValueError("Target-as-feature")
        return self


class FreezeReceipt(Contract):
    preregistration_hash: Digest
    frozen_at: Text
    code_commit: Commit
    @model_validator(mode="after")
    def clock(self):
        utc(self.frozen_at)
        return self


class Run(Contract):
    hypothesis_hash: Digest
    preregistration_hash: Digest
    freeze_receipt_hash: Digest
    code_commit: Commit
    code_sha256: Digest
    dataset_hashes: tuple[Digest, ...] = Field(min_length=1)
    split_hashes: tuple[Digest, ...] = Field(min_length=1)
    test_hashes: tuple[Digest, ...] = Field(min_length=1)
    seed: int
    trial_id: Text
    parameters: dict[str, JsonValue]
    environment: dict[str, JsonValue]


class StatisticalResult(Contract):
    status: Literal["AVAILABLE", "UNAVAILABLE"]
    method: Text
    estimate: FiniteFloat | None = None
    ci_lower: FiniteFloat | None = None
    ci_upper: FiniteFloat | None = None
    p_value: FiniteFloat | None = Field(default=None, ge=0, le=1)
    n: int = Field(ge=0)
    unit: Text
    assumptions: tuple[Text, ...]
    reason: Text | None = None

    @model_validator(mode="after")
    def available(self):
        values = (self.estimate, self.ci_lower, self.ci_upper, self.p_value)
        if self.status == "AVAILABLE" and (any(v is None for v in values) or self.n < 2):
            raise ValueError("Available inference requires estimate, CI, p and sample")
        if self.status == "UNAVAILABLE" and (not self.reason or any(v is not None for v in values)):
            raise ValueError("Unavailable inference requires reason, no invented estimate")
        if self.ci_lower is not None and self.ci_lower > self.ci_upper:
            raise ValueError("Unordered CI")
        return self


class Artifact(Contract):
    run_hash: Digest
    payload_sha256: Digest
    media_type: Literal["application/json", "text/markdown"]
    source_urls: tuple[Text, ...]
    licence_status: Literal["LOCAL_ONLY", "PUBLISH_DERIVED"]
    evidence_mode: Literal["CAPTURE_ONLY", "PIT", "SYNTHETIC"]


class Replication(Contract):
    kind: Literal["ORIGINAL", "EXACT", "CLOSE", "TEMPORAL", "CROSS_MARKET"]
    original_run: Digest | None
    replication_run: Digest | None
    status: Verdict
    effect: StatisticalResult | None
    differences: tuple[Text, ...]
    reason: Text


OBJECT_TYPES = {c.__name__: c for c in (Paper, Hypothesis, DatasetSnapshot, FeatureDefinition,
    Split, TestDefinition, CostModel, TestingFamily, Preregistration, FreezeReceipt, Run,
    StatisticalResult, Artifact, Replication, Scorecard)}
