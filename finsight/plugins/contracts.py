"""Strict typed values and clocks at the plugin boundary."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import math
import json
import re
from typing import Any, Literal

import pandas as pd
from src.data.as_of import AsOfContext, AsOfViolation
from src.truth.contracts import canonical_hash


def utc(value: str | datetime) -> datetime:
    parsed = (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, str)
        else value
    )
    if not isinstance(parsed, datetime) or parsed.tzinfo is None:
        raise ValueError("Signal clocks require an explicit timezone")
    return AsOfContext.bind(parsed).cutoff


def tenant(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
        raise ValueError("An explicit tenant identifier is required")
    return value


@dataclass(frozen=True)
class SignalType:
    name: str
    kind: Literal["float", "int", "bool", "category", "json"] = "float"
    unit: str = "dimensionless"

    def __post_init__(self):
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,79}", self.name):
            raise ValueError("Invalid signal name")
        if (
            self.kind not in {"float", "int", "bool", "category", "json"}
            or not self.unit
        ):
            raise ValueError("Invalid signal type/unit")

    def validate(self, value: Any):
        if self.kind == "float":
            if type(value) not in (int, float) or not math.isfinite(value):
                raise TypeError(f"{self.name} requires a finite numeric scalar")
            return float(value)
        if self.kind == "int" and type(value) is int:
            return value
        if self.kind == "bool" and type(value) is bool:
            return value
        if self.kind == "category" and isinstance(value, str) and 0 < len(value) <= 200:
            return value
        if self.kind == "json" and isinstance(value, str) and len(value) <= 1_000_000:
            parsed = json.loads(
                value,
                parse_constant=lambda token: (_ for _ in ()).throw(ValueError(token)),
            )
            if not isinstance(parsed, dict):
                raise TypeError("Structured input must be a JSON object")
            return json.dumps(
                parsed, sort_keys=True, separators=(",", ":"), allow_nan=False
            )
        raise TypeError(f"{self.name} requires {self.kind}")


@dataclass(frozen=True)
class Signal:
    tenant_id: str
    name: str
    asset: str
    value: Any
    observed_at: datetime
    available_at: datetime
    source: str
    licence: str
    version: str
    kind: Literal["float", "int", "bool", "category", "json"] = "float"
    unit: str = "dimensionless"

    def __post_init__(self):
        tenant(self.tenant_id)
        for key in ("asset", "source", "licence", "version"):
            value = getattr(self, key)
            if not isinstance(value, str) or not value or len(value) > 240:
                raise ValueError(f"Missing or invalid {key}")
        spec = SignalType(self.name, self.kind, self.unit)
        object.__setattr__(self, "value", spec.validate(self.value))
        object.__setattr__(self, "observed_at", utc(self.observed_at))
        object.__setattr__(self, "available_at", utc(self.available_at))
        if self.available_at < self.observed_at:
            raise AsOfViolation("Availability precedes observation")

    @property
    def key(self):
        return (
            self.tenant_id,
            self.name,
            self.asset,
            self.observed_at.isoformat(),
            self.available_at.isoformat(),
            self.source,
            self.version,
        )

    def payload(self):
        return {
            **self.__dict__,
            "observed_at": self.observed_at.isoformat(),
            "available_at": self.available_at.isoformat(),
        }

    @property
    def identity(self):
        return canonical_hash(self.key)


@dataclass(frozen=True)
class InferenceCapability:
    """A computation adapter cannot grant scientific claims."""

    method: str = "UNASSESSED"
    confirmation_status: str = "UNASSESSED"
    supported_domains: tuple[str, ...] = ()
    descriptive_only_settings: tuple[str, ...] = ()
    inference_certified: bool = False
    market_claim_eligible: bool = False
    validated_alpha: bool = False

    def __post_init__(self):
        for key in ("inference_certified", "market_claim_eligible", "validated_alpha"):
            if type(getattr(self, key)) is not bool:
                raise TypeError("Capability flags require explicit booleans")
        if (
            type(self.supported_domains) is not tuple
            or type(self.descriptive_only_settings) is not tuple
        ):
            raise TypeError("Capability domains are immutable tuples")
        if (
            self.inference_certified
            or self.market_claim_eligible
            or self.validated_alpha
            or self.supported_domains
        ):
            raise ValueError("No preregistered scoped certificate is installed")


def validate_inputs(frame: pd.DataFrame, specs: tuple[SignalType, ...]) -> pd.DataFrame:
    names = [s.name for s in specs]
    if frame.empty or set(frame.columns) != set(
        names + ["decision_at", "information_at"]
    ):
        raise ValueError(
            "Plugin inputs must contain exactly the declared signals and clocks"
        )
    result = frame.copy(deep=True)
    for clock in ("decision_at", "information_at"):
        if any(pd.isna(v) or pd.Timestamp(v).tzinfo is None for v in result[clock]):
            raise ValueError("Plugin clocks require finite, explicit timezones")
        result[clock] = pd.to_datetime(result[clock], utc=True)
    if (result.information_at > result.decision_at).any():
        raise AsOfViolation("Future feature information entered a decision")
    if (
        not result.decision_at.is_monotonic_increasing
        or result.decision_at.duplicated().any()
    ):
        raise ValueError("Decision clocks must be strictly chronological")
    for spec in specs:
        result[spec.name] = [spec.validate(v) for v in result[spec.name].tolist()]
    return result


def validate_outputs(
    value: pd.DataFrame, rows: pd.DataFrame, specs: tuple[SignalType, ...]
):
    if not isinstance(value, pd.DataFrame) or list(value.columns) != [
        s.name for s in specs
    ]:
        raise TypeError("Plugin output columns differ from declared outputs")
    if not value.index.equals(rows.index) or len(value) != len(rows):
        raise ValueError("Plugin changed output row identity/count")
    result = value.copy(deep=True)
    for spec in specs:
        result[spec.name] = [spec.validate(v) for v in result[spec.name].tolist()]
    return result
