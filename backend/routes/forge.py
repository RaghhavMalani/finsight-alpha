"""Read-only projections over frozen FinSight Forge release artifacts.

This module is intentionally an observer boundary. It validates known artifact
schemas and manifest-bound file hashes, then returns compact UI projections. It
does not import verifier, reward, benchmark, or execution implementations.
"""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query


router = APIRouter(prefix="/forge", tags=["forge observer"])

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_BASELINE_ALIAS = "forge-v0.2.5"
_BASELINE_SCHEMA = "forge-real-single-agent-baseline/0.2.5"
_TRAJECTORY_SCHEMA = "forge-real-single-agent-trajectory/0.2.5"
_SUITE_SCHEMA = "forge-real-single-agent-suite/0.2.5"
_BASELINE_DIR = _PROJECT_ROOT / "data" / "exports" / "forge_v0_2_5_real_baseline"
_SUITE_RELATIVE_PATH = "execution_source/eval/tasks/forge_v0_2_5/suite.json"
_SUITE_PATH = _BASELINE_DIR / _SUITE_RELATIVE_PATH
_REALITY_ALIAS = "forge-v0.2.4.1"
_REALITY_SCHEMA = "forge-reality-ladder/0.2.4.1"
_REALITY_PATH = (
    _PROJECT_ROOT
    / "eval"
    / "reality_ladder"
    / "forge_v0_2_4_1"
    / "reality_ladder_artifact.json"
)
_PROJECTION_SCHEMA = "forge-observer-projection/1"


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503, detail=f"Frozen artifact is unavailable: {path.name}"
        ) from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=503, detail=f"Frozen artifact cannot be read: {path.name}"
        ) from exc
    if not isinstance(value, dict):
        raise HTTPException(status_code=503, detail=f"Invalid artifact root: {path.name}")
    return value


def _artifact_sha256(path: Path) -> str:
    try:
        payload = path.read_bytes()
    except OSError as exc:
        raise HTTPException(
            status_code=503, detail=f"Frozen artifact cannot be hashed: {path.name}"
        ) from exc
    return hashlib.sha256(payload).hexdigest()


def _require_schema(document: dict[str, Any], expected: str, label: str) -> None:
    if document.get("schema_version") != expected:
        supplied = document.get("schema_version", "MISSING")
        raise HTTPException(status_code=409, detail=f"Unsupported {label} schema: {supplied}")


@lru_cache(maxsize=1)
def _baseline_documents() -> tuple[dict[str, Any], dict[str, Any]]:
    manifest = _read_json(_BASELINE_DIR / "manifest.json")
    summary = _read_json(_BASELINE_DIR / "summary.json")
    _require_schema(manifest, _BASELINE_SCHEMA, "baseline manifest")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        raise HTTPException(status_code=503, detail="Baseline manifest has no artifact map")
    for filename in ("summary.json", "episodes.jsonl"):
        expected = artifacts.get(filename)
        if not isinstance(expected, str) or _artifact_sha256(_BASELINE_DIR / filename) != expected:
            raise HTTPException(
                status_code=409, detail=f"Frozen baseline manifest mismatch: {filename}"
            )

    models = summary.get("models")
    overall = summary.get("overall")
    if not isinstance(models, list) or not isinstance(overall, dict):
        raise HTTPException(status_code=503, detail="Baseline summary shape is invalid")
    return manifest, summary


@lru_cache(maxsize=1)
def _episode_records() -> tuple[dict[str, Any], ...]:
    _baseline_documents()
    try:
        lines = _BASELINE_DIR.joinpath("episodes.jsonl").read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Frozen episode records are unavailable") from exc

    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=503, detail=f"Invalid episode record at line {line_number}"
            ) from exc
        run = record.get("run") if isinstance(record, dict) else None
        if not isinstance(run, dict) or run.get("schema_version") != _TRAJECTORY_SCHEMA:
            supplied = run.get("schema_version", "MISSING") if isinstance(run, dict) else "MISSING"
            raise HTTPException(status_code=409, detail=f"Unsupported trajectory schema: {supplied}")
        records.append(record)
    if not records:
        raise HTTPException(status_code=503, detail="Frozen baseline has no episode records")
    return tuple(records)


