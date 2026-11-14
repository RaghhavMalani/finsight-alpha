"""Local source bytes and explicit clocks; no invented publication timestamp."""

import math
from dataclasses import asdict, dataclass
from hashlib import sha256

from finsight.plugins.contracts import utc
from src.truth.contracts import canonical_hash

QUALITIES = {
    "PUBLICATION_TIMESTAMP",
    "CONSERVATIVE_VINTAGE_DAY",
    "CONSERVATIVE_MARKET_TIME",
    "RECEIVE_TIMESTAMP_CAPTURED",
    "CAPTURE_ONLY",
}


def preserved_json(value):
    """Invalid numeric tokens stay tagged in quarantine; bytes remain the authority."""
    if isinstance(value, float) and not math.isfinite(value):
        return {"invalid_numeric": repr(value)}
    if isinstance(value, dict):
        return {k: preserved_json(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [preserved_json(v) for v in value]
    return value


@dataclass(frozen=True)
class Capture:
    source: str
    source_url: str
    content_sha256: str
    captured_at: str
    schema: dict
    licence: dict
    clock_quality: str
    calendar: dict
    field_definition: str
    unit: str
    feed_scope: str
    price_basis: str = "NOT_APPLICABLE"
    metadata: dict | None = None

    def __post_init__(self):
        utc(self.captured_at)
        if (
            self.clock_quality not in QUALITIES
            or len(self.content_sha256) != 64
            or any(c not in "0123456789abcdef" for c in self.content_sha256)
        ):
            raise ValueError("Capture requires a hash and an explicit clock quality")
        canonical_hash(asdict(self))

    @property
    def identity(self):
        return canonical_hash(self.to_dict())

    def to_dict(self):
        payload = asdict(self)
        if self.metadata is None:
            payload.pop("metadata")
        return payload

    def verify(self, raw):
        if sha256(raw).hexdigest() != self.content_sha256:
            raise ValueError("Source byte substitution")


def validate_observation(row, capture):
    required = {"asset", "field", "value", "observed_at", "available_at"}
    if not required <= set(row):
        raise ValueError("Missing observation schema")
    observed, available = utc(row["observed_at"]), utc(row["available_at"])
    if observed > available or available > utc(capture.captured_at):
        raise ValueError("Observation clocks cross capture evidence")
    if capture.clock_quality == "CAPTURE_ONLY" and available != utc(
        capture.captured_at
    ):
        raise ValueError("CAPTURE_ONLY cannot backdate availability")
    if type(row["value"]) not in (int, float) or not math.isfinite(row["value"]):
        raise ValueError("Observation requires a finite numeric value")
    if (
        not isinstance(row["asset"], str)
        or not row["asset"]
        or row["field"] not in capture.schema
    ):
        raise ValueError("Undeclared asset/field")
    return {k: row[k] for k in sorted(required)} | {
        "revision": str(row.get("revision", "0"))
    }


def public_metadata(capture):
    return {
        "source": capture.source,
        "source_url": capture.source_url,
        "source_version_id": capture.identity,
        "capture_sha256": capture.content_sha256,
        "captured_at": capture.captured_at,
        "clock_quality": capture.clock_quality,
        "schema_hash": canonical_hash(capture.schema),
        "licence": capture.licence,
        "calendar": capture.calendar,
        "field_definition": capture.field_definition,
        "unit": capture.unit,
        "feed_scope": capture.feed_scope,
        "price_basis": capture.price_basis,
        **(
            {
                "adapter_version": capture.metadata["adapter_version"],
                "adapter_metadata_hash": canonical_hash(capture.metadata),
            }
            if capture.metadata and "adapter_version" in capture.metadata
            else {}
        ),
    }
