"""Minimal worker-side JSON protocol with no grading capability."""

from __future__ import annotations

import json
import sys
from typing import Callable

from src.eval.canonical import canonical_json_bytes
from src.execution.contracts import ContractError, SimulationOutcome, SimulationRequest
from src.execution.engines import RPC_VERSION


WorkerHandler = Callable[[SimulationRequest], SimulationOutcome]


def serve(engine_id: str, handler: WorkerHandler) -> int:
    """Read one request and write one result. Verifier outputs are not in the schema."""

    try:
        envelope = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        fields = {"protocol_version", "method", "engine_id", "request_hash", "request"}
        if set(envelope) != fields:
            raise ContractError("RPC request fields are not canonical")
        if envelope["protocol_version"] != RPC_VERSION or envelope["method"] != "simulate":
            raise ContractError("unsupported RPC method or version")
        if envelope["engine_id"] != engine_id:
            raise ContractError("worker was invoked for a different engine")
        request = SimulationRequest.from_dict(envelope["request"])
        if request.request_hash != envelope["request_hash"]:
            raise ContractError("request_hash does not bind the request")
        outcome = handler(request)
        if outcome.engine_id != engine_id or outcome.request_hash != request.request_hash:
            raise ContractError("handler returned an unbound outcome")
        response = {"protocol_version": RPC_VERSION, "outcome": outcome.to_dict()}
        sys.stdout.buffer.write(canonical_json_bytes(response))
        return 0
    except Exception as exc:  # the host treats any nonzero worker exit as untrusted
        sys.stderr.write(f"{type(exc).__name__}: {exc}\n")
        return 2
