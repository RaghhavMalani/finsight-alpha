"""Audited recovery of an interrupted baseline; never discards paid evidence."""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from src.eval.canonical import canonical_sha256, sha256_bytes

PROTOCOL_SOURCES = (
    "src/behavioral/contracts.py", "src/behavioral/tool_plane.py",
    "src/behavioral/agent.py", "scripts/build_real_single_agent_suite.py",
    "eval/tasks/forge_v0_2_5/suite.json", "eval/models/forge_v0_2_5_openai.json",
)


def snapshot_checkpoint(checkpoint, snapshot):
    """Copy the stopped partial checkpoint byte-for-byte before recovery."""
    checkpoint, snapshot = Path(checkpoint), Path(snapshot)
    if snapshot.exists():
        raise RuntimeError("historical checkpoint snapshot already exists")
    shutil.copytree(checkpoint, snapshot, copy_function=shutil.copyfile)
    return {
        path.relative_to(snapshot).as_posix(): sha256_bytes(path.read_bytes())
        for path in snapshot.rglob("*") if path.is_file()
    }


def recovery_info(directory, records):
    path = Path(directory) / "recovery.json"
    if not path.exists():
        return {}, 0.0
    value = json.loads(path.read_text(encoding="utf-8"))
    if canonical_sha256({k: v for k, v in value.items() if k != "recovery_hash"}) != value["recovery_hash"]:
        raise RuntimeError("recovery audit hash mismatch")
    if value["schema_version"] != "forge-interrupted-baseline-recovery/0.2.5":
        raise RuntimeError("unsupported recovery audit")
    history = Path(directory) / "historical_partial_checkpoint"
    if not history.is_dir():
        history = Path(directory).with_name(value["historical_checkpoint_path"])
    actual_history = {
        item.relative_to(history).as_posix(): sha256_bytes(item.read_bytes())
        for item in history.rglob("*") if item.is_file()
    }
    if actual_history != value["historical_checkpoint_manifest"]:
        raise RuntimeError("historical checkpoint snapshot was modified")
    original_config = json.loads((Path(directory) / "original_run_config.json").read_text(encoding="utf-8"))
    if original_config["source_hashes"] != value["original_source_hashes"]:
        raise RuntimeError("original source configuration mismatch")
    for name, digest in value["original_source_hashes"].items():
        if sha256_bytes((Path(directory) / "execution_source" / name).read_bytes()) != digest:
            raise RuntimeError("original execution source was modified")
    for name in PROTOCOL_SOURCES:
        if value["original_source_hashes"][name] != value["resumed_source_hashes"][name]:
            raise RuntimeError("recovery cannot change frozen protocol")
    original = [json.loads(line) for line in (Path(directory) / "original_episodes.jsonl").read_text(encoding="utf-8").splitlines()]
    current = {r["episode_key"]: r for r in records}
    for record in original:
        if canonical_sha256({k: v for k, v in record.items() if k != "record_hash"}) != record["record_hash"]:
            raise RuntimeError("original episode record was modified")
        if current[record["episode_key"]]["run"] != record["run"]:
            raise RuntimeError("recovery altered a paid trajectory")
    if [r["episode_key"] for r in original] != value["preserved_episode_keys"]:
        raise RuntimeError("recovery episode membership mismatch")
    attempts = value["interrupted_attempts"]
    calls = {}
    for attempt in attempts:
        if attempt["status"] != "INTERRUPTED_EXCLUDED" or attempt["wall_seconds"] is not None:
            raise RuntimeError("interrupted attempt cannot claim complete timing")
        for call in attempt["calls"]:
            if call["call_id"] in calls:
                raise RuntimeError("duplicate interrupted paid request")
            calls[call["call_id"]] = call
    return calls, sum(c["cost_usd"] for c in calls.values())