@lru_cache(maxsize=1)
def _task_classes() -> dict[str, str]:
    manifest, _ = _baseline_documents()
    artifacts = manifest.get("artifacts", {})
    expected_hash = artifacts.get(_SUITE_RELATIVE_PATH)
    if not isinstance(expected_hash, str) or _artifact_sha256(_SUITE_PATH) != expected_hash:
        raise HTTPException(status_code=409, detail="Frozen baseline manifest mismatch: suite.json")

    suite = _read_json(_SUITE_PATH)
    _require_schema(suite, _SUITE_SCHEMA, "task suite")
    tasks = suite.get("tasks")
    if not isinstance(tasks, list):
        raise HTTPException(status_code=503, detail="Task suite shape is invalid")

    classes: dict[str, str] = {}
    for index, task in enumerate(tasks):
        if not isinstance(task, dict):
            raise HTTPException(status_code=503, detail=f"Invalid task suite item: {index}")
        task_id = task.get("task_id")
        task_class = task.get("task_class")
        if not isinstance(task_id, str) or not isinstance(task_class, str):
            raise HTTPException(status_code=503, detail=f"Invalid task metadata: {index}")
        classes[task_id] = task_class
    return classes


@lru_cache(maxsize=1)
def _reality_document() -> dict[str, Any]:
    document = _read_json(_REALITY_PATH)
    _require_schema(document, _REALITY_SCHEMA, "Reality Ladder")
    aggregate = document.get("aggregate")
    if not isinstance(aggregate, dict) or not isinstance(aggregate.get("checkpoints"), list):
        raise HTTPException(status_code=503, detail="Reality Ladder aggregate is invalid")
    return document


def _baseline_ids(manifest: dict[str, Any]) -> set[str]:
    return {
        _BASELINE_ALIAS,
        str(manifest.get("baseline_id", "")),
        str(manifest.get("tag", "")),
    }


def _require_baseline(identifier: str) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest, summary = _baseline_documents()
    if identifier not in _baseline_ids(manifest):
        raise HTTPException(status_code=404, detail="Forge baseline not found")
    return manifest, summary


def _require_reality(identifier: str) -> dict[str, Any]:
    document = _reality_document()
    if identifier not in {_REALITY_ALIAS, str(document.get("artifact_hash", ""))}:
        raise HTTPException(status_code=404, detail="Reality Ladder artifact not found")
    return document


def _baseline_header(manifest: dict[str, Any], summary: dict[str, Any]) -> dict[str, Any]:
    return {
        "artifact_id": _BASELINE_ALIAS,
        "baseline_id": manifest["baseline_id"],
        "tag": manifest["tag"],
        "source_schema_version": manifest["schema_version"],
        "created_at": manifest["created_at"],
        "episodes": manifest["episodes"],
        "attempts_total": manifest["attempts_total"],
        "excluded_attempts": manifest["excluded_attempts"],
        "models": [item["model"] for item in summary["models"]],
        "integrity": {
            "status": "MANIFEST_MATCH",
            "checked_files": ["summary.json", "episodes.jsonl"],
            "manifest": "manifest.json",
        },
    }


def _run_summary(record: dict[str, Any]) -> dict[str, Any]:
    run = record["run"]
    identity = run.get("model_identity", {})
    task_id = run["task_id"]
    return {
        "run_id": run["trajectory_hash"],
        "episode_key": record.get("episode_key"),
        "record_hash": record.get("record_hash"),
        "task_id": task_id,
        "task_class": _task_classes().get(task_id),
        "world_hash": run["world_hash"],
        "model": identity.get("model"),
        "model_version": identity.get("model_version"),
        "seed": run["seed"],
        "completed": run["completed"],
        "failure_reason": run.get("failure_reason"),
        "decision": run.get("decision"),
        "usage": run.get("usage", {}),
        "verification": record.get("verification", {}),
    }


