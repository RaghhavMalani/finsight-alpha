"""Read-only, verified D0.4.1 projection for the Event Observatory."""

from __future__ import annotations

import hashlib
from functools import lru_cache
from typing import Any

from src.dynamics.hawkes_identifiability import (
    DEFAULT_D041_ARTIFACT,
    IMPLEMENTATION_SOURCES,
    PARENT_ARTIFACT,
    HawkesIdentifiabilityError,
    load_frozen_hawkes_identifiability,
    normalized_source_sha256,
)


@lru_cache(maxsize=1)
def _verified_projection(seals: tuple[str, ...]) -> dict[str, Any]:
    # Cache only a successfully verified projection. The key includes bytes
    # of the artifact and parent plus normalized implementation source seals.
    artifact = load_frozen_hawkes_identifiability()
    return {
        key: artifact[key]
        for key in (
            "schema_version",
            "milestone",
            "artifact_hash",
            "file_sha256",
            "scientific_question",
            "parent_seal",
            "preregistration",
            "execution",
            "thresholds",
            "metrics",
            "program_result",
            "observatory",
            "claim_boundary",
        )
    }


def load_hawkes_identifiability_projection() -> dict[str, Any]:
    try:
        seals = (
            hashlib.sha256(DEFAULT_D041_ARTIFACT.read_bytes()).hexdigest(),
            hashlib.sha256(PARENT_ARTIFACT.read_bytes()).hexdigest(),
            *(normalized_source_sha256(path) for path in IMPLEMENTATION_SOURCES),
        )
    except OSError as exc:
        raise HawkesIdentifiabilityError(f"D0.4.1 evidence unavailable: {exc}") from exc
    return _verified_projection(seals)
