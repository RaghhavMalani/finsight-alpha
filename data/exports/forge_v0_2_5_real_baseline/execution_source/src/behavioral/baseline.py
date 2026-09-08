"""Resumable 54-episode runner and independent artifact verifier for v0.2.5."""

from __future__ import annotations

import json
import math
import shutil
import os
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

from src.behavioral.agent import AgentRun, ModelClient, SingleResearchAgent
from src.behavioral.contracts import BehavioralSuite, ModelIdentity
from src.behavioral.verifier import (
    BehavioralVerification,
    BehavioralVerifier,
    summarize_verifications,
)
from src.eval.canonical import canonical_sha256, sha256_bytes
from src.execution.trust import CertificationIndex


BASELINE_TAG = "FORGE_REAL_SINGLE_AGENT_BASELINE_V0_2_5"
DEFAULT_SEEDS = (101, 211, 307)
SOURCE_PATHS = (
    "src/behavioral/contracts.py",
    "src/behavioral/tool_plane.py",
    "src/behavioral/agent.py",
    "src/behavioral/verifier.py",
    "src/behavioral/baseline.py",
    "src/behavioral/openai_api.py",
    "eval/models/forge_v0_2_5_openai.json",
    "scripts/build_real_single_agent_suite.py",
    "scripts/run_real_single_agent_baseline.py",
    "scripts/verify_real_single_agent_baseline.py",
    "eval/tasks/forge_v0_2_5/suite.json",
)


def _append_jsonl(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"
    descriptor = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o644)
    try:
        os.write(descriptor, payload.encode("utf-8"))
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _episode_key(task_id: str, identity_hash: str, seed: int) -> str:
    return canonical_sha256(
        {"task_id": task_id, "model_identity_hash": identity_hash, "seed": seed}
    )


