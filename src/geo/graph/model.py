"""Typed, sourced knowledge graph: events reach securities only through cited edges.

Every node and edge names its public source, that source's date and what the date means, when
this project could first rely on it (``available_at``), and for a relationship a confidence in
(0, 1] and a one-line mechanism. An item without a source is rejected at load time, so the graph
can only contain facts somebody published.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
import re

NODE_TYPES = frozenset({"facility", "port", "chokepoint", "company", "security", "sector"})
EDGE_TYPES = frozenset({"operates", "supplies", "ships_through", "listed_as", "exposed_to"})
# Which node types each edge type may join; anything else is a modelling error.
EDGE_ENDPOINTS = {
    "operates": ({"company"}, {"facility", "port"}),       # the company runs the site
    "supplies": ({"company"}, {"company"}),                # the source supplies the destination
    "ships_through": ({"company", "port"}, {"chokepoint"}),  # its material flows pass through
    "listed_as": ({"company"}, {"security"}),
    "exposed_to": ({"security"}, {"sector"}),
}
LOCATED = frozenset({"facility", "port", "chokepoint"})
# What a source's date means. A filing is dated by when it was filed, never by its fiscal period.
DATE_BASES = frozenset({"filed", "published", "created", "updated", "retrieved"})
_ID = re.compile(r"[a-z0-9][a-z0-9:._-]{1,95}")
_DAY = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_INSTANT = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})"
)
MIN_EXCERPT_WORDS = 8


def parse_instant(value: str) -> datetime:
    """Timezone-aware ISO-8601 instant; a naive or malformed value is refused, never guessed."""
    if not isinstance(value, str) or not _INSTANT.fullmatch(value):
        raise ValueError(f"Not a timezone-aware ISO-8601 instant: {value!r}")
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def parse_day(value: str) -> date:
    if not isinstance(value, str) or not _DAY.fullmatch(value):
        raise ValueError(f"Not a YYYY-MM-DD date: {value!r}")
    return date.fromisoformat(value)  # also rejects 2025-13-45


@dataclass(frozen=True)
class Source:
    url: str
    title: str
    date: str          # YYYY-MM-DD; see date_basis
    date_basis: str    # filed | published | created | updated | retrieved
    available_at: str  # earliest instant this project may rely on it
    excerpt: str = ""  # the sentence that states the fact, when the source states it in words
    locator: str = ""  # page or section, when known

    def validate(self, where: str) -> None:
        if not re.fullmatch(r"https://[^\s]+", self.url or ""):
            raise ValueError(f"{where}: source URL must be https")
        if not (self.title or "").strip():
            raise ValueError(f"{where}: source title required")
        if self.date_basis not in DATE_BASES:
            raise ValueError(f"{where}: unknown date_basis {self.date_basis!r}")
        try:
            day = parse_day(self.date)
        except ValueError:
            raise ValueError(f"{where}: source date must be a real YYYY-MM-DD date") from None
        # Compared in UTC: stricter than local time, so it can only push available_at later.
        if parse_instant(self.available_at).date() < day:
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
        if not _ID.fullmatch(self.id or ""):
            raise ValueError(f"Bad node id {self.id!r}")
        if self.type not in NODE_TYPES:
            raise ValueError(f"{self.id}: unknown node type {self.type!r}")
        if not (self.name or "").strip():
            raise ValueError(f"{self.id}: name required")
        self.source.validate(self.id)
        if self.type in LOCATED:
            if self.lat is None or self.lon is None or not self.location_precision:
                raise ValueError(f"{self.id}: located nodes need lat, lon and a precision label")
            if not (-90 <= self.lat <= 90 and -180 <= self.lon <= 180):
                raise ValueError(f"{self.id}: coordinates out of range")
        elif self.lat is not None or self.lon is not None:
            raise ValueError(f"{self.id}: only facilities, ports and chokepoints carry coordinates")


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
        if not _ID.fullmatch(self.id or ""):
            raise ValueError(f"Bad edge id {self.id!r}")
        if self.type not in EDGE_TYPES:
            raise ValueError(f"{self.id}: unknown edge type {self.type!r}")
        if self.src not in nodes or self.dst not in nodes:
            raise ValueError(f"{self.id}: endpoint missing from graph")
        allowed_src, allowed_dst = EDGE_ENDPOINTS[self.type]
        if nodes[self.src].type not in allowed_src or nodes[self.dst].type not in allowed_dst:
            raise ValueError(f"{self.id}: {self.type} cannot join {nodes[self.src].type} -> {nodes[self.dst].type}")
        if not isinstance(self.confidence, (int, float)) or not (0 < self.confidence <= 1):
            raise ValueError(f"{self.id}: confidence must be in (0, 1]")
        if not (self.mechanism or "").strip() or len(self.mechanism) > 240:
            raise ValueError(f"{self.id}: one-line mechanism required (<=240 chars)")
        self.source.validate(self.id)
        # A supply relationship must quote the sentence that states it, not just name a company.
        if self.type == "supplies" and len(self.source.excerpt.split()) < MIN_EXCERPT_WORDS:
            raise ValueError(f"{self.id}: a supplies edge must quote the sentence that states it")
