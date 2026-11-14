"""Feed contract: cadence, rate limit, licence, honest delay label, keys from env only.

A feed splits into ``fetch`` (network, never in tests) and ``parse`` (pure, fixture
tested). It returns :class:`~src.live.model.Observation` objects, which have no
``available_at``: the store stamps ingestion time.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

import requests

from .. import model
from ..model import Observation

MAX_BYTES = 24 * 1024 * 1024


class FeedError(RuntimeError):
    """A failed attempt. Messages never contain URLs with credentials."""

    def __init__(self, message: str, *, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


@dataclass
class Fetched:
    raw: bytes
    url: str  # credential-free
    fetched_at: str
    sha256: str = field(init=False)

    def __post_init__(self):
        self.sha256 = model.sha256_hex(self.raw)


def http_get(url: str, *, params: dict | None = None, headers: dict | None = None,
             secret_params: tuple[str, ...] = (), timeout=(10, 40), max_bytes: int = MAX_BYTES) -> Fetched:
    """GET with the project User-Agent. ``secret_params`` never reach a log or record."""
    sent = {"User-Agent": model.USER_AGENT, "Accept": "*/*", **(headers or {})}
    try:
        # No redirects: a feed reads the host it names, never wherever a response points.
        with requests.get(url, params=params, headers=sent, timeout=timeout, stream=True,
                          allow_redirects=False) as response:
            if response.status_code == 429:
                retry = response.headers.get("Retry-After")
                raise FeedError("HTTP 429 rate limited",
                                retry_after=float(retry) if retry and retry.isdigit() else None)
            if response.status_code != 200:
                raise FeedError(f"HTTP {response.status_code}")
            declared = response.headers.get("Content-Length")
            if declared and declared.isdigit() and int(declared) > max_bytes:
                raise FeedError(f"response exceeds {max_bytes} bytes")
            chunks, size = [], 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > max_bytes:  # stop reading at the cap instead of buffering everything
                    raise FeedError(f"response exceeds {max_bytes} bytes")
                chunks.append(chunk)
    except requests.RequestException as error:
        raise FeedError("transport unavailable: " + type(error).__name__) from None
    public = {k: v for k, v in (params or {}).items() if k not in secret_params}
    shown = requests.Request("GET", url, params=public).prepare().url or url
    return Fetched(b"".join(chunks), shown, model.iso(model.utcnow()))


def content_revision(values) -> str:
    """Revision for sources without a version clock: hash of the substantive values only."""
    return "c:" + model.sha256_hex(model.canonical(values))[:16]


class Feed:
    name: str = "base"
    event_type: str = "geo.event"
    cadence_s: float = 300
    min_interval_s: float = 60  # never two requests closer than this, retries included
    delay: str = "UNKNOWN"
    confidence: str = "UNOFFICIAL"
    licence: dict = {}
    parser: str = "live-base/1"
    # Each inner tuple is a set of alternatives; every group needs one present variable.
    required_env: tuple[tuple[str, ...], ...] = ()

    def unavailable_reason(self) -> str | None:
        for group in self.required_env:
            if not any(os.getenv(name) for name in group):
                return "UNAVAILABLE: no key (" + " or ".join(group) + ")"
        return None

    def env(self, *names: str) -> str | None:
        return next((os.getenv(n) for n in names if os.getenv(n)), None)

    def fetch(self) -> list[Observation]:
        raise NotImplementedError

    # SOURCE_VERSION: the provider's own version clock (USGS updated, ALFRED vintage, NWS sent).
    # CONTENT_HASH: a hash of the substantive values; the store keeps A -> B -> A as three rows.
    revision_basis = "SOURCE_VERSION"

    def provenance(self, fetched: Fetched, **extra) -> dict:
        return {"feed": self.name, "url": fetched.url, "fetched_at": fetched.fetched_at,
                "content_sha256": fetched.sha256, "parser": self.parser, "delay": self.delay,
                "revision_basis": self.revision_basis, **extra}

    def observation(self, *, source_id: str, revision: str, observed_at: str, effective_at: str | None,
                    payload: dict, fetched: Fetched, source: str | None = None,
                    confidence: str | None = None, **prov) -> Observation:
        return Observation(type=self.event_type, source=source or self.name, source_id=str(source_id),
                           revision=str(revision), observed_at=observed_at, effective_at=effective_at,
                           licence=self.licence, confidence=confidence or self.confidence,
                           provenance=self.provenance(fetched, **prov), payload=payload)

    def describe(self) -> dict:
        return {"feed": self.name, "event_type": self.event_type, "cadence_s": self.cadence_s,
                "min_interval_s": self.min_interval_s, "delay": self.delay,
                "confidence": self.confidence, "licence": self.licence}
