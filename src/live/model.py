"""Shared vocabulary of the live spine: observations, event types, clocks, licences."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

SCHEMA = "live-observation/1"
USER_AGENT = "FinSight-Forge research (github.com/RaghhavMalani/finsight-alpha)"

# Typed events on /live/stream. Every stored record is exactly one of these.
EVENT_TYPES = (
    "market.tick",
    "geo.event",
    "macro.release",
    "news.headline",
    "prediction.update",
    "risk.alert",
    "research.progress",
    "feed.health",
)

# How much a reader may lean on a value; never a probability.
CONFIDENCE = ("OFFICIAL", "PROVISIONAL", "UNOFFICIAL", "DERIVED")

# Fields every stored record carries (values may be null only where noted in docs).
REQUIRED_FIELDS = (
    "schema_version",
    "seq",
    "id",
    "type",
    "source",
    "source_id",
    "revision",
    "observed_at",
    "available_at",
    "effective_at",
    "licence",
    "confidence",
    "provenance",
    "payload",
)
LICENCE_FIELDS = ("status", "attribution", "terms_url", "redistribution")
PROVENANCE_FIELDS = ("feed", "url", "fetched_at", "content_sha256", "parser", "delay")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    """UTC ISO-8601 with microseconds and a Z suffix; one spelling everywhere."""
    if value.tzinfo is None:
        raise ValueError("naive datetime has no defined instant")
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"timestamp without timezone: {value!r}")
    return parsed.astimezone(timezone.utc)


def normalize_iso(value: str | datetime | None) -> str | None:
    if value is None:
        return None
    return iso(value if isinstance(value, datetime) else parse_iso(value))


def from_epoch_ms(ms: int | float) -> str:
    return iso(datetime.fromtimestamp(ms / 1000, tz=timezone.utc))


def canonical(value: Any) -> str:
    """Deterministic JSON; NaN/Infinity are refused so missing never reads as a number."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def sha256_hex(data: bytes | str) -> str:
    return hashlib.sha256(data.encode("utf-8") if isinstance(data, str) else data).hexdigest()


def record_id(source: str, source_id: str, revision: str) -> str:
    return sha256_hex("\x1f".join((source, source_id, revision)))


def licence(status: str, attribution: str, terms_url: str, redistribution: str, note: str = "") -> dict:
    """``redistribution`` is PUBLIC (may be published), LOCAL_ONLY, or NONE."""
    out = {"status": status, "attribution": attribution, "terms_url": terms_url,
           "redistribution": redistribution}
    if note:
        out["note"] = note
    return out


@dataclass(frozen=True)
class Observation:
    """What a feed hands the store. There is deliberately no ``available_at`` field:
    the store stamps ingestion time itself."""

    type: str
    source: str
    source_id: str
    revision: str
    observed_at: str
    effective_at: str | None
    licence: dict
    confidence: str
    provenance: dict
    payload: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "type": self.type, "source": self.source, "source_id": self.source_id,
            "revision": self.revision, "observed_at": self.observed_at,
            "effective_at": self.effective_at, "licence": self.licence,
            "confidence": self.confidence, "provenance": self.provenance,
            "payload": self.payload,
        }
