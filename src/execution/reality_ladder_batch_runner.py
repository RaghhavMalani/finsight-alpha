"""Efficient native batch runner for the v0.2.4.1 Reality Ladder freeze."""

from __future__ import annotations

import json
import platform
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from src.eval.canonical import canonical_json_bytes, canonical_sha256
from src.execution.benchmark import load_execution_task
from src.execution.reality_ladder_freeze import (
    CHECKPOINTS,
    CHECKPOINT_ENGINES,
    FREEZE_TAG,
    REGIMES,
    SCHEMA_VERSION,
    SEEDS,
    STAGE_ASSUMPTIONS,
    STRATEGY,
    _rounded,
    _source_sha256,
    analytical_fills,
    deterministic_aggregate,
    semantic_tape,
    strategy_orders,
    world_document,
)
from src.execution.reality_ladder_runner import (
    NativeRun,
    _analytical_fingerprint,
    _certified_fingerprint,
    _record,
    aggregate_results,
)
from src.execution.trust import BoundEngineTrust, CertificationIndex


def _run_batch(
    *,
    root: Path,
    python: Path,
    engine: str,
    jobs: Sequence[Mapping[str, Any]],
    expected_version: str,
) -> tuple[dict[str, NativeRun], float]:
    if engine == "nautilus" and len(jobs) > 10:
        combined: dict[str, NativeRun] = {}
        total_wall = 0.0
        for offset in range(0, len(jobs), 10):
            prepared = []
            for index, job in enumerate(jobs[offset : offset + 10], 1):
                tape = dict(job["tape"])
                tape["tape_id"] = f"T{index:02d}"
                tape_content = {key: item for key, item in tape.items() if key != "tape_hash"}
                tape["tape_hash"] = canonical_sha256(tape_content)
                prepared.append({"run_key": job["run_key"], "tape": tape})
            chunk, chunk_wall = _run_batch(
                root=root, python=python, engine=engine, jobs=prepared,
                expected_version=expected_version,
            )
            combined.update(chunk)
            total_wall += chunk_wall
        return combined, _rounded(total_wall)
    request = {
        "schema_version": "forge-reality-ladder-native-batch/0.2.4.1",
        "engine": engine,
        "runs": [{"run_key": job["run_key"], "tape": job["tape"]} for job in jobs],
    }
    request["request_hash"] = canonical_sha256(request)
    started = time.perf_counter()
    process = subprocess.run(
        [str(python), str(root / "scripts/reality_ladder/native_batch.py"), "--engine", engine],
        cwd=root,
        input=canonical_json_bytes(request),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=900,
        check=False,
    )
    wall_seconds = time.perf_counter() - started
    if process.returncode != 0:
        error = process.stderr.decode("utf-8", errors="replace")[-8000:]
        raise RuntimeError(f"{engine} native batch failed with exit {process.returncode}: {error}")
    try:
        response = json.loads(process.stdout)
    except json.JSONDecodeError as exc:
        output = process.stdout.decode("utf-8", errors="replace")[-8000:]
        raise RuntimeError(f"{engine} native batch returned invalid JSON: {output}") from exc
    if response.get("engine") != engine or response.get("version") != expected_version:
        raise RuntimeError(f"{engine} runtime identity differs from certified fingerprint")
    if response.get("request_hash") != request["request_hash"]:
        raise RuntimeError(f"{engine} batch response is not bound to its request")
    if len(response.get("results", ())) != len(jobs):
        raise RuntimeError(f"{engine} batch omitted logical runs")
    runtime_identity = dict(response["runtime"])
    runs: dict[str, NativeRun] = {}
    tape_by_key = {str(job["run_key"]): job["tape"] for job in jobs}
    for item in response["results"]:
        run_key = str(item["run_key"])
        if run_key in runs or run_key not in tape_by_key:
            raise RuntimeError(f"{engine} batch returned an invalid run key")
        result = item["result"]
        if result.get("state") != "SUPPORTED":
            raise RuntimeError(f"{engine} rejected {run_key}: {result.get('reason')}")
        if result.get("tape_hash") != tape_by_key[run_key]["tape_hash"]:
            raise RuntimeError(f"{engine} result {run_key} is not bound to its tape")
        runs[run_key] = NativeRun(
            engine=engine,
            fills=tuple(dict(fill) for fill in result["fills"]),
            account=dict(result["account"]),
            output_hash=canonical_sha256(item),
            request_hash=request["request_hash"],
            runtime_seconds=_rounded(float(item["runtime_seconds"])),
            runtime_identity=runtime_identity,
            native_evidence_hash=canonical_sha256(result.get("native_evidence", {})),
        )
    return runs, _rounded(wall_seconds)


