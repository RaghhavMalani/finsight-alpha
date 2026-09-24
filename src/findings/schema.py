"""Strict contracts exchanged by Forge research agents and verifiers.

These records intentionally contain no framework-specific message objects.  A
custom ReAct loop, Microsoft Agent Framework runtime, or future learned policy
can all emit the same :class:`ResearchFinding` and receive the same reward.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

from src.data.as_of import AsOfContext
from src.eval.canonical import canonical_sha256


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class FindingSchemaError(ValueError):
    """Raised when a research contract is incomplete or ambiguous."""


def _text(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise FindingSchemaError(f"{label} must be a non-empty string")
    return value.strip()


def _hash(value: Any, *, label: str) -> str:
    digest = _text(value, label=label).lower()
    if SHA256_PATTERN.fullmatch(digest) is None:
        raise FindingSchemaError(f"{label} must be a lowercase SHA-256 digest")
    return digest


def _finite(value: Any, *, label: str) -> float:
    if type(value) not in {int, float} or not math.isfinite(float(value)):
        raise FindingSchemaError(f"{label} must be a finite number")
    return float(value)


def _utc(value: Any, *, label: str) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise FindingSchemaError(f"{label} must be an ISO-8601 timestamp") from exc
    else:
        raise FindingSchemaError(f"{label} must be an ISO-8601 timestamp")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise FindingSchemaError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _sequence(value: Any, *, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise FindingSchemaError(f"{label} must be an array")
    return value


def _unique(values: Iterable[str], *, label: str) -> None:
    items = tuple(values)
    if len(items) != len(set(items)):
        raise FindingSchemaError(f"{label} values must be unique")


@dataclass(frozen=True)
class ResearchBudget:
    """Hard resource allowance attached to a research task."""

    max_tool_calls: int = 16
    max_compute_seconds: float = 60.0
    max_cost_usd: float = 1.0

    def __post_init__(self) -> None:
        if type(self.max_tool_calls) is not int or self.max_tool_calls < 0:
            raise FindingSchemaError("max_tool_calls must be an integer >= 0")
        compute = _finite(self.max_compute_seconds, label="max_compute_seconds")
        cost = _finite(self.max_cost_usd, label="max_cost_usd")
        if compute <= 0.0:
            raise FindingSchemaError("max_compute_seconds must be > 0")
        if cost < 0.0:
            raise FindingSchemaError("max_cost_usd must be >= 0")
        object.__setattr__(self, "max_compute_seconds", compute)
        object.__setattr__(self, "max_cost_usd", cost)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any] | None) -> "ResearchBudget":
        data = dict(value or {})
        allowed = {"max_tool_calls", "max_compute_seconds", "max_cost_usd"}
        if set(data) - allowed:
            raise FindingSchemaError(
                f"research budget has unknown fields: {sorted(set(data) - allowed)}"
            )
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {
            "max_tool_calls": self.max_tool_calls,
            "max_compute_seconds": self.max_compute_seconds,
            "max_cost_usd": self.max_cost_usd,
        }


@dataclass(frozen=True)
class ResearchTask:
    """Framework-independent research question evaluated in one frozen world."""

    task_id: str
    question: str
    as_of: AsOfContext
    seed: int = 0
    required_verifiers: tuple[str, ...] = (
        "temporal",
        "evidence",
        "numerical",
        "reproducibility",
    )
    budget: ResearchBudget = field(default_factory=ResearchBudget)

    def __post_init__(self) -> None:
        object.__setattr__(self, "task_id", _text(self.task_id, label="task_id"))
        object.__setattr__(self, "question", _text(self.question, label="question"))
        if not isinstance(self.as_of, AsOfContext):
            object.__setattr__(self, "as_of", AsOfContext.bind(self.as_of))
        if type(self.seed) is not int or self.seed < 0:
            raise FindingSchemaError("seed must be an integer >= 0")
        verifiers = tuple(
            _text(value, label="required verifier").lower()
            for value in self.required_verifiers
        )
        if not verifiers:
            raise FindingSchemaError("required_verifiers must not be empty")
        _unique(verifiers, label="required_verifiers")
        object.__setattr__(self, "required_verifiers", verifiers)
        if not isinstance(self.budget, ResearchBudget):
            raise FindingSchemaError("budget must be a ResearchBudget")

    @property
    def task_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ResearchTask":
        data = dict(value)
        required = {"task_id", "question", "as_of"}
        allowed = required | {"seed", "required_verifiers", "budget"}
        missing = required - set(data)
        unknown = set(data) - allowed
        if missing:
            raise FindingSchemaError(f"research task is missing fields: {sorted(missing)}")
        if unknown:
            raise FindingSchemaError(f"research task has unknown fields: {sorted(unknown)}")
        raw_verifiers = data.get(
            "required_verifiers",
            ("temporal", "evidence", "numerical", "reproducibility"),
        )
        if not isinstance(raw_verifiers, (list, tuple)):
            raise FindingSchemaError("required_verifiers must be an array")
        return cls(
            task_id=data["task_id"],
            question=data["question"],
            as_of=AsOfContext.bind(data["as_of"]),
            seed=data.get("seed", 0),
            required_verifiers=tuple(raw_verifiers),
            budget=ResearchBudget.from_dict(data.get("budget")),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "question": self.question,
            "as_of": self.as_of.isoformat,
            "seed": self.seed,
            "required_verifiers": list(self.required_verifiers),
            "budget": self.budget.to_dict(),
        }


@dataclass(frozen=True)
class EvidenceReference:
    """Reference to one immutable, availability-dated source observation."""

    evidence_id: str
    dataset: str
    snapshot_id: str
    content_hash: str
    observed_at: datetime
    available_from: datetime
    locator: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "evidence_id", _text(self.evidence_id, label="evidence_id"))
        object.__setattr__(self, "dataset", _text(self.dataset, label="dataset"))
        object.__setattr__(self, "snapshot_id", _hash(self.snapshot_id, label="snapshot_id"))
        object.__setattr__(self, "content_hash", _hash(self.content_hash, label="content_hash"))
        object.__setattr__(self, "observed_at", _utc(self.observed_at, label="observed_at"))
        object.__setattr__(
            self,
            "available_from",
            _utc(self.available_from, label="available_from"),
        )
        object.__setattr__(self, "locator", _text(self.locator, label="locator"))

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "EvidenceReference":
        data = dict(value)
        fields = {
            "evidence_id",
            "dataset",
            "snapshot_id",
            "content_hash",
            "observed_at",
            "available_from",
            "locator",
        }
        if set(data) != fields:
            raise FindingSchemaError(
                "evidence fields must be exactly "
                f"{sorted(fields)}; got {sorted(data)}"
            )
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "dataset": self.dataset,
            "snapshot_id": self.snapshot_id,
            "content_hash": self.content_hash,
            "observed_at": _iso(self.observed_at),
            "available_from": _iso(self.available_from),
            "locator": self.locator,
        }


@dataclass(frozen=True)
class NumericalClaim:
    """A finite result that a deterministic oracle can grade."""

    claim_id: str
    metric: str
    value: float
    unit: str
    evidence_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "claim_id", _text(self.claim_id, label="claim_id"))
        object.__setattr__(self, "metric", _text(self.metric, label="metric"))
        object.__setattr__(self, "value", _finite(self.value, label="claim value"))
        object.__setattr__(self, "unit", _text(self.unit, label="unit"))
        evidence_ids = tuple(
            _text(value, label="claim evidence_id") for value in self.evidence_ids
        )
        _unique(evidence_ids, label=f"claim {self.claim_id} evidence_ids")
        object.__setattr__(self, "evidence_ids", evidence_ids)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "NumericalClaim":
        data = dict(value)
        fields = {"claim_id", "metric", "value", "unit", "evidence_ids"}
        if set(data) != fields:
            raise FindingSchemaError(
                f"numerical claim fields must be exactly {sorted(fields)}"
            )
        return cls(
            claim_id=data["claim_id"],
            metric=data["metric"],
            value=data["value"],
            unit=data["unit"],
            evidence_ids=tuple(_sequence(data["evidence_ids"], label="evidence_ids")),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "claim_id": self.claim_id,
            "metric": self.metric,
            "value": self.value,
            "unit": self.unit,
            "evidence_ids": list(self.evidence_ids),
        }


@dataclass(frozen=True)
class ResearchArtifact:
    """Content-addressed experiment output and its independent replay hashes."""

    artifact_id: str
    content_hash: str
    replay_hashes: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "artifact_id", _text(self.artifact_id, label="artifact_id"))
        object.__setattr__(self, "content_hash", _hash(self.content_hash, label="content_hash"))
        hashes = tuple(_hash(value, label="replay_hash") for value in self.replay_hashes)
        object.__setattr__(self, "replay_hashes", hashes)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ResearchArtifact":
        data = dict(value)
        fields = {"artifact_id", "content_hash", "replay_hashes"}
        if set(data) != fields:
            raise FindingSchemaError(
                f"research artifact fields must be exactly {sorted(fields)}"
            )
        return cls(
            artifact_id=data["artifact_id"],
            content_hash=data["content_hash"],
            replay_hashes=tuple(_sequence(data["replay_hashes"], label="replay_hashes")),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "artifact_id": self.artifact_id,
            "content_hash": self.content_hash,
            "replay_hashes": list(self.replay_hashes),
        }


@dataclass(frozen=True)
class ResearchExperiment:
    """Reference from a finding to trusted sandbox replay attestations."""

    experiment_id: str
    manifest_hash: str
    execution_hashes: tuple[str, ...]
    artifact_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "experiment_id", _text(self.experiment_id, label="experiment_id")
        )
        object.__setattr__(
            self, "manifest_hash", _hash(self.manifest_hash, label="manifest_hash")
        )
        execution_hashes = tuple(
            _hash(value, label="execution_hash") for value in self.execution_hashes
        )
        if not execution_hashes:
            raise FindingSchemaError("execution_hashes must not be empty")
        object.__setattr__(self, "execution_hashes", execution_hashes)
        artifact_ids = tuple(
            _text(value, label="experiment artifact_id") for value in self.artifact_ids
        )
        _unique(artifact_ids, label=f"experiment {self.experiment_id} artifact_ids")
        object.__setattr__(self, "artifact_ids", artifact_ids)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ResearchExperiment":
        data = dict(value)
        fields = {
            "experiment_id",
            "manifest_hash",
            "execution_hashes",
            "artifact_ids",
        }
        if set(data) != fields:
            raise FindingSchemaError(
                f"research experiment fields must be exactly {sorted(fields)}"
            )
        return cls(
            experiment_id=data["experiment_id"],
            manifest_hash=data["manifest_hash"],
            execution_hashes=tuple(
                _sequence(data["execution_hashes"], label="execution_hashes")
            ),
            artifact_ids=tuple(_sequence(data["artifact_ids"], label="artifact_ids")),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "experiment_id": self.experiment_id,
            "manifest_hash": self.manifest_hash,
            "execution_hashes": list(self.execution_hashes),
            "artifact_ids": list(self.artifact_ids),
        }


@dataclass(frozen=True)
class ResearchFinding:
    """The only result object accepted by deterministic Forge verifiers."""

    finding_id: str
    hypothesis: str
    conclusion: str
    confidence: float
    evidence: tuple[EvidenceReference, ...] = ()
    claims: tuple[NumericalClaim, ...] = ()
    artifacts: tuple[ResearchArtifact, ...] = ()
    experiments: tuple[ResearchExperiment, ...] = ()
    limitations: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "finding_id", _text(self.finding_id, label="finding_id"))
        object.__setattr__(self, "hypothesis", _text(self.hypothesis, label="hypothesis"))
        object.__setattr__(self, "conclusion", _text(self.conclusion, label="conclusion"))
        confidence = _finite(self.confidence, label="confidence")
        if not 0.0 <= confidence <= 1.0:
            raise FindingSchemaError("confidence must be between 0 and 1")
        object.__setattr__(self, "confidence", confidence)
        _unique((item.evidence_id for item in self.evidence), label="evidence_id")
        _unique((item.claim_id for item in self.claims), label="claim_id")
        _unique((item.artifact_id for item in self.artifacts), label="artifact_id")
        _unique((item.experiment_id for item in self.experiments), label="experiment_id")
        limitations = tuple(
            _text(value, label="limitation") for value in self.limitations
        )
        object.__setattr__(self, "limitations", limitations)
        artifact_ids = {item.artifact_id for item in self.artifacts}
        referenced = {
            artifact_id
            for experiment in self.experiments
            for artifact_id in experiment.artifact_ids
        }
        if referenced - artifact_ids:
            raise FindingSchemaError(
                f"experiments reference unknown artifacts: {sorted(referenced - artifact_ids)}"
            )

    @property
    def finding_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ResearchFinding":
        data = dict(value)
        required = {"finding_id", "hypothesis", "conclusion", "confidence"}
        allowed = required | {
            "evidence",
            "claims",
            "artifacts",
            "experiments",
            "limitations",
        }
        missing = required - set(data)
        unknown = set(data) - allowed
        if missing:
            raise FindingSchemaError(f"research finding is missing fields: {sorted(missing)}")
        if unknown:
            raise FindingSchemaError(f"research finding has unknown fields: {sorted(unknown)}")
        return cls(
            finding_id=data["finding_id"],
            hypothesis=data["hypothesis"],
            conclusion=data["conclusion"],
            confidence=data["confidence"],
            evidence=tuple(
                EvidenceReference.from_dict(item)
                for item in _sequence(data.get("evidence", []), label="evidence")
            ),
            claims=tuple(
                NumericalClaim.from_dict(item)
                for item in _sequence(data.get("claims", []), label="claims")
            ),
            artifacts=tuple(
                ResearchArtifact.from_dict(item)
                for item in _sequence(data.get("artifacts", []), label="artifacts")
            ),
            experiments=tuple(
                ResearchExperiment.from_dict(item)
                for item in _sequence(data.get("experiments", []), label="experiments")
            ),
            limitations=tuple(
                _text(item, label="limitation")
                for item in _sequence(data.get("limitations", []), label="limitations")
            ),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "finding_id": self.finding_id,
            "hypothesis": self.hypothesis,
            "conclusion": self.conclusion,
            "confidence": self.confidence,
            "evidence": [item.to_dict() for item in self.evidence],
            "claims": [item.to_dict() for item in self.claims],
            "artifacts": [item.to_dict() for item in self.artifacts],
            "experiments": [item.to_dict() for item in self.experiments],
            "limitations": list(self.limitations),
        }
