"""Independent structural and numerical verification for a frozen ladder artifact."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Mapping

from src.eval.canonical import canonical_sha256
from src.execution.benchmark import ExecutionBenchmarkTask
from src.execution.reality_ladder_freeze import (
    CHECKPOINTS,
    CHECKPOINT_ENGINES,
    CHECKPOINT_LEVELS,
    FREEZE_TAG,
    METRIC_NAMES,
    REGIMES,
    SCHEMA_VERSION,
    SEEDS,
    STAGE_ASSUMPTIONS,
    STRATEGY,
    _source_sha256,
    calculate_metrics,
    deterministic_aggregate,
    strategy_orders,
)
from src.execution.reality_ladder_runner import aggregate_results
from src.execution.trust import BoundEngineTrust, CertificationIndex


def verify_reality_ladder_document(document: Mapping[str, Any], *, root: Path) -> dict[str, Any]:
    errors: list[str] = []
    value = dict(document)

    supplied_artifact_hash = value.get("artifact_hash")
    artifact_content = {key: item for key, item in value.items() if key != "artifact_hash"}
    if canonical_sha256(artifact_content) != supplied_artifact_hash:
        errors.append("artifact_hash does not verify")
    if value.get("schema_version") != SCHEMA_VERSION or value.get("tag") != FREEZE_TAG:
        errors.append("artifact schema or freeze tag is invalid")

    try:
        task = ExecutionBenchmarkTask.from_dict(value["task"])
        if task.task_hash != value.get("task_hash"):
            errors.append("task_hash does not verify")
        if task.engine_trust_policy is None:
            errors.append("task engine trust policy is missing")
    except (KeyError, TypeError, ValueError) as exc:
        task = None
        errors.append(f"embedded task is invalid: {exc}")

    if value.get("strategy") != STRATEGY or value.get("strategy_hash") != canonical_sha256(STRATEGY):
        errors.append("strategy identity does not verify")
    design = value.get("design", {})
    if design.get("strategies") != 1 or design.get("regimes") != list(REGIMES) or design.get("seeds") != list(SEEDS):
        errors.append("frozen strategy, regime, or seed cardinality changed")
    if design.get("certified_engines") != ["vectorbt", "nautilus"]:
        errors.append("reward-bearing engine set changed")
    if design.get("checkpoints") != list(CHECKPOINTS):
        errors.append("reality checkpoints changed")
    if value.get("stage_assumptions") != STAGE_ASSUMPTIONS:
        errors.append("stage assumptions changed")

    worlds = value.get("worlds", [])
    world_by_hash: dict[str, Mapping[str, Any]] = {}
    for world in worlds:
        payload = {key: item for key, item in world.items() if key != "world_hash"}
        world_hash = world.get("world_hash")
        if canonical_sha256(payload) != world_hash:
            errors.append(f"world hash does not verify for {world.get('regime')}/{world.get('seed')}")
        world_by_hash[str(world_hash)] = world
    if len(worlds) != len(REGIMES) * len(SEEDS) * 2 or len(world_by_hash) != len(worlds):
        errors.append("world grid is incomplete or contains duplicate identities")

    cases = value.get("cases", [])
    case_keys = {(case.get("regime"), case.get("seed")) for case in cases}
    expected_case_keys = {(regime, seed) for regime in REGIMES for seed in SEEDS}
    if case_keys != expected_case_keys or len(cases) != len(expected_case_keys):
        errors.append("case grid is incomplete or duplicated")
    for case in cases:
        for world_key, orders_key in (("base_world_hash", "base_orders"), ("stress_world_hash", "stress_orders")):
            world = world_by_hash.get(str(case.get(world_key)))
            if world is None:
                errors.append(f"case {case.get('case_id')} references a missing world")
                continue
            orders = case.get(orders_key, [])
            if orders != strategy_orders(world):
                errors.append(f"case {case.get('case_id')} orders do not reproduce from the strategy")
            for order in orders:
                if int(order["submitted_ns"]) <= int(order["signal_ns"]):
                    errors.append(f"case {case.get('case_id')} violates causal order timing")

    certification_path = root / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"
    try:
        certifications = CertificationIndex.load(certification_path)
        source = value.get("certification_source", {})
        if source.get("artifact_hash") != certifications.artifact_hash:
            errors.append("certification source artifact changed")
        if task is not None and task.engine_trust_policy is not None:
            trust = BoundEngineTrust(task.engine_trust_policy, certifications)
            if trust.require("vectorbt").certification_level != "C4" or trust.require("nautilus").certification_level != "C4":
                errors.append("reward-bearing engines are not C4")
            if trust.decision("hftbacktest")["usable"]:
                errors.append("hftbacktest is usable despite the task allowlist")
    except (KeyError, TypeError, ValueError, RuntimeError) as exc:
        errors.append(f"certification binding is invalid: {exc}")

    records = value.get("records", [])
    expected_record_keys = {
        (regime, seed, checkpoint)
        for regime in REGIMES for seed in SEEDS for checkpoint in CHECKPOINTS
    }
    record_keys = {(record.get("regime"), record.get("seed"), record.get("checkpoint")) for record in records}
    if record_keys != expected_record_keys or len(records) != len(expected_record_keys):
        errors.append("stage record grid is incomplete or duplicated")
    for record in records:
        checkpoint = record.get("checkpoint")
        if checkpoint not in CHECKPOINTS:
            continue
        content = {key: item for key, item in record.items() if key != "record_hash"}
        if canonical_sha256(content) != record.get("record_hash"):
            errors.append(f"record hash does not verify for {record.get('regime')}/{record.get('seed')}/{checkpoint}")
        deterministic_content = {
            key: item for key, item in content.items()
            if key not in {"deterministic_hash", "runtime_seconds", "native_request_hash", "native_output_hash", "runtime_identity"}
        }
        if canonical_sha256(deterministic_content) != record.get("deterministic_hash"):
            errors.append(f"deterministic record hash does not verify for {record.get('regime')}/{record.get('seed')}/{checkpoint}")
        if record.get("reality_level") != CHECKPOINT_LEVELS[checkpoint] or record.get("engine") != CHECKPOINT_ENGINES[checkpoint]:
            errors.append(f"checkpoint routing is invalid for {record.get('regime')}/{record.get('seed')}/{checkpoint}")
        if record.get("strategy_hash") != value.get("strategy_hash"):
            errors.append(f"strategy hash mismatch in {record.get('regime')}/{record.get('seed')}/{checkpoint}")
        world = world_by_hash.get(str(record.get("world_hash")))
        case = next((item for item in cases if item.get("regime") == record.get("regime") and item.get("seed") == record.get("seed")), None)
        if world is None or case is None:
            continue
        orders_key = "stress_orders" if checkpoint == "L4_COUNTERFACTUAL_STRESS" else "base_orders"
        expected_metrics = calculate_metrics(
            world,
            case[orders_key],
            record.get("fills", []),
            assumptions=STAGE_ASSUMPTIONS[checkpoint],
        )
        if record.get("metrics") != expected_metrics:
            errors.append(f"metrics do not reproduce for {record.get('regime')}/{record.get('seed')}/{checkpoint}")
        metrics = record.get("metrics", {})
        if set(metrics) != set(METRIC_NAMES):
            errors.append(f"metric set is incomplete for {record.get('regime')}/{record.get('seed')}/{checkpoint}")
        elif any(not isinstance(metrics[name], (int, float)) or not math.isfinite(metrics[name]) for name in METRIC_NAMES):
            errors.append(f"non-finite metric in {record.get('regime')}/{record.get('seed')}/{checkpoint}")
        fingerprint = record.get("engine_fingerprint", {})
        if checkpoint != "L0_ANALYTICAL" and fingerprint.get("certification_level") != "C4":
            errors.append(f"uncertified engine fingerprint in {record.get('regime')}/{record.get('seed')}/{checkpoint}")

    try:
        aggregate = aggregate_results(records)
        if aggregate != value.get("aggregate"):
            errors.append("aggregate results do not reproduce from stage records")
    except (KeyError, TypeError, ValueError) as exc:
        errors.append(f"aggregate results are invalid: {exc}")

    source_manifest = value.get("source_manifest", {})
    for relative, expected_hash in source_manifest.items():
        path = root / relative
        if not path.is_file() or _source_sha256(path) != expected_hash:
            errors.append(f"source manifest mismatch: {relative}")
    evidence = {
        "task_hash": value.get("task_hash"),
        "strategy_hash": value.get("strategy_hash"),
        "world_hashes": [world.get("world_hash") for world in worlds],
        "deterministic_record_hashes": [record.get("deterministic_hash") for record in records],
        "aggregate": deterministic_aggregate(value.get("aggregate", {})),
        "certification_artifact_hash": value.get("certification_source", {}).get("artifact_hash"),
        "source_manifest": source_manifest,
    }
    if canonical_sha256(evidence) != value.get("evidence_hash"):
        errors.append("evidence_hash does not verify")
    if not value.get("acceptance") or not all(value["acceptance"].values()):
        errors.append("one or more freeze acceptance checks failed")

    return {
        "valid": not errors,
        "schema_version": value.get("schema_version"),
        "artifact_hash": supplied_artifact_hash,
        "evidence_hash": value.get("evidence_hash"),
        "records": len(records),
        "cases": len(cases),
        "alpha_survival_ratio": value.get("aggregate", {}).get("alpha_survival_ratio"),
        "errors": errors,
    }


def verify_reality_ladder_file(path: Path, *, root: Path) -> dict[str, Any]:
    return verify_reality_ladder_document(json.loads(path.read_text(encoding="utf-8")), root=root)