def _sanitize_turn(turn: dict[str, Any]) -> dict[str, Any]:
    api_evidence = turn.get("api_evidence")
    safe_evidence = {}
    if isinstance(api_evidence, dict):
        safe_evidence = {
            key: api_evidence.get(key)
            for key in (
                "billed_cost_usd",
                "cost_basis",
                "provider_request_id",
                "raw_response_sha256",
                "reasoning_tokens",
                "request_sha256",
                "response_id",
                "response_model",
                "seed_semantics",
            )
        }
    return {
        "sequence": turn.get("sequence"),
        "text": turn.get("text"),
        "tokens_in": turn.get("tokens_in"),
        "tokens_out": turn.get("tokens_out"),
        "cost_usd": turn.get("cost_usd"),
        "cost_source": turn.get("cost_source"),
        "latency_seconds": turn.get("latency_seconds"),
        "provider_request_id": turn.get("provider_request_id"),
        "api_evidence": safe_evidence,
    }


@router.get("/baselines")
def list_baselines() -> dict[str, Any]:
    manifest, summary = _baseline_documents()
    return {"schema_version": _PROJECTION_SCHEMA, "items": [_baseline_header(manifest, summary)]}


@router.get("/baselines/{baseline_id}")
def get_baseline(baseline_id: str) -> dict[str, Any]:
    manifest, summary = _require_baseline(baseline_id)
    return {
        "schema_version": _PROJECTION_SCHEMA,
        **_baseline_header(manifest, summary),
        "overall": summary["overall"],
        "model_summaries": summary["models"],
        "bindings": {
            "suite_hash": manifest["suite_hash"],
            "certification_artifact_hash": manifest["certification_artifact_hash"],
            "reality_ladder_artifact_hash": manifest["reality_ladder_artifact_hash"],
            "summary_file_hash": manifest["artifacts"]["summary.json"],
        },
        "costs": {
            "all_attempts_usd": manifest["cost_usd_all_attempts"],
            "admitted_episodes_usd": manifest["cost_usd_admitted_episodes"],
            "cost_basis": "TOKEN_ESTIMATE_NOT_INVOICE",
        },
    }


@router.get("/runs")
def list_runs(
    baseline_id: str = _BASELINE_ALIAS,
    model: str | None = None,
    verdict: str | None = Query(default=None, pattern="^(ACCEPT|REJECT|ABSTAIN)$"),
    limit: int = Query(default=100, ge=1, le=200),
) -> dict[str, Any]:
    manifest, _ = _require_baseline(baseline_id)
    items = [_run_summary(record) for record in _episode_records()]
    if model:
        items = [item for item in items if item["model"] == model]
    if verdict:
        items = [item for item in items if (item.get("decision") or {}).get("verdict") == verdict]
    items.sort(key=lambda item: (str(item["model"]), int(item["seed"]), str(item["task_id"])))
    return {
        "schema_version": _PROJECTION_SCHEMA,
        "artifact_id": _BASELINE_ALIAS,
        "artifact_hash": manifest["baseline_id"],
        "source_schema_version": manifest["schema_version"],
        "items": items[:limit],
        "matched": len(items),
    }


@router.get("/runs/{run_id}")
def get_run(run_id: str, baseline_id: str = _BASELINE_ALIAS) -> dict[str, Any]:
    manifest, _ = _require_baseline(baseline_id)
    matches = [
        record
        for record in _episode_records()
        if record["run"]["trajectory_hash"] == run_id
        or (len(run_id) >= 8 and record["run"]["trajectory_hash"].startswith(run_id))
    ]
    if not matches:
        raise HTTPException(status_code=404, detail="Forge run not found")
    if len(matches) != 1:
        raise HTTPException(status_code=409, detail="Run prefix is ambiguous")

    record = matches[0]
    run = record["run"]
    return {
        "schema_version": _PROJECTION_SCHEMA,
        "artifact_id": _BASELINE_ALIAS,
        "artifact_hash": manifest["baseline_id"],
        "source_schema_version": manifest["schema_version"],
        "episode_key": record.get("episode_key"),
        "record_hash": record.get("record_hash"),
        "task_id": record.get("task_id"),
        "task_class": _task_classes().get(str(record.get("task_id", ""))),
        "seed": record.get("seed"),
        "run": {
            key: run.get(key)
            for key in (
                "schema_version",
                "task_id",
                "task_hash",
                "world_hash",
                "model_identity",
                "model_identity_hash",
                "seed",
                "prompt_version",
                "system_prompt_hash",
                "tool_schema_hash",
                "certification_artifact_hash",
                "reality_ladder_artifact_hash",
                "actions",
                "decision",
                "usage",
                "completed",
                "failure_reason",
                "trajectory_hash",
            )
        },
        "model_turns": [_sanitize_turn(item) for item in run.get("model_turns", [])],
        "verification": record.get("verification", {}),
        "redactions": ["model_turns.api_evidence.raw_response", "model_turns.api_evidence.request"],
    }