def prepare_recovery(root, checkpoint, suite, certifications):
    # This operation must be explicitly invoked after the owning process stops.
    from src.behavioral.baseline import SOURCE_PATHS, _episode_key
    from src.behavioral.agent import AgentRun
    from src.behavioral.verifier import BehavioralVerifier
    from src.behavioral.openai_api import ledger_state, frozen_models
    root, checkpoint = Path(root), Path(checkpoint)
    if (checkpoint / "run.lock").exists():
        raise RuntimeError("inspect and remove the dead process lock before recovery")
    if (checkpoint / "recovery.json").exists():
        raise RuntimeError("recovery already prepared; never repeat migration")
    snapshot = checkpoint.with_name(checkpoint.name + ".interrupted-history")
    if not snapshot.is_dir():
        raise RuntimeError("byte-preserved interrupted checkpoint snapshot is required")
    historical_manifest = {
        path.relative_to(snapshot).as_posix(): sha256_bytes(path.read_bytes())
        for path in snapshot.rglob("*") if path.is_file()
    }
    config = json.loads((checkpoint / "original_run_config.json").read_text(encoding="utf-8"))
    records = [json.loads(line) for line in (checkpoint / "original_episodes.jsonl").read_text(encoding="utf-8").splitlines()]
    pending, settled, costs = ledger_state(checkpoint / "requests.jsonl")
    if pending:
        raise RuntimeError("unresolved billing blocks recovery")
    bound = {t["api_evidence"]["call_id"] for r in records for t in r["run"]["model_turns"]}
    orphaned = set(settled) - bound
    if not orphaned:
        raise RuntimeError("no interrupted paid request to recover")
    complete = {r["episode_key"] for r in records}
    missing = [(m, seed, task) for m in frozen_models() for seed in config["seeds"] for task in suite.tasks
               if _episode_key(task.task_id, m.identity_hash, seed) not in complete]
    model, seed, task = missing[0]
    for key in orphaned:
        event = settled[key]
        public_task = json.loads(event["evidence"]["request"]["messages"][1]["content"].removeprefix("TASK "))
        if event["model"] != model.model or public_task != task.public_dict():
            raise RuntimeError("orphan response does not belong to next interrupted episode")
    sources = {name: sha256_bytes((root / name).read_bytes().replace(b"\r\n", b"\n")) for name in SOURCE_PATHS}
    for name in PROTOCOL_SOURCES:
        if sources[name] != config["source_hashes"][name]:
            raise RuntimeError("frozen task/prompt/tool/model protocol changed")
    verifier = BehavioralVerifier(certifications)
    tasks = {t.task_id: t for t in suite.tasks}
    revised = []
    for record in records:
        run = AgentRun.from_dict(record["run"])
        value = {k: v for k, v in record.items() if k not in {"verification", "record_hash"}}
        value["verification"] = verifier.verify(tasks[run.task_id], run).to_dict()
        value["record_hash"] = canonical_sha256(value)
        revised.append(value)
    recovery = dict(schema_version="forge-interrupted-baseline-recovery/0.2.5",
        reason="Correct rejected-tool-attempt metering; rerun only the interrupted episode.",
        original_source_hashes=config["source_hashes"], resumed_source_hashes=sources,
        historical_checkpoint_path=snapshot.name,
        historical_checkpoint_manifest=historical_manifest,
        preserved_episode_keys=[r["episode_key"] for r in records],
        prior_call_ids=list(settled),
        interrupted_attempts=[dict(status="INTERRUPTED_EXCLUDED", task_id=task.task_id,
            model=model.model, seed=seed, wall_seconds=None,
            calls=[settled[key] for key in sorted(orphaned)])])
    recovery["recovery_hash"] = canonical_sha256(recovery)
    (checkpoint / "recovery.json").write_text(json.dumps(recovery, indent=2) + "\n", encoding="utf-8")
    recovery_info(checkpoint, revised)
    # Originals remain immutable; only derived grading and active configuration change.
    config["source_hashes"] = sources
    for name, payload in (
        ("run_config.json", json.dumps(config, indent=2) + "\n"),
        ("episodes.jsonl", "".join(json.dumps(r, sort_keys=True, separators=(",", ":")) + "\n" for r in revised)),
    ):
        temporary = checkpoint / (name + ".recovered")
        with temporary.open("xb") as stream:
            stream.write(payload.encode())
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(checkpoint / name)
    return recovery


def prepare_packaging_repair(root, checkpoint):
    """Audit a post-generation packaging-only source change after all 54 episodes."""
    from src.behavioral.baseline import SOURCE_PATHS
    from src.behavioral.openai_api import ledger_state

    root, checkpoint = Path(root), Path(checkpoint)
    if (checkpoint / "run.lock").exists():
        raise RuntimeError("runner must be stopped before packaging repair")
    if (checkpoint / "packaging_repair.json").exists():
        raise RuntimeError("packaging repair already prepared")
    records = [
        json.loads(line)
        for line in (checkpoint / "episodes.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    if len(records) != 54 or any(not record["run"]["completed"] for record in records):
        raise RuntimeError("packaging repair requires 54 complete admitted episodes")
    interrupted, _ = recovery_info(checkpoint, records)
    pending, settled, _ = ledger_state(checkpoint / "requests.jsonl")
    bound = {
        turn["api_evidence"]["call_id"]
        for record in records for turn in record["run"]["model_turns"]
    }
    if pending or set(settled) != bound | set(interrupted):
        raise RuntimeError("paid request ledger is incomplete")
    config_path = checkpoint / "run_config.json"
    old_config_bytes = config_path.read_bytes()
    old_config = json.loads(old_config_bytes)
    current_sources = {
        name: sha256_bytes((root / name).read_bytes().replace(b"\r\n", b"\n"))
        for name in SOURCE_PATHS
    }
    for name in PROTOCOL_SOURCES:
        if current_sources[name] != old_config["source_hashes"][name]:
            raise RuntimeError("packaging repair cannot change frozen generation protocol")
    completed_config = checkpoint / "completed_run_config.json"
    with completed_config.open("xb") as stream:
        stream.write(old_config_bytes)
        stream.flush()
        os.fsync(stream.fileno())
    audit = {
        "schema_version": "forge-post-generation-packaging-repair/0.2.5",
        "reason": "Load excluded-attempt recovery accounting before manifest assembly.",
        "episodes_sha256": sha256_bytes((checkpoint / "episodes.jsonl").read_bytes()),
        "requests_sha256": sha256_bytes((checkpoint / "requests.jsonl").read_bytes()),
        "completed_source_hashes": old_config["source_hashes"],
        "packaging_source_hashes": current_sources,
        "model_api_calls_after_completion": 0,
    }
    audit["repair_hash"] = canonical_sha256(audit)
    (checkpoint / "packaging_repair.json").write_text(
        json.dumps(audit, indent=2) + "\n", encoding="utf-8"
    )
    old_config["source_hashes"] = current_sources
    temporary = checkpoint / "run_config.json.packaging"
    with temporary.open("xb") as stream:
        stream.write((json.dumps(old_config, indent=2) + "\n").encode())
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(config_path)
    return audit
