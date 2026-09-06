"""Lossless native artifacts and their canonical execution-event projections."""

from __future__ import annotations

import re
import math
from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping

from src.eval.canonical import canonical_sha256
from src.execution.failures import BoundaryError, FailureCode


_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class CanonicalEventType(str, Enum):
    SIGNAL_GENERATED = "SignalGenerated"
    ORDER_INTENT_CREATED = "OrderIntentCreated"
    ORDER_SUBMITTED = "OrderSubmitted"
    ORDER_ACCEPTED = "OrderAccepted"
    ORDER_REJECTED = "OrderRejected"
    ORDER_MODIFIED = "OrderModified"
    ORDER_CANCELED = "OrderCanceled"
    PARTIAL_FILL = "PartialFill"
    FULL_FILL = "FullFill"
    FEE_CHARGED = "FeeCharged"
    POSITION_CHANGED = "PositionChanged"
    MARK_UPDATED = "MarkUpdated"


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return value.strip()


def _hash(value: Any, name: str) -> str:
    value = _text(value, name).lower()
    if _SHA256.fullmatch(value) is None:
        raise ValueError(f"{name} must be a lowercase SHA-256 digest")
    return value


@dataclass(frozen=True)
class NativeEngineEvent:
    engine: str
    native_type: str
    event_ns: int
    payload: Mapping[str, Any]
    input_market_event_hash: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "engine", _text(self.engine, "engine"))
        object.__setattr__(self, "native_type", _text(self.native_type, "native_type"))
        if type(self.event_ns) is not int or self.event_ns < 0:
            raise ValueError("event_ns must be an integer >= 0")
        if not isinstance(self.payload, Mapping):
            raise ValueError("payload must be an object")
        object.__setattr__(self, "payload", dict(self.payload))
        object.__setattr__(self, "input_market_event_hash", _hash(self.input_market_event_hash, "input_market_event_hash"))

    @property
    def native_event_hash(self) -> str:
        return canonical_sha256(self.to_dict(include_hash=False))

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "NativeEngineEvent":
        data = dict(value)
        supplied = data.pop("native_event_hash", None)
        fields = {"engine", "native_type", "event_ns", "payload", "input_market_event_hash"}
        if set(data) != fields:
            raise ValueError(f"native event fields must be exactly {sorted(fields)}")
        result = cls(**data)
        if supplied is not None and supplied != result.native_event_hash:
            raise BoundaryError("invalid native_event_hash", FailureCode.REPLAY_MISMATCH)
        return result

    def to_dict(self, *, include_hash: bool = True) -> dict[str, Any]:
        value = {
            "engine": self.engine, "native_type": self.native_type,
            "event_ns": self.event_ns, "payload": dict(self.payload),
            "input_market_event_hash": self.input_market_event_hash,
        }
        if include_hash:
            value["native_event_hash"] = self.native_event_hash
        return value


@dataclass(frozen=True)
class CanonicalExecutionEvent:
    event_id: str
    event_type: CanonicalEventType
    event_ns: int
    native_event_hash: str
    input_market_event_hash: str
    order_id: str | None = None
    fill_id: str | None = None
    quantity: float | None = None
    price: float | None = None
    causation_event_id: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "event_id", _text(self.event_id, "event_id"))
        if not isinstance(self.event_type, CanonicalEventType):
            object.__setattr__(self, "event_type", CanonicalEventType(str(self.event_type)))
        if type(self.event_ns) is not int or self.event_ns < 0:
            raise ValueError("event_ns must be an integer >= 0")
        for name in ("native_event_hash", "input_market_event_hash"):
            object.__setattr__(self, name, _hash(getattr(self, name), name))
        for name in ("order_id", "fill_id", "causation_event_id"):
            if getattr(self, name) is not None:
                object.__setattr__(self, name, _text(getattr(self, name), name))
        for name in ("quantity", "price"):
            if getattr(self, name) is not None:
                raw = getattr(self, name)
                if type(raw) not in {int, float} or not math.isfinite(raw) or raw < 0:
                    raise ValueError(f"{name} must be a finite number >= 0")
                number = float(raw)
                object.__setattr__(self, name, number)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "CanonicalExecutionEvent":
        data = dict(value)
        fields = {"event_id", "event_type", "event_ns", "native_event_hash", "input_market_event_hash", "order_id", "fill_id", "quantity", "price", "causation_event_id"}
        if set(data) != fields:
            raise ValueError(f"canonical event fields must be exactly {sorted(fields)}")
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id, "event_type": self.event_type.value,
            "event_ns": self.event_ns, "native_event_hash": self.native_event_hash,
            "input_market_event_hash": self.input_market_event_hash,
            "order_id": self.order_id, "fill_id": self.fill_id,
            "quantity": self.quantity, "price": self.price,
            "causation_event_id": self.causation_event_id,
        }
