"""A frozen, point-in-time information world for research-agent episodes."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Iterable, Mapping

import pandas as pd

from src.data.as_of import AsOfContext, AsOfViolation
from src.eval.canonical import canonical_sha256
from src.findings.schema import EvidenceReference
from src.truth.contracts import dataframe_hash


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class MarketWorldError(ValueError):
    """Raised when a world cannot provide a trustworthy frozen observation."""


@dataclass(frozen=True)
class ColumnShock:
    """A deterministic intervention applied only to information visible as-of."""

    dataset: str
    column: str
    operation: str
    value: float

    def __post_init__(self) -> None:
        if not self.dataset.strip() or not self.column.strip():
            raise MarketWorldError("shock dataset and column must be non-empty")
        operation = self.operation.strip().lower()
        if operation not in {"add", "multiply", "replace"}:
            raise MarketWorldError("shock operation must be add, multiply, or replace")
        if type(self.value) not in {int, float} or not math.isfinite(float(self.value)):
            raise MarketWorldError("shock value must be finite")
        object.__setattr__(self, "operation", operation)
        object.__setattr__(self, "value", float(self.value))

    def to_dict(self) -> dict[str, Any]:
        return {
            "dataset": self.dataset,
            "column": self.column,
            "operation": self.operation,
            "value": self.value,
        }


@dataclass(frozen=True)
class _DatasetBinding:
    name: str
    frame: pd.DataFrame
    observed_at: str
    available_from: str | None
    snapshot_id: str

    @classmethod
    def build(
        cls,
        *,
        name: str,
        frame: pd.DataFrame,
        observed_at: str,
        available_from: str | None,
        snapshot_id: str | None,
    ) -> "_DatasetBinding":
        if not isinstance(frame, pd.DataFrame):
            raise MarketWorldError(f"dataset {name!r} must be a pandas DataFrame")
        if not name.strip():
            raise MarketWorldError("dataset name must be non-empty")
        if observed_at not in frame.columns:
            raise MarketWorldError(
                f"dataset {name!r} has no observed column {observed_at!r}"
            )
        if available_from is not None and available_from not in frame.columns:
            raise MarketWorldError(
                f"dataset {name!r} has no availability column {available_from!r}"
            )
        copied = frame.copy(deep=True).reset_index(drop=True)
        digest = (snapshot_id or dataframe_hash(copied)).lower()
        if SHA256_PATTERN.fullmatch(digest) is None:
            raise MarketWorldError("snapshot_id must be a lowercase SHA-256 digest")
        return cls(
            name=name.strip(),
            frame=copied,
            observed_at=observed_at,
            available_from=available_from,
            snapshot_id=digest,
        )

    def visible(self, as_of: AsOfContext) -> pd.DataFrame:
        return as_of.filter_frame(
            self.frame,
            observed_at=self.observed_at,
            available_from=self.available_from,
        ).reset_index(drop=True)

    def visibility_mask(self, as_of: AsOfContext) -> pd.Series:
        observed = pd.to_datetime(self.frame[self.observed_at], utc=True, errors="coerce")
        mask = observed.notna() & (observed <= as_of.cutoff)
        if self.available_from is not None:
            available = pd.to_datetime(
                self.frame[self.available_from], utc=True, errors="coerce"
            )
            mask &= available.notna() & (available <= as_of.cutoff)
        return mask

    def row_hash(self, record: Mapping[str, Any]) -> str:
        row = pd.DataFrame([dict(record)], columns=list(self.frame.columns))
        return dataframe_hash(row)


class MarketWorld:
    """Immutable view over datasets whose observations obey one information cutoff.

    ``strict`` worlds require an explicit availability timestamp for every
    dataset.  This prevents an old fiscal-period date from making a filing or
    restatement visible before the market could actually have received it.
    """

    def __init__(
        self,
        *,
        as_of: AsOfContext | str,
        seed: int = 0,
        information_policy: str = "strict",
        name: str = "real",
        _bindings: Mapping[str, _DatasetBinding] | None = None,
        parent_world_id: str | None = None,
        interventions: Iterable[ColumnShock] = (),
    ) -> None:
        self.as_of = as_of if isinstance(as_of, AsOfContext) else AsOfContext.bind(as_of)
        if type(seed) is not int or seed < 0:
            raise MarketWorldError("seed must be an integer >= 0")
        policy = information_policy.strip().lower()
        if policy not in {"strict", "observed_only"}:
            raise MarketWorldError("information_policy must be strict or observed_only")
        if not name.strip():
            raise MarketWorldError("world name must be non-empty")
        if parent_world_id is not None and SHA256_PATTERN.fullmatch(parent_world_id) is None:
            raise MarketWorldError("parent_world_id must be a lowercase SHA-256 digest")
        self.seed = seed
        self.information_policy = policy
        self.name = name.strip()
        self.parent_world_id = parent_world_id
        self.interventions = tuple(interventions)
        self._bindings = dict(_bindings or {})

    @property
    def datasets(self) -> tuple[str, ...]:
        return tuple(sorted(self._bindings))

    def with_dataset(
        self,
        name: str,
        frame: pd.DataFrame,
        *,
        observed_at: str = "observed_at",
        available_from: str | None = "available_from",
        snapshot_id: str | None = None,
    ) -> "MarketWorld":
        """Return a new world with one immutable dataset binding."""

        if self.information_policy == "strict" and available_from is None:
            raise MarketWorldError(
                "strict worlds require an available_from column for every dataset"
            )
        binding = _DatasetBinding.build(
            name=name,
            frame=frame,
            observed_at=observed_at,
            available_from=available_from,
            snapshot_id=snapshot_id,
        )
        bindings = dict(self._bindings)
        bindings[binding.name] = binding
        return MarketWorld(
            as_of=self.as_of,
            seed=self.seed,
            information_policy=self.information_policy,
            name=self.name,
            _bindings=bindings,
            parent_world_id=self.parent_world_id,
            interventions=self.interventions,
        )

    def data(self, dataset: str) -> pd.DataFrame:
        """Return a defensive copy of the rows visible in this world."""

        binding = self._bindings.get(dataset)
        if binding is None:
            raise MarketWorldError(f"unknown dataset {dataset!r}")
        try:
            return binding.visible(self.as_of).copy(deep=True)
        except AsOfViolation as exc:
            raise MarketWorldError(str(exc)) from exc

    def evidence(
        self,
        dataset: str,
        row: int,
        *,
        evidence_id: str,
    ) -> EvidenceReference:
        """Create a content-addressed reference to one visible row by position."""

        binding = self._bindings.get(dataset)
        if binding is None:
            raise MarketWorldError(f"unknown dataset {dataset!r}")
        visible = binding.visible(self.as_of)
        if type(row) is not int or row < 0 or row >= len(visible):
            raise MarketWorldError(
                f"row {row!r} is outside visible dataset {dataset!r}"
            )
        record = visible.iloc[row].to_dict()
        observed = pd.to_datetime(record[binding.observed_at], utc=True)
        available = (
            pd.to_datetime(record[binding.available_from], utc=True)
            if binding.available_from is not None
            else observed
        )
        return EvidenceReference(
            evidence_id=evidence_id,
            dataset=dataset,
            snapshot_id=binding.snapshot_id,
            content_hash=binding.row_hash(record),
            observed_at=observed.to_pydatetime(),
            available_from=available.to_pydatetime(),
            locator=f"{dataset}[{row}]",
        )

    def contains_evidence(self, reference: EvidenceReference) -> bool:
        """Return whether a reference resolves exactly inside this frozen world."""

        binding = self._bindings.get(reference.dataset)
        if binding is None or binding.snapshot_id != reference.snapshot_id:
            return False
        if reference.observed_at > self.as_of.cutoff:
            return False
        if reference.available_from > self.as_of.cutoff:
            return False
        for _, row in binding.visible(self.as_of).iterrows():
            record = row.to_dict()
            if binding.row_hash(record) != reference.content_hash:
                continue
            observed = pd.to_datetime(record[binding.observed_at], utc=True).to_pydatetime()
            available = (
                pd.to_datetime(record[binding.available_from], utc=True).to_pydatetime()
                if binding.available_from is not None
                else observed
            )
            if observed == reference.observed_at and available == reference.available_from:
                return True
        return False

    def fork(
        self,
        name: str,
        interventions: Iterable[ColumnShock],
    ) -> "MarketWorld":
        """Create a counterfactual without changing the parent or future rows."""

        shocks = tuple(interventions)
        if not shocks:
            raise MarketWorldError("a counterfactual fork requires at least one intervention")
        bindings = {
            key: _DatasetBinding.build(
                name=binding.name,
                frame=binding.frame,
                observed_at=binding.observed_at,
                available_from=binding.available_from,
                snapshot_id=binding.snapshot_id,
            )
            for key, binding in self._bindings.items()
        }
        for shock in shocks:
            binding = bindings.get(shock.dataset)
            if binding is None:
                raise MarketWorldError(f"shock targets unknown dataset {shock.dataset!r}")
            if shock.column not in binding.frame.columns:
                raise MarketWorldError(
                    f"shock targets unknown column {shock.column!r} in {shock.dataset!r}"
                )
            changed = binding.frame.copy(deep=True)
            mask = binding.visibility_mask(self.as_of)
            try:
                values = pd.to_numeric(changed.loc[mask, shock.column], errors="raise")
            except (TypeError, ValueError) as exc:
                raise MarketWorldError(
                    f"shock column {shock.dataset}.{shock.column} must be numeric"
                ) from exc
            if shock.operation == "add":
                changed.loc[mask, shock.column] = values + shock.value
            elif shock.operation == "multiply":
                changed.loc[mask, shock.column] = values * shock.value
            else:
                changed.loc[mask, shock.column] = shock.value
            bindings[shock.dataset] = _DatasetBinding.build(
                name=binding.name,
                frame=changed,
                observed_at=binding.observed_at,
                available_from=binding.available_from,
                snapshot_id=None,
            )
        return MarketWorld(
            as_of=self.as_of,
            seed=self.seed,
            information_policy=self.information_policy,
            name=name,
            _bindings=bindings,
            parent_world_id=self.world_id,
            interventions=shocks,
        )

    def manifest(self) -> dict[str, Any]:
        datasets = []
        for name in sorted(self._bindings):
            binding = self._bindings[name]
            visible = binding.visible(self.as_of)
            datasets.append(
                {
                    "name": name,
                    "snapshot_id": binding.snapshot_id,
                    "source_hash": dataframe_hash(binding.frame),
                    "visible_hash": dataframe_hash(visible),
                    "visible_rows": len(visible),
                    "observed_at": binding.observed_at,
                    "available_from": binding.available_from,
                }
            )
        return {
            "name": self.name,
            "as_of": self.as_of.isoformat,
            "seed": self.seed,
            "information_policy": self.information_policy,
            "parent_world_id": self.parent_world_id,
            "interventions": [item.to_dict() for item in self.interventions],
            "datasets": datasets,
        }

    @property
    def world_id(self) -> str:
        return canonical_sha256(self.manifest())
