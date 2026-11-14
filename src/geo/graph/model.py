"""Typed, sourced knowledge graph: events reach securities only through cited edges.

Every edge names its public source, the source's own date, when this project could first rely on
it (``available_at``), a confidence in [0, 1] and a one-line mechanism. An edge without a source is
rejected at load time, so the graph can only ever contain facts somebody published.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re

NODE_TYPES = frozenset({"facility", "port", "chokepoint", "company", "security", "sector"})
EDGE_TYPES = frozenset({
    "operates",      # company -> facility/port: the company runs it
    "supplies",      # company -> company: the source supplies the destination
    "ships_through", # company/port -> chokepoint: material flows pass through it
    "listed_as",     # company -> security
    "exposed_to",    # security -> sector
})
# Which node types each edge type may join; anything else is a modelling error.
EDGE_ENDPOINTS = {
    "operates": ({"company"}, {"facility", "port"}),
    "supplies": ({"company"}, {"company"}),
    "ships_through": ({"company", "port"}, {"chokepoint"}),
    "listed_as": ({"company"}, {"security"}),
    "exposed_to": ({"security"}, {"sector"}),
}
LOCATED = frozenset({"facility", "port", "chokepoint"})
_ID = re.compile(r"[a-z0-9][a-z0-9:._-]{1,95}")


def parse_instant(value: str) -> datetime:
    """Timezone-aware ISO-8601 instant; a naive or malformed value is refused, never guessed."""
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})", value
    ):
        raise ValueError(f"Not a timezone-aware ISO-8601 instant: {value!r}")
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


@dataclass(frozen=True)
class Source:
    url: str
    title: str
    date: str          # the document's own date (YYYY-MM-DD), not when we read it
    available_at: str  # earliest instant this project may rely on it
    excerpt: str = ""  # short supporting quote, when the source states the fact in words

    def validate(self, where: str) -> None:
        if not re.fullmatch(r"https://[^\s]+", self.url or ""):
            raise ValueError(f"{where}: source URL must be https")
        if not self.title.strip():
            raise ValueError(f"{where}: source title required")
        # A report dated only by year or month keeps that precision rather than inventing a day.
        if not re.fullmatch(r"[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?", self.date or ""):
            raise ValueError(f"{where}: source date must be YYYY, YYYY-MM or YYYY-MM-DD")
        available = parse_instant(self.available_at)
        if available.date().isoformat()[: len(self.date)] < self.date:
            raise ValueError(f"{where}: available_at precedes the source's own date")


@dataclass(frozen=True)
class Node:
    id: str
    type: str
    name: str
    source: Source
    lat: float | None = None
    lon: float | None = None
    location_precision: str | None = None  # e.g. "city centroid"; required with coordinates
    attrs: dict = field(default_factory=dict)

    def validate(self) -> None:
        if not _ID.fullmatch(self.id):
            raise ValueError(f"Bad node id {self.id!r}")
        if self.type not in NODE_TYPES:
            raise ValueError(f"{self.id}: unknown node type {self.type!r}")
        self.source.validate(self.id)
        if self.type in LOCATED:
            if self.lat is None or self.lon is None or not self.location_precision:
                raise ValueError(f"{self.id}: located nodes need lat, lon and a precision label")
            if not (-90 <= self.lat <= 90 and -180 <= self.lon <= 180):
                raise ValueError(f"{self.id}: coordinates out of range")


@dataclass(frozen=True)
class Edge:
    id: str
    type: str
    src: str
    dst: str
    confidence: float
    mechanism: str
    source: Source

    def validate(self, nodes: dict[str, Node]) -> None:
        if not _ID.fullmatch(self.id):
            raise ValueError(f"Bad edge id {self.id!r}")
        if self.type not in EDGE_TYPES:
            raise ValueError(f"{self.id}: unknown edge type {self.type!r}")
        if self.src not in nodes or self.dst not in nodes:
            raise ValueError(f"{self.id}: endpoint missing from graph")
        allowed_src, allowed_dst = EDGE_ENDPOINTS[self.type]
        if nodes[self.src].type not in allowed_src or nodes[self.dst].type not in allowed_dst:
            raise ValueError(f"{self.id}: {self.type} cannot join {nodes[self.src].type} -> {nodes[self.dst].type}")
        if not (0 < self.confidence <= 1):
            raise ValueError(f"{self.id}: confidence must be in (0, 1]")
        if not self.mechanism.strip() or len(self.mechanism) > 240:
            raise ValueError(f"{self.id}: one-line mechanism required (<=240 chars)")
        self.source.validate(self.id)
