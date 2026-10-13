"""Strict recursively closed risk contracts; no scientific computations."""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import math
import re
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

BASE = "16db82c5f2f50b98253df9989c586cd45aa98f6b"
CLAIM_NAMES = ("inference_certified", "market_claim_eligible", "causal_claim_eligible",
               "validated_alpha", "trusted_graph", "precise_edge_confidence")
CLAIMS = dict.fromkeys(CLAIM_NAMES, False)
Category = Literal["PORTFOLIO", "MODEL", "DATA", "RESEARCH_HYGIENE", "SIMULATOR", "SYSTEM"]
Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
EvidenceClass = Literal["REAL_RETAINED", "LOCAL_REAL", "LOCAL_PAPER_BOOK", "LOCAL_MODEL_ESTIMATE",
                        "EXAMPLE_PORTFOLIO", "RETAINED_SYNTHETIC", "SYNTHETIC_TEST_ONLY", "UNAVAILABLE"]
Availability = Literal["AVAILABLE", "PARTIAL", "UNAVAILABLE"]
Outcome = Literal["CLEAR", "FINDING", "NOT_EVALUATED"]
Currency = Literal["CURRENT", "HISTORICAL_ONLY", "UNCONFIRMED"]
Country = Literal["US", "INDIA", "CROSS_MARKET", "NONE"]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Identifier = Annotated[str, Field(min_length=1, max_length=240, pattern=r"^[A-Za-z0-9_.:/@|+-]+$")]
Text = Annotated[str, Field(min_length=1, max_length=600)]
Count = Annotated[int, Field(ge=0, le=2**53-1)]