@router.get("/reality-ladders/{artifact_id}")
def get_reality_ladder(artifact_id: str) -> dict[str, Any]:
    document = _require_reality(artifact_id)
    aggregate = document["aggregate"]
    design = document.get("design")
    task = document.get("task")
    design_metric = design.get("primary_metric") if isinstance(design, dict) else None
    task_metric = task.get("primary_metric") if isinstance(task, dict) else None
    if (
        not isinstance(design_metric, str)
        or not design_metric
        or design_metric != task_metric
    ):
        raise HTTPException(
            status_code=503, detail="Reality Ladder primary metric binding is invalid"
        )
    return {
        "schema_version": _PROJECTION_SCHEMA,
        "artifact_id": _REALITY_ALIAS,
        "artifact_hash": document["artifact_hash"],
        "source_schema_version": document["schema_version"],
        "integrity": {"status": "FROZEN_ARTIFACT", "source": "reality_ladder_artifact.json"},
        "primary_metric": design_metric,
        "aggregate": {
            "alpha_survival_ratio": aggregate["alpha_survival_ratio"],
            "checkpoints": aggregate["checkpoints"],
            "decomposition": aggregate["decomposition"],
            "decomposition_convention": aggregate["decomposition_convention"],
            "finding": aggregate["finding"],
            "largest_degradation": aggregate["largest_degradation"],
            "regime_matrix": aggregate["regime_matrix"],
        },
        "bindings": {
            "certification_artifact_hash": document.get("certification", {}).get("artifact_hash")
        },
    }


@router.get("/worlds")
def list_worlds(baseline_id: str = _BASELINE_ALIAS) -> dict[str, Any]:
    manifest, _ = _require_baseline(baseline_id)
    worlds: dict[str, dict[str, Any]] = {}
    for record in _episode_records():
        run = record["run"]
        item = worlds.setdefault(
            run["world_hash"],
            {"world_hash": run["world_hash"], "manifest_available": False, "references": []},
        )
        item["references"].append(
            {"run_id": run["trajectory_hash"], "task_id": run["task_id"], "seed": run["seed"]}
        )
    return {
        "schema_version": _PROJECTION_SCHEMA,
        "artifact_id": _BASELINE_ALIAS,
        "artifact_hash": manifest["baseline_id"],
        "source_schema_version": manifest["schema_version"],
        "items": sorted(worlds.values(), key=lambda item: item["world_hash"]),
    }


@router.get("/artifacts")
def list_artifacts() -> dict[str, Any]:
    manifest, _ = _baseline_documents()
    reality = _reality_document()
    return {
        "schema_version": _PROJECTION_SCHEMA,
        "items": [
            {
                "artifact_id": _BASELINE_ALIAS,
                "artifact_hash": manifest["baseline_id"],
                "kind": "REAL_API_BASELINE",
                "source_schema_version": manifest["schema_version"],
                "source_file_count": len(manifest["artifacts"]),
                "integrity_status": "MANIFEST_MATCH",
            },
            {
                "artifact_id": _REALITY_ALIAS,
                "artifact_hash": reality["artifact_hash"],
                "kind": "REALITY_LADDER",
                "source_schema_version": reality["schema_version"],
                "source_file_count": 1,
                "integrity_status": "FROZEN_ARTIFACT",
            },
            {
                "artifact_id": "forge-engine-certification-v0.2.4",
                "artifact_hash": manifest["certification_artifact_hash"],
                "kind": "ENGINE_CERTIFICATION",
                "source_schema_version": "forge-engine-certification/0.2.4-system-release",
                "source_file_count": 1,
                "integrity_status": "BOUND_REFERENCE",
            },
        ],
    }
