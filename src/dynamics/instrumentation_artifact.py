"""Freeze and verify the D0.3.3.2 evidence-only artifact."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping

from src.dynamics.evidence_contract import (
    D033_SOURCE_SHA256,
    EvidenceContractError,
    FROZEN_THRESHOLDS,
    PARENT_SEALS,
    REPLICATION_ARTIFACT_SPEC,
    ROLE_SECTION_REQUIREMENTS,
    STREAM_CONTRACTS,
    WORLD_EVIDENCE_SCHEMA,
)
from src.dynamics.selection_freeze import canonical_sha256

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D0332_ARTIFACT = (
    ROOT / "eval/dynamics/d0_3_3_2/evidence_instrumentation_contract.json"
)
INSTRUMENTATION_SOURCES = (
    Path(__file__).with_name("evidence_contract.py"),
    Path(__file__).with_name("evidence_capture.py"),
    Path(__file__),
)

CAPTURE_ENTRY_POINTS = [
    "capture_sindy_bootstrap_evidence",
    "capture_state_diffusion_evidence",
    "capture_topology_stage_evidence",
    "make_world_evidence_record",
    "verify_world_evidence_record",
]


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _source_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def _source_seals() -> list[dict[str, str]]:
    return [
        {
            "source": str(path.relative_to(ROOT)).replace("\\", "/"),
            "sha256": _source_sha256(path),
        }
        for path in INSTRUMENTATION_SOURCES
    ]


def build_evidence_instrumentation_contract() -> dict[str, Any]:
    """Build the contract without executing or replaying a scientific world."""

    payload: dict[str, Any] = {
        "schema_version": "dynamics-evidence-instrumentation-contract/0.3.3.2",
        "milestone": "D0.3.3.2",
        "frozen": True,
        "title": "Evidence Instrumentation Contract",
        "purpose": (
            "Make every causal transition required by the next frozen replication "
            "observable without changing the D0.3.3 instrument."
        ),
        "parent_seals": [dict(row) for row in PARENT_SEALS],
        "frozen_instrument": {
            "milestone": "D0.3.3",
            "estimator_source_sha256": D033_SOURCE_SHA256,
            "thresholds": dict(FROZEN_THRESHOLDS),
            "mutation_policy": "NO ESTIMATOR OR THRESHOLD CHANGES",
        },
        "boundaries": {
            "worlds_executed": 0,
            "scientific_outcome_claims": False,
            "effect_sizes_estimated": False,
            "estimator_rerun": False,
            "threshold_selection": False,
            "threshold_changes": False,
            "new_estimator_added": False,
            "real_market_rerun": False,
            "hawkes_started": False,
        },
        "contract_status": "READY_FOR_EVIDENCE_COMPLETE_REPLICATION",
        "role_section_requirements": {
            role: list(sections) for role, sections in ROLE_SECTION_REQUIREMENTS.items()
        },
        "stream_contracts": STREAM_CONTRACTS,
        "world_evidence_schema": WORLD_EVIDENCE_SCHEMA,
        "replication_artifact_specification": REPLICATION_ARTIFACT_SPEC,
        "capture_implementation": {
            "sources": _source_seals(),
            "entry_points": CAPTURE_ENTRY_POINTS,
        },
        "evidence_records": [],
        "scientific_result": None,
        "market_claim_eligible": False,
        "real_market_claim": {
            "selected_model": "M1",
            "market_claim": "ABSTAIN",
            "rerun_performed": False,
            "interpretation": (
                "No nonlinear structure was certified by an estimator whose "
                "nonlinear identification power is currently insufficient."
            ),
        },
        "routing": {
            "next_milestone": "D0.3.4_FROZEN_LARGE_SAMPLE_REPLICATION",
            "hawkes_deferred": True,
        },
    }
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


def _local_lineage_errors() -> list[str]:
    errors: list[str] = []
    for seal in PARENT_SEALS:
        artifact_path = ROOT / seal["artifact"]
        source_path = ROOT / seal["source"]
        if not artifact_path.exists() or _sha256_file(artifact_path) != seal["file_sha256"]:
            errors.append(f"parent artifact bytes changed: {seal['milestone']}")
        else:
            try:
                body = json.loads(artifact_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                errors.append(f"parent artifact JSON is invalid: {seal['milestone']}")
            else:
                if body.get("artifact_hash") != seal["artifact_hash"]:
                    errors.append(f"parent content address changed: {seal['milestone']}")
        if not source_path.exists() or _source_sha256(source_path) != seal["source_sha256"]:
            errors.append(f"parent source bytes changed: {seal['milestone']}")
    return errors


def verify_evidence_instrumentation_contract(
    artifact: Mapping[str, Any], *, verify_local_sources: bool = True
) -> dict[str, Any]:
    """Verify lineage, schema, content address, and the zero-outcome boundary."""

    errors: list[str] = []
    body = dict(artifact)
    claimed_hash = body.pop("artifact_hash", None)
    calculated_hash = canonical_sha256(body)
    if claimed_hash != calculated_hash:
        errors.append("artifact_hash does not match canonical payload")
    if artifact.get("schema_version") != (
        "dynamics-evidence-instrumentation-contract/0.3.3.2"
    ):
        errors.append("schema_version is not the D0.3.3.2 contract")
    if artifact.get("milestone") != "D0.3.3.2" or artifact.get("frozen") is not True:
        errors.append("D0.3.3.2 contract identity changed")
    if artifact.get("parent_seals") != [dict(row) for row in PARENT_SEALS]:
        errors.append("parent seals changed")

    instrument = artifact.get("frozen_instrument", {})
    if not isinstance(instrument, Mapping):
        errors.append("frozen instrument declaration is missing")
        instrument = {}
    if instrument.get("estimator_source_sha256") != D033_SOURCE_SHA256:
        errors.append("D0.3.3 estimator source seal changed")
    if instrument.get("thresholds") != FROZEN_THRESHOLDS:
        errors.append("D0.3.3 thresholds changed")
    if instrument.get("mutation_policy") != "NO ESTIMATOR OR THRESHOLD CHANGES":
        errors.append("instrument mutation policy changed")

    boundaries = artifact.get("boundaries", {})
    if not isinstance(boundaries, Mapping):
        errors.append("contract boundaries are missing")
        boundaries = {}
    required_false = (
        "scientific_outcome_claims",
        "effect_sizes_estimated",
        "estimator_rerun",
        "threshold_selection",
        "threshold_changes",
        "new_estimator_added",
        "real_market_rerun",
        "hawkes_started",
    )
    if boundaries.get("worlds_executed") != 0 or any(
        boundaries.get(field) is not False for field in required_false
    ):
        errors.append("evidence-only boundary changed")
    if artifact.get("evidence_records") != []:
        errors.append("D0.3.3.2 must not contain executed world evidence")
    if artifact.get("scientific_result") is not None:
        errors.append("D0.3.3.2 must not claim a scientific result")
    if artifact.get("market_claim_eligible") is not False:
        errors.append("market_claim_eligible must remain false")
    market = artifact.get("real_market_claim", {})
    if (
        not isinstance(market, Mapping)
        or market.get("market_claim") != "ABSTAIN"
        or market.get("rerun_performed") is not False
    ):
        errors.append("real-market claim boundary changed")

    expected_roles = {
        role: list(sections) for role, sections in ROLE_SECTION_REQUIREMENTS.items()
    }
    if artifact.get("role_section_requirements") != expected_roles:
        errors.append("role evidence requirements changed")
    if artifact.get("stream_contracts") != STREAM_CONTRACTS:
        errors.append("stream contracts changed")
    if artifact.get("world_evidence_schema") != WORLD_EVIDENCE_SCHEMA:
        errors.append("world evidence schema changed")
    if artifact.get("replication_artifact_specification") != REPLICATION_ARTIFACT_SPEC:
        errors.append("replication artifact specification changed")
    capture = artifact.get("capture_implementation", {})
    if not isinstance(capture, Mapping):
        errors.append("capture implementation seal is missing")
        capture = {}
    if capture.get("entry_points") != CAPTURE_ENTRY_POINTS:
        errors.append("capture entry-point contract changed")
    if verify_local_sources:
        errors.extend(_local_lineage_errors())
        if capture.get("sources") != _source_seals():
            errors.append("local D0.3.3.2 capture sources changed")
    return {
        "valid": not errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "worlds_executed": boundaries.get("worlds_executed"),
        "contract_status": artifact.get("contract_status"),
        "errors": errors,
    }


def load_frozen_evidence_instrumentation_contract(
    path: Path = DEFAULT_D0332_ARTIFACT,
) -> dict[str, Any]:
    if not path.exists():
        raise EvidenceContractError(
            "the frozen D0.3.3.2 contract is unavailable; run the freeze script"
        )
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise EvidenceContractError("the D0.3.3.2 contract is not valid JSON") from exc
    verification = verify_evidence_instrumentation_contract(artifact)
    if not verification["valid"]:
        raise EvidenceContractError("; ".join(verification["errors"]))
    return artifact