def _model_summary(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        groups[record["run"]["model_identity_hash"]].append(record)
    rows = []
    for identity_hash, group in sorted(groups.items()):
        paired = [
            (
                BehavioralVerification(**item["verification"]),
                AgentRun.from_dict(item["run"]),
            )
            for item in group
        ]
        metrics = summarize_verifications(paired)
        identity = group[0]["run"]["model_identity"]
        rows.append(
            {
                "model_identity_hash": identity_hash,
                "provider": identity["provider"],
                "model": identity["model"],
                **metrics,
            }
        )
    return rows


class LiveBaselineRunner:
    """Run three real models over six cases and three seeds with durable checkpoints."""

    def __init__(
        self,
        *,
        root: Path,
        suite: BehavioralSuite,
        certifications: CertificationIndex,
        models: tuple[ModelIdentity, ...],
        client_factory: Callable[[ModelIdentity], ModelClient],
        output: Path,
        authorized_total_cost_usd: float,
        seeds: tuple[int, ...] = DEFAULT_SEEDS,
    ) -> None:
        self.root = root.resolve()
        self.suite = suite
        self.certifications = certifications
        self.models = models
        self.client_factory = client_factory
        self.output = output.resolve()
        self.authorized_total_cost_usd = float(authorized_total_cost_usd)
        self.seeds = seeds
        self.openai_run = any(item.provider == "openai" for item in models)
        if self.openai_run:
            from src.behavioral.openai_api import GLOBAL_CAP, frozen_models, OpenAIFactory
            if models != frozen_models() or authorized_total_cost_usd != GLOBAL_CAP:
                raise ValueError("OpenAI baseline must use the frozen three tiers and $8 cap")
            if not isinstance(client_factory, OpenAIFactory):
                raise ValueError("OpenAI baseline requires the budget-enforcing OpenAIFactory")
            expected_ledger = self.output.with_name(f".{self.output.name}.checkpoint") / "requests.jsonl"
            if client_factory.ledger.path.resolve() != expected_ledger:
                raise ValueError("OpenAI ledger must use the locked baseline checkpoint")
        if len(models) != 3 or len({item.identity_hash for item in models}) != 3:
            raise ValueError("v0.2.5 requires exactly three unique model identities")
        if any(item.model_kind != "live" for item in models):
            raise ValueError("v0.2.5 freeze accepts live model identities only")
        if len(seeds) != 3 or len(set(seeds)) != 3 or any(seed < 0 for seed in seeds):
            raise ValueError("v0.2.5 requires exactly three unique non-negative seeds")
        if not math.isfinite(authorized_total_cost_usd) or authorized_total_cost_usd <= 0:
            raise ValueError("authorized_total_cost_usd must be positive")
        if suite.certification_artifact_hash != certifications.artifact_hash:
            raise ValueError("suite is not bound to the loaded certification artifact")

    def run(self) -> dict[str, Any]:
        checkpoint = self.output.with_name(f".{self.output.name}.checkpoint")
        checkpoint.mkdir(parents=True, exist_ok=True)
        lock = checkpoint / "run.lock"
        # An interrupted process leaves its lock: fail closed until inspected.
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
        try:
            os.write(descriptor, str(os.getpid()).encode())
            os.fsync(descriptor)
            return self._run()
        finally:
            os.close(descriptor)
            lock.unlink(missing_ok=True)

    def _run(self) -> dict[str, Any]:
        if self.output.exists():
            raise FileExistsError(f"baseline artifact is immutable: {self.output}")
        checkpoint = self.output.with_name(f".{self.output.name}.checkpoint")
        checkpoint_file = checkpoint / "episodes.jsonl"
        config = {"models": [m.to_dict() for m in self.models], "seeds": list(self.seeds),
                  "suite_hash": self.suite.suite_hash, "global_cap_usd": self.authorized_total_cost_usd,
                  "source_hashes": {name: sha256_bytes((self.root / name).read_bytes().replace(b"\r\n", b"\n")) for name in SOURCE_PATHS}}
        config_path = checkpoint / "run_config.json"
        if config_path.exists():
            if json.loads(config_path.read_text(encoding="utf-8")) != config:
                raise RuntimeError("checkpoint configuration/source changed; do not rerun paid calls")
        else:
            config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
        if self.openai_run:
            from src.execution.reality_ladder_verify import verify_reality_ladder_file
            report = verify_reality_ladder_file(
                self.root / "eval/reality_ladder/forge_v0_2_4_1/reality_ladder_artifact.json", root=self.root)
            if not report["valid"] or report["artifact_hash"] != self.suite.reality_ladder_artifact_hash:
                raise RuntimeError("frozen Reality Ladder does not independently verify")
        records = _read_jsonl(checkpoint_file)
        existing: dict[str, dict[str, Any]] = {}
        verifier = BehavioralVerifier(self.certifications)
        tasks = {task.task_id: task for task in self.suite.tasks}
        allowed_episode_keys = {
            _episode_key(task.task_id, identity.identity_hash, seed)
            for task in self.suite.tasks for identity in self.models for seed in self.seeds
        }
        for record in records:
            if set(record) != {
                "episode_key", "task_id", "model_identity_hash", "seed", "run",
                "verification", "record_hash",
            }:
                raise ValueError("checkpoint record fields are invalid")
            unhashed = {key: value for key, value in record.items() if key != "record_hash"}
            if canonical_sha256(unhashed) != record["record_hash"]:
                raise ValueError("checkpoint record hash does not verify")
            run = AgentRun.from_dict(record["run"])
            expected_key = _episode_key(run.task_id, run.model_identity_hash, run.seed)
            if (
                record["episode_key"] != expected_key
                or expected_key not in allowed_episode_keys
                or record["task_id"] != run.task_id
                or record["model_identity_hash"] != run.model_identity_hash
                or record["seed"] != run.seed
            ):
                raise ValueError("checkpoint episode identity is invalid")
            task = tasks[run.task_id]
            verification = verifier.verify(task, run).to_dict()
            if verification != record["verification"]:
                raise ValueError("checkpoint verification does not reproduce")
            if self.openai_run and not verification["checks"]["model_metering"]:
                raise ValueError("checkpoint API metering does not verify")
            if record["episode_key"] in existing:
                raise ValueError("checkpoint contains duplicate episodes")
            existing[record["episode_key"]] = record
        total_cost = sum(float(item["run"]["usage"]["inference_cost_usd"]) for item in records)
        for identity in self.models:
            if hasattr(self.client_factory, "before_tier"):
                remaining_count = sum(_episode_key(t.task_id, identity.identity_hash, seed) not in existing
                                      for seed in self.seeds for t in self.suite.tasks)
                try:
                    self.client_factory.before_tier(identity, records, remaining_count)
                except RuntimeError as exc:
                    (checkpoint / "stop.json").write_text(json.dumps({
                        "status": "BUDGET_EXHAUSTED" if type(exc).__name__ == "BudgetExceeded" else "STOPPED",
                        "model": identity.model, "completed_episodes": len(records), "reason": str(exc)
                    }, indent=2) + "\n", encoding="utf-8")
                    raise
            client = self.client_factory(identity)
            if getattr(client, "model_kind", None) != "live":
                raise ValueError("live baseline client factory returned a non-live client")
            agent = SingleResearchAgent(client, identity, self.certifications)
            for seed in self.seeds:
                for task in self.suite.tasks:
                    key = _episode_key(task.task_id, identity.identity_hash, seed)
                    if key in existing:
                        continue
                    remaining = self.authorized_total_cost_usd - total_cost
                    if remaining <= 0:
                        raise RuntimeError("authorized total API spend is exhausted")
                    run = agent.run(task, seed=seed, cost_ceiling_usd=remaining)
                    verification = verifier.verify(task, run)
                    record = {
                        "episode_key": key,
                        "task_id": task.task_id,
                        "model_identity_hash": identity.identity_hash,
                        "seed": seed,
                        "run": run.to_dict(),
                        "verification": verification.to_dict(),
                    }
                    record["record_hash"] = canonical_sha256(record)
                    _append_jsonl(checkpoint_file, record)
                    records.append(record)
                    existing[key] = record
                    total_cost += float(run.usage["inference_cost_usd"])
                    print(f"Checkpoint: {identity.model} / seed {seed} / {task.task_id}: "
                          f"{len(records)}/54, estimated cost ${total_cost:.6f}", flush=True)
                    if total_cost > self.authorized_total_cost_usd:
                        raise RuntimeError("provider exceeded the authorized total API spend")
                    if self.openai_run and not run.completed:
                        raise RuntimeError(f"partial checkpoint preserved: {run.failure_reason}")
        expected_episodes = len(self.models) * len(self.seeds) * len(self.suite.tasks)
        if len(records) != expected_episodes:
            raise RuntimeError("baseline checkpoint is incomplete")
        records.sort(
            key=lambda item: (
                item["model_identity_hash"], item["seed"], item["task_id"]
            )
        )
        pairs = [
            (
                BehavioralVerification(**item["verification"]),
                AgentRun.from_dict(item["run"]),
            )
            for item in records
        ]
        summary = {
            "overall": summarize_verifications(pairs),
            "models": _model_summary(records),
        }
        staging = self.output.with_name(f".{self.output.name}.staging")
        if staging.exists():
            raise FileExistsError("baseline staging directory already exists")
        staging.mkdir(parents=True)
        episodes_path = staging / "episodes.jsonl"
        for record in records:
            _append_jsonl(episodes_path, record)
        summary_path = staging / "summary.json"
        summary_path.write_text(
            json.dumps(summary, indent=2, sort_keys=True) + "\n",
            encoding="utf-8", newline="\n",
        )
        if self.openai_run:
            self.client_factory.before_tier(self.models[-1], records, 0)
        source_manifest = {
            name: sha256_bytes((self.root / name).read_bytes().replace(b"\r\n", b"\n"))
            for name in SOURCE_PATHS
        }
        if source_manifest != config["source_hashes"]:
            raise RuntimeError("source changed during the run; preserve checkpoint")
        artifact_hashes = {
            "episodes.jsonl": sha256_bytes(episodes_path.read_bytes()),
            "summary.json": sha256_bytes(summary_path.read_bytes()),
        }
        if self.openai_run:
            shutil.copyfile(checkpoint / "requests.jsonl", staging / "requests.jsonl")
            artifact_hashes["requests.jsonl"] = sha256_bytes((staging / "requests.jsonl").read_bytes())
            for name in ("run_config.json", "tier_preflights.jsonl"):
                shutil.copyfile(checkpoint / name, staging / name)
                artifact_hashes[name] = sha256_bytes((staging / name).read_bytes())
            (staging / "README.md").write_text(
                "# REAL API MODEL BASELINE\n\n"
                "Six deliberately constructed Forge research tasks, three task/world seeds, "
                "and three OpenAI model tiers. API outputs are not deterministic.\n\n"
                "Costs are token estimates using frozen prices, not account invoices. "
                "Reasoning tokens are included in output, cached input is a subset of input.\n",
                encoding="utf-8")
            artifact_hashes["README.md"] = sha256_bytes((staging / "README.md").read_bytes())
        manifest = {
            "schema_version": "forge-real-single-agent-baseline/0.2.5",
            "tag": BASELINE_TAG,
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "suite_hash": self.suite.suite_hash,
            "certification_artifact_hash": self.certifications.artifact_hash,
            "reality_ladder_artifact_hash": self.suite.reality_ladder_artifact_hash,
            "case_hashes": {task.task_id: task.case_hash for task in self.suite.tasks},
            "models": [item.to_dict() for item in self.models],
            "seeds": list(self.seeds),
            "episodes": expected_episodes,
            "authorized_total_cost_usd": self.authorized_total_cost_usd,
            "total_cost_usd": round(total_cost, 12),
            "metrics": summary["overall"],
            "source_hash_convention": "SHA-256 over source bytes after CRLF-to-LF normalization",
            "source_manifest": source_manifest,
            "artifacts": artifact_hashes,
        }
        manifest["baseline_id"] = canonical_sha256(manifest)
        (staging / "manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8", newline="\n",
        )
        report = verify_baseline_artifact(
            staging, suite=self.suite, certifications=self.certifications, root=self.root
        )
        if not report["valid"]:
            raise RuntimeError(f"baseline artifact did not verify: {report['errors']}")
        staging.rename(self.output)
        # Retain the durable request/checkpoint evidence after a successful freeze.
        return manifest


def verify_baseline_artifact(
    path: str | Path,
    *,
    suite: BehavioralSuite,
    certifications: CertificationIndex,
    root: Path | None = None,
) -> dict[str, Any]:
    artifact = Path(path)
    errors: list[str] = []
    try:
        manifest = json.loads((artifact / "manifest.json").read_text(encoding="utf-8"))
        manifest_fields = {
            "schema_version", "tag", "created_at", "suite_hash",
            "certification_artifact_hash", "reality_ladder_artifact_hash",
            "case_hashes", "models", "seeds", "episodes",
            "authorized_total_cost_usd", "total_cost_usd", "metrics",
            "source_hash_convention", "source_manifest", "artifacts", "baseline_id",
        }
        if set(manifest) != manifest_fields:
            errors.append("manifest_fields")
        if manifest.get("schema_version") != "forge-real-single-agent-baseline/0.2.5":
            errors.append("schema_version")
        if manifest.get("tag") != BASELINE_TAG:
            errors.append("tag")
        supplied_id = manifest["baseline_id"]
        payload = {key: value for key, value in manifest.items() if key != "baseline_id"}
        if canonical_sha256(payload) != supplied_id:
            errors.append("baseline_id")
        if manifest.get("suite_hash") != suite.suite_hash:
            errors.append("suite_hash")
        if manifest.get("certification_artifact_hash") != certifications.artifact_hash:
            errors.append("certification_artifact_hash")
        if manifest.get("reality_ladder_artifact_hash") != suite.reality_ladder_artifact_hash:
            errors.append("reality_ladder_artifact_hash")
        if manifest.get("case_hashes") != {
            task.task_id: task.case_hash for task in suite.tasks
        }:
            errors.append("case_hashes")
        for name, digest in manifest.get("artifacts", {}).items():
            if sha256_bytes((artifact / name).read_bytes()) != digest:
                errors.append(f"artifact:{name}")
        if root is not None:
            if set(manifest.get("source_manifest", {})) != set(SOURCE_PATHS):
                errors.append("source_manifest")
            for name, digest in manifest.get("source_manifest", {}).items():
                actual = sha256_bytes((root / name).read_bytes().replace(b"\r\n", b"\n"))
                if actual != digest:
                    errors.append(f"source:{name}")
        records = _read_jsonl(artifact / "episodes.jsonl")
        if len(records) != 54 or manifest.get("episodes") != 54:
            errors.append("episode_count")
        if len({item.get("episode_key") for item in records}) != len(records):
            errors.append("episode_uniqueness")
        task_by_id = {task.task_id: task for task in suite.tasks}
        model_identities = []
        for item in manifest.get("models", []):
            model = ModelIdentity.from_dict(item)
            if model.model_kind != "live":
                errors.append("model_kind")
            model_identities.append(model)
        if len(model_identities) != 3 or len({item.identity_hash for item in model_identities}) != 3:
            errors.append("model_identity_count")
        seeds = manifest.get("seeds", [])
        if len(seeds) != 3 or len(set(seeds)) != 3:
            errors.append("seed_count")
        expected_episode_keys = {
            _episode_key(task.task_id, model.identity_hash, seed)
            for task in suite.tasks for model in model_identities for seed in seeds
        }
        if {item.get("episode_key") for item in records} != expected_episode_keys:
            errors.append("episode_coverage")
        verifier = BehavioralVerifier(certifications)
        pairs = []
        for record in records:
            if set(record) != {
                "episode_key", "task_id", "model_identity_hash", "seed", "run",
                "verification", "record_hash",
            }:
                errors.append("record_fields")
            unhashed = {key: value for key, value in record.items() if key != "record_hash"}
            if canonical_sha256(unhashed) != record.get("record_hash"):
                errors.append("record_hash")
                continue
            run = AgentRun.from_dict(record["run"])
            task = task_by_id.get(run.task_id)
            if task is None:
                errors.append("task_identity")
                continue
            if (
                record.get("episode_key")
                != _episode_key(run.task_id, run.model_identity_hash, run.seed)
                or record.get("task_id") != run.task_id
                or record.get("model_identity_hash") != run.model_identity_hash
                or record.get("seed") != run.seed
                or run.model_identity_hash not in {item.identity_hash for item in model_identities}
            ):
                errors.append("episode_identity")
            verification = verifier.verify(task, run)
            if verification.to_dict() != record["verification"]:
                errors.append("verification")
            if any(not verification.checks[name] for name in (
                "task_identity", "model_identity", "prompt_identity", "tool_schema_identity",
                "artifact_binding", "trajectory_actions", "model_action_binding",
                "sealed_data_hidden", "usage_counters", "model_metering", "budget")):
                errors.append("trajectory_integrity")
            pairs.append((verification, run))
        if pairs:
            summary = json.loads((artifact / "summary.json").read_text(encoding="utf-8"))
            expected = {
                "overall": summarize_verifications(pairs),
                "models": _model_summary(records),
            }
            if summary != expected or manifest.get("metrics") != expected["overall"]:
                errors.append("summary")
        if any(m.provider == "openai" for m in model_identities):
            from src.behavioral.openai_api import verify_ledger_artifact
            errors.extend(verify_ledger_artifact(artifact, manifest, records))
        total = sum(float(item["run"]["usage"]["inference_cost_usd"]) for item in records)
        if total > float(manifest.get("authorized_total_cost_usd", -1)):
            errors.append("authorized_cost")
        if abs(total - float(manifest.get("total_cost_usd", -1))) > 1e-9:
            errors.append("total_cost")
    except (KeyError, TypeError, ValueError, OSError, RuntimeError, IndexError, AttributeError) as exc:
        errors.append(f"invalid_artifact:{type(exc).__name__}:{exc}")
    return {
        "schema_version": "forge-real-single-agent-verification/0.2.5",
        "valid": not errors,
        "errors": sorted(set(errors)),
    }