def clock(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("Explicit UTC timestamp required")
    return datetime.fromisoformat(value[:-1] + "+00:00")

def utc(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def digest(value):
    return sha256(canonical(value)).hexdigest()

def decode(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite JSON")))

class Closed(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    @field_validator("*", mode="after")
    @classmethod
    def clocks_and_finite(cls, value, info):
        if info.field_name.endswith("_at") or info.field_name in {"evidence_cutoff", "evaluation_cutoff", "as_of"}:
            if value is not None:
                clock(value)
        if type(value) is float and not math.isfinite(value):
            raise ValueError("Nonfinite value")
        return value

class ClaimFlags(Closed):
    inference_certified: Literal[False]
    market_claim_eligible: Literal[False]
    causal_claim_eligible: Literal[False]
    validated_alpha: Literal[False]
    trusted_graph: Literal[False]
    precise_edge_confidence: Literal[False]

    @field_validator("*", mode="before")
    @classmethod
    def literal_false(cls, value):
        if type(value) is not bool or value is not False:
            raise ValueError("Scientific claim promotion/coercion")
        return value

class Scope(Closed):
    kind: Literal["PUBLIC_PLATFORM", "MODEL", "SOURCE", "RESEARCH_FAMILY", "PORTFOLIO", "SIMULATOR_COMPARISON"]
    subject_id: Identifier
    evidence_family: Identifier
    stable_scope_key: Identifier

class ReplayRef(Closed):
    type: Literal["REPLAY_ARTIFACT"]
    artifact_id: Identifier
    kind: Identifier
    sha256: Digest
    bytes: Count
    as_of: str
    available_at: str
    selector_id: Identifier
    source_ids: list[Identifier]
    run_id: Digest | None

class FileRef(Closed):
    type: Literal["FROZEN_FILE"]
    commit: Literal[BASE]
    path_id: Identifier
    sha256: Digest
    bytes: Count
    selector_id: Identifier
    assertion_id: Identifier

class ObservationRef(Closed):
    type: Literal["RISK_OBSERVATION"]
    observation_id: Digest
    sweep_fingerprint: Digest

class PolicyRef(Closed):
    type: Literal["POLICY_ASSERTION"]
    policy_sha256: Digest
    check_id: Identifier

EvidenceRef = Annotated[ReplayRef | FileRef | ObservationRef | PolicyRef, Field(discriminator="type")]

class SourceQuality(Closed):
    clock_quality: Literal["PUBLICATION_TIMESTAMP", "RECEIVE_TIMESTAMP_CAPTURED", "CONSERVATIVE_MARKET_TIME",
                           "CONSERVATIVE_VINTAGE_DAY", "CAPTURE_ONLY", "NOT_APPLICABLE", "UNAVAILABLE"]
    lineage_status: Literal["VERIFIED", "PARTIAL", "UNAVAILABLE", "INVALID"]
    permission_status: Literal["DERIVED_ALLOWED", "METADATA_ONLY", "LOCAL_ONLY", "UNAVAILABLE"]
    limitation_codes: list[Identifier]

class Remediation(Closed):
    state: Literal["REQUIRED", "BLOCKED_EXTERNAL", "DEFERRED", "INFORMATIONAL"]
    requirement_code: Identifier
    text: Text
    evidence_required: list[Identifier]

class Origin(Closed):
    id: Digest
    source: Identifier
    kind: Identifier
    severity: Severity
    status: Literal["OPEN", "RESOLVED"]
    reason: Text
    first_seen_at: str | None
    last_seen_at: str | None
    occurrences: Count
    evidence: list[Identifier]

class Assertion(Closed):
    assertion_id: Identifier
    outcome: Outcome
    unit: Literal["status", "boolean", "observations", "calendar_days", "pairs", "test_slots", "events"]
    value: str | bool | int | float | None
    comparison: Literal["EXACT", "GT", "LT", "IN", "REQUIRED", "NONE"]
    threshold: str | bool | int | float | None

    @field_validator("value", "threshold")
    @classmethod
    def scalar(cls, value):
        if type(value) is float and not math.isfinite(value):
            raise ValueError("Nonfinite scalar")
        if isinstance(value, str) and (len(value) > 120 or not re.fullmatch(r"[A-Za-z0-9_.: /|+<>=-]+", value)):
            raise ValueError("Unreviewed assertion scalar")
        return value

class Coverage(Closed):
    schema_version: Literal["risk-coverage/1"]
    check_id: Identifier
    category: Category
    scope: Scope
    availability: Availability
    outcome: Outcome
    reason_code: Identifier | None
    reason: Text
    evidence_class: EvidenceClass
    evaluated_at: str
    evidence_at: str | None
    evidence_refs: Annotated[list[EvidenceRef], Field(min_length=1, max_length=30)]
    remediation: Remediation

class Observation(Closed):
    schema_version: Literal["risk-observation/1"]
    observation_id: Digest
    issue_id: Identifier
    rule_id: Identifier
    rule_version: Literal[1]
    category: Category
    severity: Severity
    scope: Scope
    country: Country
    asset: Identifier | None
    model: Identifier | None
    title: Annotated[str, Field(min_length=1, max_length=120)]
    reason_code: Identifier | None
    reason: Text
    outcome: Outcome
    currency: Currency
    availability: Availability
    evidence_class: EvidenceClass
    evidence_at: str | None
    evidence_cutoff: str
    witnessed_at: str
    policy_sha256: Digest
    fingerprint: Digest
    previous_observation_id: Digest | None
    evidence_refs: Annotated[list[EvidenceRef], Field(min_length=1, max_length=30)]
    source_quality: SourceQuality
    remediation: Remediation
    origin_records: Annotated[list[Origin], Field(max_length=100)]
    assertions: Annotated[list[Assertion], Field(max_length=8)]

    @model_validator(mode="after")
    def chronology(self):
        if clock(self.witnessed_at) < clock(self.evidence_cutoff):
            raise ValueError("Detection precedes evidence cutoff")
        if self.evidence_at and clock(self.evidence_at) > clock(self.evidence_cutoff):
            raise ValueError("Future evidence")
        if self.outcome != "CLEAR" and not self.reason_code:
            raise ValueError("Finding/absence needs reason")
        return self

class Issue(Closed):
    schema_version: Literal["risk-issue/1"]
    issue_id: Identifier
    rule_id: Identifier
    rule_version: Literal[1]
    category: Category
    severity: Severity
    status: Literal["OPEN", "RESOLVED"]
    currency: Currency
    availability: Availability
    evidence_class: EvidenceClass
    scope: Scope
    country: Country
    asset: Identifier | None
    model: Identifier | None
    title: Annotated[str, Field(min_length=1, max_length=120)]
    reason_code: Identifier
    reason: Text
    first_seen_at: str
    first_seen_ref: ObservationRef
    evidence_at: str | None
    evidence_cutoff: str
    resolved_at: str | None
    resolution_ref: ObservationRef | None
    occurrences: Annotated[int, Field(ge=1, le=2**53-1)]
    observation_ids: Annotated[list[Digest], Field(min_length=1, max_length=100)]
    evidence_refs: Annotated[list[EvidenceRef], Field(min_length=1, max_length=30)]
    source_quality: SourceQuality
    remediation: Remediation
    claim_flags: ClaimFlags
    origin_records: Annotated[list[Origin], Field(max_length=100)]
    last_observation_id: Digest
    policy_sha256: Digest

    @model_validator(mode="after")
    def lifecycle(self):
        if self.evidence_at and clock(self.evidence_at) > clock(self.evidence_cutoff):
            raise ValueError("Future Issue evidence")
        if self.status == "OPEN" and (self.resolved_at is not None or self.resolution_ref is not None):
            raise ValueError("Open Issue has resolution")
        if self.status == "RESOLVED" and (self.resolved_at is None or self.resolution_ref is None):
            raise ValueError("Resolution needs positive proof")
        if self.resolved_at and clock(self.resolved_at) < clock(self.first_seen_at):
            raise ValueError("Backdated resolution")
        if len(set(self.observation_ids)) != len(self.observation_ids):
            raise ValueError("Duplicate Issue observation")
        return self

class Transition(Closed):
    issue_id: Identifier
    transition: Literal["NEW", "UNCHANGED", "UPDATED", "RESOLVED"]
    observation_id: Digest
    previous_observation_id: Digest | None
    at: str

class CountRow(Closed):
    partition: Literal["CURRENT_REAL", "HISTORICAL", "UNAVAILABLE", "SYNTHETIC", "RESOLVED"]
    category: Category
    severity: Severity
    count: Count

class RuleSpec(Closed):
    rule_id: Identifier
    rule_version: Literal[1]
    category: Category
    check_id: Identifier
    reason_codes: list[Identifier]
    severity: Severity
    predicate: Text
    unit: Identifier
    input_selectors: list[Identifier]
    inherited_policy: Identifier | None
    remediation: Text
    limitations: Text

class PolicyProjection(Closed):
    schema_version: Literal["risk-policy/1"]
    version: Literal["0.1"]
    sha256: Digest
    rules: list[RuleSpec]

class StatePayload(Closed):
    state_id: Digest
    sweep_fingerprint: Digest
    evaluation_cutoff: str
    policy: PolicyProjection
    issues: Annotated[list[Issue], Field(max_length=1000)]
    coverage: Annotated[list[Coverage], Field(min_length=1, max_length=1000)]
    counts: list[CountRow]
    evidence_index: list[EvidenceRef]
    historical_origin_counts: list[CountRow]
    prior_state_ref: Identifier | None

class Input(Closed):
    input_id: Identifier
    sha256: Digest
    bytes: Count

class OperationProofs(Closed):
    provider_captures: Literal[0]
    model_runs: Literal[0]
    plugin_runs: Literal[0]
    series_runs: Literal[0]
    factor_fits: Literal[0]
    research_attempts: Literal[0]
    holdout_openings: Literal[0]
    simulator_runs: Literal[0]
    before_inventory_sha256: Digest | None
    after_inventory_sha256: Digest | None
    forbidden_call_guard: Literal["ENFORCED"]

    @field_validator("provider_captures", "model_runs", "plugin_runs", "series_runs", "factor_fits",
                     "research_attempts", "holdout_openings", "simulator_runs", mode="before")
    @classmethod
    def exact_zero(cls, value):
        if type(value) is not int or value != 0:
            raise ValueError("Operation proof is not integer zero")
        return value

class TransitionCounts(Closed):
    new: Count
    unchanged: Count
    updated: Count
    resolved: Count

class HistoryEntry(Closed):
    sweep_id: Digest
    sweep_ref: Identifier
    state_ref: Identifier | None
    published_at: str
    status: Literal["SUCCEEDED", "PARTIAL", "FAILED"]

class Failure(Closed):
    reason_code: Literal["REQUIRED_READER_FAILED", "RULE_EVALUATION_FAILED", "PUBLICATION_FAILED",
                         "ARTIFACT_INTEGRITY_BREACH", "HISTORY_CHAIN_INVALID"]
    subsystem: Identifier
    issue: Issue
    last_valid_state_ref: Identifier | None
    attempt_id: Digest

class SweepPayload(Closed):
    sweep_id: Digest
    fingerprint: Digest
    status: Literal["SUCCEEDED", "PARTIAL", "FAILED"]
    prior_sweep_ref: Identifier | None
    state_ref: Identifier | None
    started_at: str
    completed_at: str
    published_at: str
    evaluation_cutoff: str
    inputs: list[Input]
    evaluator_source_hash: Digest
    policy_sha256: Digest
    observations: Annotated[list[Observation], Field(max_length=1000)]
    transitions: Annotated[list[Transition], Field(max_length=1000)]
    transition_counts: TransitionCounts
    operation_proofs: OperationProofs
    history_index: Annotated[list[HistoryEntry], Field(max_length=20)]
    failure: Failure | None

    @model_validator(mode="after")
    def receipt(self):
        if not clock(self.started_at) <= clock(self.completed_at) <= clock(self.published_at):
            raise ValueError("Invalid sweep chronology")
        if clock(self.evaluation_cutoff) > clock(self.started_at):
            raise ValueError("Future evaluation cutoff")
        if (self.status == "FAILED") != (self.failure is not None):
            raise ValueError("Failure status/proof mismatch")
        if self.status != "FAILED" and self.state_ref is None:
            raise ValueError("Successful sweep has no state")
        if self.status == "FAILED" and self.transition_counts.resolved:
            raise ValueError("Failed sweep resolved Issues")
        if self.status != "FAILED" and (self.operation_proofs.before_inventory_sha256 is None or self.operation_proofs.before_inventory_sha256 != self.operation_proofs.after_inventory_sha256):
            raise ValueError("Retained evidence changed or is unverified during sweep")
        return self

class Licence(Closed):
    status: Literal["FIRST_PARTY"]
    permitted_uses: list[Literal["publish_derived"]]
    dataset_key: Literal["project:risk-manager-evidence"]
    valid_through: None

class StateEnvelope(Closed):
    schema_version: Literal["risk-state/1"]
    kind: Literal["risk-state"]
    input_hash: Digest
    evidence_cutoff: str
    published_at: str
    scope: Literal["RETAINED_RISK_EVIDENCE"]
    sources: list[Identifier]
    licence: Licence
    claim_flags: ClaimFlags
    payload: StatePayload

class SweepEnvelope(Closed):
    schema_version: Literal["risk-sweep/1"]
    kind: Literal["risk-sweep"]
    input_hash: Digest
    evidence_cutoff: str
    published_at: str
    scope: Literal["RETAINED_RISK_EVIDENCE"]
    sources: list[Identifier]
    licence: Licence
    claim_flags: ClaimFlags
    payload: SweepPayload

def partition(issue):
    if issue["status"] == "RESOLVED":
        return "RESOLVED"
    if issue["evidence_class"] in {"RETAINED_SYNTHETIC", "SYNTHETIC_TEST_ONLY"}:
        return "SYNTHETIC"
    if issue["evidence_class"] == "UNAVAILABLE":
        return "UNAVAILABLE"
    return "CURRENT_REAL" if issue["currency"] == "CURRENT" else "HISTORICAL"

def counts(issues):
    from collections import Counter
    result = Counter((partition(i), i["category"], i["severity"]) for i in issues)
    return [dict(partition=p, category=c, severity=s, count=n) for (p,c,s),n in sorted(result.items())]

def identity(observation):
    s = observation["scope"]
    return "risk-issue:" + digest(["risk-identity/1", observation["rule_id"], observation["rule_version"],
        observation["category"], s["kind"], s["subject_id"], s["evidence_family"], s["stable_scope_key"],
        observation["evidence_class"]])