class RealityLadderBatchFreezeRunner:
    def __init__(self, *, root: Path, engine_env_root: Path, output: Path) -> None:
        self.root = root.resolve()
        self.engine_env_root = engine_env_root.resolve()
        self.output = output.resolve()
        self.task_path = self.root / "eval/tasks/forge_v0_2_4_1/task_001.json"
        self.certification_path = self.root / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"

    def _python(self, engine: str) -> Path:
        path = self.engine_env_root / engine / "Scripts/python.exe"
        if not path.is_file():
            raise FileNotFoundError(f"certified {engine} environment is missing: {path}")
        return path

    def run(self) -> dict[str, Any]:
        if self.output.exists():
            raise FileExistsError(f"reality ladder artifact is immutable: {self.output}")
        task = load_execution_task(self.task_path)
        if task.engine_trust_policy is None or tuple(task.engines) != ("vectorbt", "nautilus"):
            raise ValueError("ladder task must allow exactly VectorBT C4 and Nautilus C4")
        certifications = CertificationIndex.load(self.certification_path)
        trust = BoundEngineTrust(task.engine_trust_policy, certifications)
        vectorbt = trust.require("vectorbt")
        nautilus = trust.require("nautilus")
        certification_document = json.loads(self.certification_path.read_text(encoding="utf-8"))
        adapter_paths = {
            "vectorbt": self.root / "scripts/engine_certification/vectorbt_semantic.py",
            "nautilus": self.root / "scripts/engine_certification/nautilus_semantic.py",
        }
        for engine, path in adapter_paths.items():
            manifest_key = f"scripts/engine_certification/{engine}_semantic.py"
            if _source_sha256(path) != certification_document["source_manifest"][manifest_key]:
                raise ValueError(f"{engine} semantic adapter differs from certified source")

        worlds: list[dict[str, Any]] = []
        cases: list[dict[str, Any]] = []
        records: list[dict[str, Any]] = []
        jobs: dict[str, list[dict[str, Any]]] = {"vectorbt": [], "nautilus": []}
        job_context: dict[str, dict[str, Any]] = {}
        analytical_fingerprint = _analytical_fingerprint()
        for regime in REGIMES:
            for seed in SEEDS:
                base_world = world_document(regime, seed, stressed=False)
                stress_world = world_document(regime, seed, stressed=True)
                worlds.extend((base_world, stress_world))
                base_orders = strategy_orders(base_world)
                stress_orders = strategy_orders(stress_world)
                if not base_orders or not stress_orders:
                    raise ValueError(f"strategy generated no orders for {regime}/{seed}")
                case_id = f"{regime.lower()}-{seed}"
                cases.append({
                    "case_id": case_id,
                    "regime": regime,
                    "seed": seed,
                    "base_world_hash": base_world["world_hash"],
                    "stress_world_hash": stress_world["world_hash"],
                    "base_orders": base_orders,
                    "stress_orders": stress_orders,
                })
                started = time.perf_counter()
                ideal_fills = analytical_fills(base_world, base_orders)
                analytical_runtime = time.perf_counter() - started
                records.append(_record(
                    checkpoint="L0_ANALYTICAL", regime=regime, seed=seed,
                    world=base_world, orders=base_orders, fills=ideal_fills,
                    engine_fingerprint=analytical_fingerprint,
                    runtime_seconds=analytical_runtime,
                    native_output_hash=canonical_sha256({"engine": "analytical", "world_hash": base_world["world_hash"], "fills": ideal_fills}),
                    native_request_hash=canonical_sha256({"world_hash": base_world["world_hash"], "orders": base_orders}),
                    native_evidence_hash=canonical_sha256({"method": "causal next-observation ideal fills"}),
                    runtime_identity={"python_version": platform.python_version(), "platform": platform.platform()},
                ))
                for checkpoint in CHECKPOINTS[1:]:
                    engine = CHECKPOINT_ENGINES[checkpoint]
                    world = stress_world if checkpoint == "L4_COUNTERFACTUAL_STRESS" else base_world
                    orders = stress_orders if checkpoint == "L4_COUNTERFACTUAL_STRESS" else base_orders
                    run_key = f"{case_id}:{checkpoint}"
                    tape = semantic_tape(world, orders, STAGE_ASSUMPTIONS[checkpoint])
                    jobs[engine].append({"run_key": run_key, "tape": tape})
                    job_context[run_key] = {
                        "checkpoint": checkpoint,
                        "regime": regime,
                        "seed": seed,
                        "world": world,
                        "orders": orders,
                    }

        native_runs: dict[str, NativeRun] = {}
        batch_invocations = []
        for engine, certified in (("vectorbt", vectorbt), ("nautilus", nautilus)):
            batch, wall_seconds = _run_batch(
                root=self.root,
                python=self._python(engine),
                engine=engine,
                jobs=jobs[engine],
                expected_version=str(certified.fingerprint["engine_version"]),
            )
            native_runs.update(batch)
            batch_invocations.append({
                "engine": engine,
                "logical_runs": len(jobs[engine]),
                "process_invocations": 1 if engine == "vectorbt" else (len(jobs[engine]) + 9) // 10,
                "wall_seconds": wall_seconds,
                "request_hash": next(iter(batch.values())).request_hash,
            })
        fingerprints = {"vectorbt": _certified_fingerprint(vectorbt), "nautilus": _certified_fingerprint(nautilus)}
        for run_key, context in job_context.items():
            native = native_runs[run_key]
            records.append(_record(
                checkpoint=context["checkpoint"], regime=context["regime"], seed=context["seed"],
                world=context["world"], orders=context["orders"], fills=native.fills,
                engine_fingerprint=fingerprints[native.engine],
                runtime_seconds=native.runtime_seconds,
                native_output_hash=native.output_hash,
                native_request_hash=native.request_hash,
                native_evidence_hash=native.native_evidence_hash,
                runtime_identity=native.runtime_identity,
            ))
        order = {name: index for index, name in enumerate(CHECKPOINTS)}
        records.sort(key=lambda item: (REGIMES.index(item["regime"]), SEEDS.index(item["seed"]), order[item["checkpoint"]]))

        source_paths = (
            self.root / "src/execution/reality_ladder_freeze.py",
            self.root / "src/execution/reality_ladder_runner.py",
            self.root / "src/execution/reality_ladder_batch_runner.py",
            self.root / "src/execution/reality_ladder_verify.py",
            self.root / "src/execution/trust.py",
            self.root / "src/execution/benchmark.py",
            self.root / "src/execution/tool_plane.py",
            self.root / "scripts/reality_ladder/native_batch.py",
            self.root / "scripts/run_reality_ladder_freeze.py",
            self.root / "scripts/verify_reality_ladder_freeze.py",
            *adapter_paths.values(),
            self.task_path,
        )
        source_manifest = {path.relative_to(self.root).as_posix(): _source_sha256(path) for path in source_paths}
        trust_decisions = [trust.decision(engine) for engine in ("vectorbt", "nautilus", "hftbacktest")]
        content = {
            "schema_version": SCHEMA_VERSION,
            "tag": FREEZE_TAG,
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "task": task.to_dict(),
            "task_hash": task.task_hash,
            "strategy": STRATEGY,
            "strategy_hash": canonical_sha256(STRATEGY),
            "design": {
                "strategies": 1,
                "regimes": list(REGIMES),
                "seeds": list(SEEDS),
                "certified_engines": ["vectorbt", "nautilus"],
                "logical_engine_runs": len(jobs["vectorbt"]) + len(jobs["nautilus"]),
                "process_invocations": 1 + (len(jobs["nautilus"]) + 9) // 10,
                "checkpoints": list(CHECKPOINTS),
                "causal_rule": "signals use data through t and orders submit no earlier than t+1",
                "world_source": "deterministic synthetic generator; no external market data",
                "primary_metric": "sharpe",
            },
            "certification_source": {
                "schema_version": certification_document["schema_version"],
                "artifact_hash": certifications.artifact_hash,
                "system_release_eligible": certification_document["system_release_eligible"],
                "certified_engines": [vectorbt.to_dict(), nautilus.to_dict()],
            },
            "engine_trust": {
                **task.engine_trust_policy.to_dict(),
                "usability_rule": "Certification(engine) >= Required(capability)",
                "decisions": trust_decisions,
            },
            "metric_definitions": {
                "gross_return": "ending marked equity before native fees divided by initial cash, minus one",
                "net_return": "ending marked equity after native fees divided by initial cash, minus one",
                "sharpe": "mean per-observation net equity return divided by population volatility, annualized by sqrt(252)",
                "max_drawdown": "maximum peak-to-trough decline of marked net equity",
                "turnover": "absolute native filled notional divided by initial cash",
                "orders": "submitted strategy order count",
                "fills": "native fill record count",
                "fill_ratio": "orders with at least one native fill divided by submitted orders",
                "fees": "sum of native fill commissions in quote currency",
                "slippage": "signed native fill cost relative to submission-time mid in quote currency",
                "latency_cost": "signed native fill cost relative to submission-time executable top of book in quote currency",
                "runtime_seconds": "native adapter function wall-clock duration for this logical run; package import is reported in batch wall time",
            },
            "stage_assumptions": STAGE_ASSUMPTIONS,
            "batch_invocations": batch_invocations,
            "worlds": worlds,
            "cases": cases,
            "records": records,
            "aggregate": aggregate_results(records),
            "source_hash_convention": "CRLF normalized to LF; all other source bytes preserved",
            "source_manifest": source_manifest,
            "acceptance": {
                "exactly_one_strategy": True,
                "exactly_three_regimes": len(REGIMES) == 3,
                "exactly_five_seeds": len(SEEDS) == 5,
                "exactly_two_certified_engines": len(task.engines) == 2,
                "all_reward_bearing_engines_c4": all(item.certification_level == "C4" for item in (vectorbt, nautilus)),
                "hftbacktest_excluded": not trust.decision("hftbacktest")["usable"],
                "complete_stage_records": len(records) == len(REGIMES) * len(SEEDS) * len(CHECKPOINTS),
            },
        }
        content["evidence_hash"] = canonical_sha256({
            "task_hash": content["task_hash"],
            "strategy_hash": content["strategy_hash"],
            "world_hashes": [world["world_hash"] for world in worlds],
            "deterministic_record_hashes": [record["deterministic_hash"] for record in records],
            "aggregate": deterministic_aggregate(content["aggregate"]),
            "certification_artifact_hash": certifications.artifact_hash,
            "source_manifest": source_manifest,
        })
        content["artifact_hash"] = canonical_sha256(content)
        self.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.output.with_suffix(self.output.suffix + ".tmp")
        if temporary.exists():
            raise FileExistsError(f"stale reality ladder staging file exists: {temporary}")
        temporary.write_text(json.dumps(content, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        temporary.replace(self.output)
        return content
