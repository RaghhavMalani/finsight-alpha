"""Typed simulation capabilities composed into the single ResearchAgent plane."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from src.execution.contracts import SimulationOutcome, SimulationRequest
from src.execution.engines import EngineRegistry


SIMULATION_TOOL_DEFINITIONS: dict[str, dict[str, list[str]]] = {
    "simulation.list_engines": {"required": [], "optional": []},
    "simulation.run": {"required": ["engine", "request"], "optional": []},
    "simulation.replay": {"required": ["engine", "run_id"], "optional": []},
}


@dataclass(frozen=True)
class SimulationToolAction:
    sequence: int
    tool: str
    arguments: Mapping[str, Any]
    outcome: SimulationOutcome | None


class SimulationToolPlane:
    def __init__(self, registry: EngineRegistry) -> None:
        self.registry = registry
        self.actions: list[SimulationToolAction] = []

    def definitions(self) -> dict[str, dict[str, list[str]]]:
        return {name: {key: list(value) for key, value in spec.items()} for name, spec in SIMULATION_TOOL_DEFINITIONS.items()}

    def call(self, tool: str, arguments: Mapping[str, Any] | None = None) -> Any:
        args = dict(arguments or {})
        definition = SIMULATION_TOOL_DEFINITIONS.get(tool)
        if definition is None:
            raise ValueError(f"unknown simulation tool {tool!r}")
        required = set(definition["required"])
        allowed = required | set(definition["optional"])
        if set(args) != required or set(args) - allowed:
            raise ValueError(f"{tool} arguments must be exactly {sorted(required)}")
        outcome: SimulationOutcome | None = None
        if tool == "simulation.list_engines":
            value: Any = self.registry.describe()
        elif tool == "simulation.run":
            request = args["request"]
            if not isinstance(request, SimulationRequest):
                request = SimulationRequest.from_dict(request)
            outcome = self.registry.get(str(args["engine"])).run(request)
            value = outcome
        else:
            outcome = self.registry.get(str(args["engine"])).replay(str(args["run_id"]))
            value = outcome
        self.actions.append(SimulationToolAction(len(self.actions) + 1, tool, args, outcome))
        return value
