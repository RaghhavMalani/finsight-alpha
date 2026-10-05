"""Read-only microscope projection; verification never runs a benchmark fit."""

from __future__ import annotations

import copy
import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from src.dynamics.hawkes_boundary import (
    ARTIFACT,
    PARENTS,
    ROOT,
    SOURCES,
    BoundaryEvidenceError,
    source_hash,
)
from src.dynamics.hawkes_boundary_verifier import verify_hawkes_boundary


def load_frozen_boundary(path: Path = ARTIFACT) -> dict[str, Any]:
    try:
        raw = path.read_bytes()
        payload = json.loads(raw)
        report = verify_hawkes_boundary(payload)
        if not report["valid"]:
            raise BoundaryEvidenceError(
                "D0.4.1.1 failed closed: " + "; ".join(report["errors"])
            )
        payload["file_sha256"] = hashlib.sha256(raw).hexdigest()
        return payload
    except (OSError, ValueError, TypeError) as exc:
        raise BoundaryEvidenceError(f"D0.4.1.1 evidence unavailable: {exc}") from exc


def project_boundary(payload: dict) -> dict:
    result = {
        k: payload[k]
        for k in (
            "schema_version",
            "milestone",
            "artifact_hash",
            "file_sha256",
            "parent_seals",
            "preregistration",
            "execution",
            "thresholds",
            "uncertainty_policy",
            "claims",
            "summary",
            "protocol_names",
        )
    }
    representatives = []
    for record in payload["observatory"]["representatives"]:
        latent = record["latent"]
        rows = []
        for row in record["protocols"]:
            rows.append(
                {
                    "protocol": row["protocol"]["name"],
                    "fit": {
                        k: row["fit"][k]
                        for k in (
                            "baseline",
                            "alpha",
                            "beta",
                            "branching_matrix",
                            "spectral_radius",
                            "optimizer",
                        )
                    },
                    **{
                        k: row[k]
                        for k in (
                            "geometry",
                            "graph",
                            "true_topology",
                            "fitted_topology",
                            "errors",
                            "residuals",
                            "structural_identifiability",
                            "edge_failures",
                            "comparison_to_zero",
                        )
                    },
                    "methods": {
                        k: {"available": v["available"], "reason": v.get("reason")}
                        for k, v in row["uncertainty"].items()
                    },
                }
            )
        representatives.append(
            {
                "id": latent["spec"]["id"],
                "seed": latent["spec"]["seed"],
                "family": latent["spec"]["family"],
                "information": latent["spec"]["information"],
                "regime": latent["spec"]["regime"],
                "counts": latent["counts"],
                "horizon": latent["horizon"],
                "half_life": latent["half_life"],
                "hash": latent["hash"],
                "truth": record["truth"],
                "protocols": rows,
            }
        )
    result["representatives"] = representatives
    return result


@lru_cache(maxsize=1)
def _verified_projection(seals: tuple[str, ...]) -> dict:
    return project_boundary(load_frozen_boundary())


def load_boundary_projection() -> dict:
    try:
        parent_sources = json.loads(
            (ROOT / PARENTS["D0.4.1"][0]).read_text(encoding="utf-8")
        )["implementation_sources"]
        paths = [ROOT / p for p in (*SOURCES, *parent_sources)]
        seals = (
            hashlib.sha256(ARTIFACT.read_bytes()).hexdigest(),
            *(
                hashlib.sha256((ROOT / p[0]).read_bytes()).hexdigest()
                for p in PARENTS.values()
            ),
            *(source_hash(p) for p in paths),
        )
        return copy.deepcopy(_verified_projection(seals))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise BoundaryEvidenceError(f"D0.4.1.1 evidence unavailable: {exc}") from exc
