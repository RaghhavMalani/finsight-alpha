"""Provenance-bearing capabilities over one frozen MarketWorld."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from src.eval.canonical import canonical_json_bytes
from src.execution import (
    SimulationOutcome,
    SimulationRequest,
    SimulationToolPlane,
)
from src.execution.tool_plane import SIMULATION_TOOL_DEFINITIONS
from src.findings import ResearchFinding, ResearchTask
from src.sandbox import (
    ExecutionResult,
    SandboxManifest,
    SandboxRunner,
    hash_input_files,
)
from src.tool_plane.contracts import (
    ToolAction,
    ToolInvocationError,
    ToolProvenance,
    ToolResult,
)
from src.world import MarketWorld, MarketWorldError


TOOL_DEFINITIONS: dict[str, dict[str, Any]] = {
    "world.describe": {"required": [], "optional": []},
    "world.get_snapshot": {"required": ["dataset"], "optional": []},
    "market.get_history": {"required": ["ticker"], "optional": []},
    "fundamentals.get_asof": {"required": ["ticker"], "optional": []},
    "filings.search": {"required": ["query"], "optional": ["ticker"]},
    "experiment.execute_python": {"required": ["code", "input"], "optional": []},
    "finding.submit": {"required": ["finding"], "optional": []},
    **SIMULATION_TOOL_DEFINITIONS,
}


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return json.loads(
        frame.to_json(orient="records", date_format="iso", date_unit="ms")
    )


class ForgeToolPlane:
    """A tiny typed boundary; agents never receive the MarketWorld internals."""

    def __init__(
        self,
        *,
        task: ResearchTask,
        world: MarketWorld,
        sandbox_root: str | Path,
        simulation_plane: SimulationToolPlane | None = None,
    ) -> None:
        if task.as_of.cutoff != world.as_of.cutoff or task.seed != world.seed:
            raise ValueError("tool plane task and world boundaries must match")
        self.task = task
        self.world = world
        self.sandbox = SandboxRunner(sandbox_root)
        self.actions: list[ToolAction] = []
        self.executions: list[ExecutionResult] = []
        self.submitted_finding: ResearchFinding | None = None
        self.simulation_plane = simulation_plane

    def definitions(self) -> dict[str, dict[str, Any]]:
        return json.loads(json.dumps(TOOL_DEFINITIONS))

    def _dataset_manifest(self, dataset: str) -> dict[str, Any]:
        for item in self.world.manifest()["datasets"]:
            if item["name"] == dataset:
                return item
        raise ToolInvocationError(f"unknown dataset {dataset!r}")

    def _provenance(
        self,
        dataset: str,
        snapshot_hash: str,
        *,
        epistemic_state: str = "historical_observation",
    ) -> ToolProvenance:
        logical_time = self.world.as_of.isoformat
        return ToolProvenance(
            as_of=logical_time,
            dataset_id=dataset,
            snapshot_hash=snapshot_hash,
            retrieved_at=logical_time,
            epistemic_state=epistemic_state,
        )

    def call(
        self,
        tool: str,
        arguments: Mapping[str, Any] | None = None,
        *,
        state: str,
    ) -> ToolResult:
        args = dict(arguments or {})
        definition = TOOL_DEFINITIONS.get(tool)
        if definition is None:
            raise ToolInvocationError(f"unknown tool {tool!r}")
        required = set(definition["required"])
        allowed = required | set(definition["optional"])
        if required - set(args):
            raise ToolInvocationError(
                f"{tool} is missing arguments: {sorted(required - set(args))}"
            )
        if set(args) - allowed:
            raise ToolInvocationError(
                f"{tool} has unknown arguments: {sorted(set(args) - allowed)}"
            )
        try:
            result = self._invoke(tool, args)
        except (ToolInvocationError, MarketWorldError, ValueError, OSError) as exc:
            result = ToolResult(
                value={"error": f"{type(exc).__name__}: {exc}"},
                provenance=self._provenance(
                    "tool-error",
                    self.world.world_id,
                    epistemic_state="execution_error",
                ),
                success=False,
            )
        self.actions.append(
            ToolAction(
                sequence=len(self.actions) + 1,
                state=state,
                tool=tool,
                arguments=self._serializable_arguments(args),
                result=result,
            )
        )
        return result

    @staticmethod
    def _serializable_arguments(arguments: dict[str, Any]) -> dict[str, Any]:
        values = dict(arguments)
        finding = values.get("finding")
        if isinstance(finding, ResearchFinding):
            values["finding"] = finding.to_dict()
        request = values.get("request")
        if isinstance(request, SimulationRequest):
            values["request"] = request.to_dict()
        return values

    def _invoke(self, tool: str, args: dict[str, Any]) -> ToolResult:
        if tool == "world.describe":
            datasets = []
            for name in self.world.datasets:
                frame = self.world.data(name)
                manifest = self._dataset_manifest(name)
                datasets.append(
                    {
                        "name": name,
                        "columns": list(frame.columns),
                        "visible_rows": len(frame),
                        "snapshot_hash": manifest["snapshot_id"],
                    }
                )
            return ToolResult(
                value={
                    "task_id": self.task.task_id,
                    "question": self.task.question,
                    "world_hash": self.world.world_id,
                    "datasets": datasets,
                },
                provenance=self._provenance("world", self.world.world_id),
            )
        if tool == "world.get_snapshot":
            return self._snapshot(str(args["dataset"]))
        if tool == "market.get_history":
            return self._market_history(str(args["ticker"]))
        if tool == "fundamentals.get_asof":
            return self._fundamentals(str(args["ticker"]))
        if tool == "filings.search":
            return self._filings_search(str(args["query"]), args.get("ticker"))
        if tool == "experiment.execute_python":
            return self._execute_python(str(args["code"]), args["input"])
        if tool in SIMULATION_TOOL_DEFINITIONS:
            if self.simulation_plane is None:
                raise ToolInvocationError("simulation federation is not configured")
            if tool == "simulation.run":
                request = args["request"]
                if not isinstance(request, SimulationRequest):
                    request = SimulationRequest.from_dict(request)
                if request.world_hash != self.world.world_id:
                    raise ToolInvocationError("simulation request is bound to a different MarketWorld")
                if request.seed != self.world.seed:
                    raise ToolInvocationError("simulation request seed differs from the frozen MarketWorld")
                if request.end > self.world.as_of.cutoff:
                    raise ToolInvocationError("simulation request extends beyond the MarketWorld as-of boundary")
            value = self.simulation_plane.call(tool, args)
            if isinstance(value, SimulationOutcome):
                snapshot_hash = (
                    value.result.result_hash
                    if value.result is not None
                    else value.request_hash
                )
                return ToolResult(
                    value=value.to_dict(),
                    provenance=self._provenance(
                        f"simulation:{value.engine_id}",
                        snapshot_hash,
                        epistemic_state=value.state.value.lower(),
                    ),
                    success=value.result is not None,
                )
            descriptions = list(value)
            return ToolResult(
                value=descriptions,
                provenance=self._provenance("simulation-registry", self.world.world_id),
            )
        if tool == "finding.submit":
            finding = args["finding"]
            if not isinstance(finding, ResearchFinding):
                if not isinstance(finding, Mapping):
                    raise ToolInvocationError("finding must be an object")
                finding = ResearchFinding.from_dict(finding)
            self.submitted_finding = finding
            return ToolResult(
                value={
                    "finding_hash": finding.finding_hash,
                    "accepted": True,
                },
                provenance=self._provenance(
                    "finding", finding.finding_hash, epistemic_state="agent_submission"
                ),
            )
        raise AssertionError(tool)

    def _snapshot(self, dataset: str) -> ToolResult:
        frame = self.world.data(dataset)
        manifest = self._dataset_manifest(dataset)
        evidence = [
            self.world.evidence(dataset, row, evidence_id=f"{dataset}-{row:04d}").to_dict()
            for row in range(len(frame))
        ]
        return ToolResult(
            value={"dataset": dataset, "records": _records(frame), "evidence": evidence},
            provenance=self._provenance(dataset, manifest["snapshot_id"]),
        )

    def _market_history(self, ticker: str) -> ToolResult:
        dataset = "prices" if "prices" in self.world.datasets else "market_history"
        snapshot = self._snapshot(dataset)
        rows = snapshot.value["records"]
        selected = [row for row in rows if str(row.get("ticker", "")).upper() == ticker.upper()]
        indices = [index for index, row in enumerate(rows) if row in selected]
        return ToolResult(
            value={
                "ticker": ticker.upper(),
                "records": selected,
                "evidence": [snapshot.value["evidence"][index] for index in indices],
            },
            provenance=snapshot.provenance,
        )

    def _fundamentals(self, ticker: str) -> ToolResult:
        candidates = ("fundamentals", "sec_facts")
        dataset = next((name for name in candidates if name in self.world.datasets), None)
        if dataset is None:
            raise ToolInvocationError("world has no fundamentals dataset")
        snapshot = self._snapshot(dataset)
        rows = snapshot.value["records"]
        selected_indices = [
            index
            for index, row in enumerate(rows)
            if str(row.get("ticker", "")).upper() == ticker.upper()
        ]
        return ToolResult(
            value={
                "ticker": ticker.upper(),
                "records": [rows[index] for index in selected_indices],
                "evidence": [snapshot.value["evidence"][index] for index in selected_indices],
            },
            provenance=snapshot.provenance,
        )

    def _filings_search(self, query: str, ticker: Any) -> ToolResult:
        dataset = next(
            (name for name in ("filings", "sec_filings") if name in self.world.datasets),
            None,
        )
        if dataset is None:
            raise ToolInvocationError("world has no filings dataset")
        snapshot = self._snapshot(dataset)
        query_tokens = set(re.findall(r"[a-z0-9]+", query.lower()))
        ranked: list[tuple[int, int]] = []
        for index, row in enumerate(snapshot.value["records"]):
            if ticker and str(row.get("ticker", "")).upper() != str(ticker).upper():
                continue
            text = " ".join(str(value) for value in row.values()).lower()
            score = sum(token in text for token in query_tokens)
            if score:
                ranked.append((score, index))
        ranked.sort(key=lambda item: (-item[0], item[1]))
        indices = [index for _, index in ranked]
        return ToolResult(
            value={
                "query": query,
                "records": [snapshot.value["records"][index] for index in indices],
                "evidence": [snapshot.value["evidence"][index] for index in indices],
            },
            provenance=snapshot.provenance,
        )

    def _execute_python(self, code: str, input_value: Any) -> ToolResult:
        input_files = {"input.json": canonical_json_bytes(input_value)}
        manifest = SandboxManifest.build(
            task_id=self.task.task_id,
            as_of=self.task.as_of.isoformat,
            seed=self.task.seed,
            dataset_hash=hash_input_files(input_files),
            timeout_seconds=min(self.task.budget.max_compute_seconds, 30.0),
            memory_mb=256,
        )
        replays = tuple(
            self.sandbox.execute(code, manifest=manifest, inputs=input_files)
            for _ in range(2)
        )
        self.executions.extend(replays)
        primary = replays[0]
        artifacts: dict[str, Any] = {}
        if all(result.succeeded for result in replays):
            for name in primary.artifact_hashes:
                payload = self.sandbox.read_artifact(primary.execution_id, name)
                if name.endswith(".json"):
                    artifacts[name] = json.loads(payload.decode("utf-8"))
                else:
                    artifacts[name] = payload.decode("utf-8", errors="replace")
        success = (
            all(result.succeeded for result in replays)
            and len({result.reproducibility_hash for result in replays}) == 1
        )
        return ToolResult(
            value={
                "execution": primary.to_dict(),
                "replays": [result.to_dict() for result in replays],
                "artifacts": artifacts,
            },
            provenance=self._provenance(
                "sandbox",
                primary.manifest_hash,
                epistemic_state="deterministic_experiment",
            ),
            success=success,
        )
