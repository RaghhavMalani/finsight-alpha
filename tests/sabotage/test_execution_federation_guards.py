from __future__ import annotations

import ast
from pathlib import Path

import pytest

from src.eval.canonical import canonical_sha256
from src.execution import ContractError, MeasurementState, SimulationOutcome


ROOT = Path(__file__).resolve().parents[2]


def test_external_engine_packages_are_not_imported_by_forge_core() -> None:
    forbidden = {"vectorbt", "nautilus_trader", "hftbacktest", "hft"}
    imported: set[str] = set()
    for path in (ROOT / "src" / "execution").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
    assert not (imported & forbidden)


def test_worker_cannot_attach_its_own_grade() -> None:
    payload = {
        "engine_id": "untrusted",
        "request_hash": canonical_sha256("request"),
        "state": "UNAVAILABLE",
        "result": None,
        "reason": "not installed",
        "grade": "pass",
    }
    with pytest.raises(ContractError, match="fields must be exactly"):
        SimulationOutcome.from_dict(payload)


def test_unavailable_outcome_cannot_smuggle_a_false_result() -> None:
    with pytest.raises(ContractError, match="must not carry a result"):
        SimulationOutcome(
            engine_id="untrusted",
            request_hash=canonical_sha256("request"),
            state=MeasurementState.UNAVAILABLE,
            result=object(),
            reason="not installed",
        )
