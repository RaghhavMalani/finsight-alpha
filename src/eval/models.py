"""Strict, versioned evidence records for the coding-agent eval harness."""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable, Mapping


SCHEMA_VERSION = "1.0"
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{7,64}$")
WORLDS = frozenset({"real", "counterfactual"})


class EvaluationDataError(ValueError):
    """Raised when an evaluation artifact cannot support an honest metric."""


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise EvaluationDataError(f"{label} must be an object")
    return value


def _required_string(data: Mapping[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise EvaluationDataError(f"{key} must be a non-empty string")
    return value.strip()


def _optional_string(data: Mapping[str, Any], key: str) -> str | None:
    value = data.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise EvaluationDataError(f"{key} must be null or a non-empty string")
    return value.strip()


def _required_bool(data: Mapping[str, Any], key: str) -> bool:
    value = data.get(key)
    if type(value) is not bool:
        raise EvaluationDataError(f"{key} must be a boolean")
    return value


def _required_int(data: Mapping[str, Any], key: str, *, minimum: int = 0) -> int:
    value = data.get(key)
    if type(value) is not int or value < minimum:
        raise EvaluationDataError(f"{key} must be an integer >= {minimum}")
    return value


def _sha256(data: Mapping[str, Any], key: str) -> str:
    value = _required_string(data, key).lower()
    if SHA256_PATTERN.fullmatch(value) is None:
        raise EvaluationDataError(f"{key} must be a lowercase SHA-256 digest")
    return value


def _iso8601_utc(data: Mapping[str, Any], key: str) -> str:
    value = _required_string(data, key)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise EvaluationDataError(f"{key} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise EvaluationDataError(f"{key} must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _strict_keys(
    data: Mapping[str, Any],
    *,
    required: set[str],
    optional: set[str] | None = None,
    label: str,
) -> None:
    optional = optional or set()
    missing = required - set(data)
    unknown = set(data) - required - optional
    if missing:
        raise EvaluationDataError(f"{label} is missing fields: {sorted(missing)}")
    if unknown:
        raise EvaluationDataError(f"{label} has unknown fields: {sorted(unknown)}")


@dataclass(frozen=True)
class FindingRecord:
    finding_id: str
    verifier_passed: bool

    @classmethod
    def from_dict(cls, value: Any) -> "FindingRecord":
        data = _mapping(value, label="finding")
        _strict_keys(
            data,
            required={"finding_id", "verifier_passed"},
            label="finding",
        )
        return cls(
            finding_id=_required_string(data, "finding_id"),
            verifier_passed=_required_bool(data, "verifier_passed"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "finding_id": self.finding_id,
            "verifier_passed": self.verifier_passed,
        }


@dataclass(frozen=True)
class ReplayRecord:
    replay_index: int
    artifact_sha256: str
    byte_count: int

    @classmethod
    def from_dict(cls, value: Any) -> "ReplayRecord":
        data = _mapping(value, label="replay")
        _strict_keys(
            data,
            required={"replay_index", "artifact_sha256", "byte_count"},
            label="replay",
        )
        return cls(
            replay_index=_required_int(data, "replay_index"),
            artifact_sha256=_sha256(data, "artifact_sha256"),
            byte_count=_required_int(data, "byte_count", minimum=1),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "replay_index": self.replay_index,
            "artifact_sha256": self.artifact_sha256,
            "byte_count": self.byte_count,
        }


@dataclass(frozen=True)
class FaultRecord:
    fault_id: str
    fault_type: str
    recovered: bool

    @classmethod
    def from_dict(cls, value: Any) -> "FaultRecord":
        data = _mapping(value, label="fault")
        _strict_keys(
            data,
            required={"fault_id", "fault_type", "recovered"},
            label="fault",
        )
        return cls(
            fault_id=_required_string(data, "fault_id"),
            fault_type=_required_string(data, "fault_type"),
            recovered=_required_bool(data, "recovered"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "fault_id": self.fault_id,
            "fault_type": self.fault_type,
            "recovered": self.recovered,
        }


@dataclass(frozen=True)
class JudgmentRecord:
    judgment_id: str
    judge_label: str
    human_label: str

    @classmethod
    def from_dict(cls, value: Any) -> "JudgmentRecord":
        data = _mapping(value, label="judgment")
        _strict_keys(
            data,
            required={"judgment_id", "judge_label", "human_label"},
            label="judgment",
        )
        return cls(
            judgment_id=_required_string(data, "judgment_id"),
            judge_label=_required_string(data, "judge_label"),
            human_label=_required_string(data, "human_label"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "judgment_id": self.judgment_id,
            "judge_label": self.judge_label,
            "human_label": self.human_label,
        }


@dataclass(frozen=True)
class AttemptRecord:
    schema_version: str
    run_id: str
    task_id: str
    commit_sha: str
    seed: int
    world: str
    pair_id: str | None
    passed: bool
    cost_usd: Decimal
    sharpe: float | None
    recorded_at_utc: str
    prompt_sha256: str
    snapshot_sha256: str
    plan_sha256: str
    findings: tuple[FindingRecord, ...]
    replays: tuple[ReplayRecord, ...]
    faults: tuple[FaultRecord, ...]
    judgments: tuple[JudgmentRecord, ...]

    @classmethod
    def from_dict(cls, value: Any) -> "AttemptRecord":
        data = _mapping(value, label="attempt")
        _strict_keys(
            data,
            required={
                "schema_version",
                "run_id",
                "task_id",
                "commit_sha",
                "seed",
                "world",
                "pair_id",
                "passed",
                "cost_usd",
                "sharpe",
                "recorded_at_utc",
                "prompt_sha256",
                "snapshot_sha256",
                "plan_sha256",
                "findings",
                "replays",
                "faults",
                "judgments",
            },
            label="attempt",
        )

        schema_version = _required_string(data, "schema_version")
        if schema_version != SCHEMA_VERSION:
            raise EvaluationDataError(
                f"unsupported schema_version {schema_version!r}; expected {SCHEMA_VERSION!r}"
            )
        commit_sha = _required_string(data, "commit_sha").lower()
        if COMMIT_PATTERN.fullmatch(commit_sha) is None:
            raise EvaluationDataError("commit_sha must be 7-64 lowercase hex characters")
        world = _required_string(data, "world").lower()
        if world not in WORLDS:
            raise EvaluationDataError(f"world must be one of {sorted(WORLDS)}")

        try:
            cost_usd = Decimal(str(data.get("cost_usd")))
        except (InvalidOperation, ValueError) as exc:
            raise EvaluationDataError("cost_usd must be a finite decimal >= 0") from exc
        if not cost_usd.is_finite() or cost_usd < 0:
            raise EvaluationDataError("cost_usd must be a finite decimal >= 0")

        raw_sharpe = data.get("sharpe")
        sharpe: float | None
        if raw_sharpe is None:
            sharpe = None
        elif type(raw_sharpe) in {int, float} and math.isfinite(float(raw_sharpe)):
            sharpe = float(raw_sharpe)
        else:
            raise EvaluationDataError("sharpe must be null or a finite number")

        pair_id = _optional_string(data, "pair_id")
        if sharpe is not None and pair_id is None:
            raise EvaluationDataError("pair_id is required when sharpe is measured")

        collections: dict[str, tuple[Any, ...]] = {}
        parsers = {
            "findings": FindingRecord.from_dict,
            "replays": ReplayRecord.from_dict,
            "faults": FaultRecord.from_dict,
            "judgments": JudgmentRecord.from_dict,
        }
        for key, parser in parsers.items():
            raw = data.get(key)
            if not isinstance(raw, list):
                raise EvaluationDataError(f"{key} must be an array")
            collections[key] = tuple(parser(item) for item in raw)

        record = cls(
            schema_version=schema_version,
            run_id=_sha256(data, "run_id"),
            task_id=_required_string(data, "task_id"),
            commit_sha=commit_sha,
            seed=_required_int(data, "seed"),
            world=world,
            pair_id=pair_id,
            passed=_required_bool(data, "passed"),
            cost_usd=cost_usd,
            sharpe=sharpe,
            recorded_at_utc=_iso8601_utc(data, "recorded_at_utc"),
            prompt_sha256=_sha256(data, "prompt_sha256"),
            snapshot_sha256=_sha256(data, "snapshot_sha256"),
            plan_sha256=_sha256(data, "plan_sha256"),
            findings=collections["findings"],
            replays=collections["replays"],
            faults=collections["faults"],
            judgments=collections["judgments"],
        )
        record._validate_nested_uniqueness()
        return record

    def _validate_nested_uniqueness(self) -> None:
        keys = {
            "finding_id": [item.finding_id for item in self.findings],
            "replay_index": [item.replay_index for item in self.replays],
            "fault_id": [item.fault_id for item in self.faults],
            "judgment_id": [item.judgment_id for item in self.judgments],
        }
        for label, values in keys.items():
            if len(values) != len(set(values)):
                raise EvaluationDataError(
                    f"run {self.run_id} contains duplicate {label} values"
                )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "run_id": self.run_id,
            "task_id": self.task_id,
            "commit_sha": self.commit_sha,
            "seed": self.seed,
            "world": self.world,
            "pair_id": self.pair_id,
            "passed": self.passed,
            "cost_usd": format(self.cost_usd, "f"),
            "sharpe": self.sharpe,
            "recorded_at_utc": self.recorded_at_utc,
            "prompt_sha256": self.prompt_sha256,
            "snapshot_sha256": self.snapshot_sha256,
            "plan_sha256": self.plan_sha256,
            "findings": [item.to_dict() for item in self.findings],
            "replays": [item.to_dict() for item in self.replays],
            "faults": [item.to_dict() for item in self.faults],
            "judgments": [item.to_dict() for item in self.judgments],
        }


def validate_attempt_records(records: Iterable[AttemptRecord]) -> tuple[AttemptRecord, ...]:
    ordered = tuple(
        sorted(
            records,
            key=lambda row: (
                row.commit_sha,
                row.task_id,
                row.seed,
                row.world,
                row.run_id,
            ),
        )
    )
    if not ordered:
        raise EvaluationDataError("evaluation evidence contains no attempt records")

    run_ids = [row.run_id for row in ordered]
    if len(run_ids) != len(set(run_ids)):
        raise EvaluationDataError("run_id must be unique across the evaluation dataset")

    attempt_keys = [
        (row.commit_sha, row.task_id, row.seed, row.world) for row in ordered
    ]
    if len(attempt_keys) != len(set(attempt_keys)):
        raise EvaluationDataError(
            "commit/task/seed/world must identify exactly one final attempt"
        )
    return ordered


def load_attempt_records(path: str | Path) -> tuple[AttemptRecord, ...]:
    """Load strict JSONL evidence and return it in canonical order."""

    source = Path(path)
    records: list[AttemptRecord] = []
    with source.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
                records.append(AttemptRecord.from_dict(value))
            except (json.JSONDecodeError, EvaluationDataError) as exc:
                raise EvaluationDataError(
                    f"{source}:{line_number}: {exc}"
                ) from exc
    return validate_attempt_records(records)
