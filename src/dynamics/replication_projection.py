"""Read-only API projection for the frozen D0.3.4 replication artifact."""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

from src.dynamics.selection_freeze import canonical_sha256

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D034_ARTIFACT = (
    ROOT / "eval/dynamics/d0_3_4/evidence_complete_replication.json"
)
D034_ARTIFACT_HASH = (
    "396985c5a6ac49eae79866768b6a57fb0aa972f7d77077704d0337bbe58a4929"
)
D034_FILE_SHA256 = (
    "aeee6afb3b010ff8b7541dba3f31fe9f0276113d9bd8e27aa36b6e5cc8a9e2df"
)


class ReplicationProjectionError(ValueError):
    """Raised when the frozen artifact cannot support a safe API projection."""


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ReplicationProjectionError(f"D0.3.4 projection missing {label}")
    return value


def _project_metric(
    name: str,
    metric: Mapping[str, Any],
    classification: Mapping[str, Any],
    delta: Mapping[str, Any],
) -> dict[str, Any]:
    confirmation = _mapping(delta.get("d0_3_3_confirmation"), "confirmation metric")
    return {
        "metric": name,
        "numerator": metric.get("numerator"),
        "denominator": metric.get("denominator"),
        "estimate": metric.get("estimate"),
        "wilson95": metric.get("wilson95"),
        "definition": metric.get("definition"),
        "classification": classification.get("classification"),
        "classification_reason": classification.get("reason"),
        "gate": classification.get("gate"),
        "d0_3_3_confirmation": {
            "numerator": confirmation.get("numerator"),
            "denominator": confirmation.get("denominator"),
            "estimate": confirmation.get("estimate"),
            "wilson95": confirmation.get("wilson95"),
        },
        "absolute_delta": delta.get("absolute_delta"),
        "uncertainty_interpretation": delta.get("uncertainty_interpretation"),
    }


def build_evidence_complete_replication_projection(
    artifact: Mapping[str, Any],
) -> dict[str, Any]:
    if artifact.get("schema_version") != (
        "dynamics-evidence-complete-replication/0.3.4"
    ):
        raise ReplicationProjectionError("D0.3.4 artifact schema changed")
    if artifact.get("artifact_hash") != D034_ARTIFACT_HASH:
        raise ReplicationProjectionError("D0.3.4 content address changed")
    execution = _mapping(artifact.get("execution"), "execution summary")
    if (
        execution.get("executed_worlds") != 400
        or execution.get("admitted_worlds") != 400
        or execution.get("development_worlds") != 0
        or execution.get("tuning_events") != 0
        or execution.get("stopped_early") is not False
    ):
        raise ReplicationProjectionError("D0.3.4 evidence admission boundary changed")
    market = _mapping(artifact.get("real_market_claim"), "market boundary")
    if (
        artifact.get("market_claim_eligible") is not False
        or market.get("selected_model") != "M1"
        or market.get("market_claim") != "ABSTAIN"
        or market.get("rerun_performed") is not False
    ):
        raise ReplicationProjectionError("D0.3.4 market boundary changed")
    metrics = _mapping(artifact.get("capability_estimates"), "capability estimates")
    classifications = _mapping(
        artifact.get("capability_classifications"), "capability classifications"
    )
    deltas = _mapping(artifact.get("replication_delta"), "replication deltas")
    metric_rows = [
        _project_metric(
            name,
            _mapping(metrics.get(name), f"metric {name}"),
            _mapping(classifications.get(name), f"classification {name}"),
            _mapping(deltas.get(name), f"delta {name}"),
        )
        for name in (
            "linear_specificity",
            "false_nonlinear_discovery_rate",
            "false_basin_discovery_rate",
            "double_well_detection",
            "basin_precision",
            "basin_recall",
            "potential_topology_accuracy",
            "state_diffusion_detection",
            "numerical_failure_rate",
        )
    ]
    program = _mapping(artifact.get("program_result"), "program result")
    projection: dict[str, Any] = {
        "schema_version": "dynamics-evidence-complete-replication-projection/0.3.4",
        "milestone": "D0.3.4",
        "read_only": True,
        "source_artifact_hash": D034_ARTIFACT_HASH,
        "source_file_sha256": D034_FILE_SHA256,
        "program_result": dict(program),
        "execution": {
            "planned_worlds": execution.get("planned_worlds"),
            "executed_worlds": execution.get("executed_worlds"),
            "admitted_worlds": execution.get("admitted_worlds"),
            "development_worlds": execution.get("development_worlds"),
            "tuning_events": execution.get("tuning_events"),
            "stopped_early": execution.get("stopped_early"),
            "root_bootstraps_per_topology_world": execution.get(
                "root_bootstraps_per_topology_world"
            ),
        },
        "metrics": metric_rows,
        "decision_decomposition": artifact.get("decision_decomposition"),
        "sindy_diagnostics": artifact.get("sindy_diagnostics"),
        "failure_entropy": artifact.get("failure_entropy"),
        "frozen_instrument": artifact.get("frozen_instrument"),
        "parent_seals": artifact.get("parent_seals"),
        "real_market_claim": dict(market),
        "market_claim_eligible": False,
        "raw_world_evidence_exposed": False,
    }
    projection["projection_hash"] = canonical_sha256(projection)
    return projection


@lru_cache(maxsize=4)
def load_evidence_complete_replication_projection(
    path: Path = DEFAULT_D034_ARTIFACT,
) -> dict[str, Any]:
    if not path.exists():
        raise ReplicationProjectionError("the frozen D0.3.4 artifact is unavailable")
    if _file_sha256(path) != D034_FILE_SHA256:
        raise ReplicationProjectionError("D0.3.4 artifact bytes changed")
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ReplicationProjectionError("D0.3.4 artifact is not valid JSON") from exc
    return build_evidence_complete_replication_projection(artifact)
