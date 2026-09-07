from pathlib import Path

import pytest

from src.execution import SimulationToolPlane, default_registry
from src.execution.benchmark import load_execution_task
from src.execution.reality_ladder_freeze import REGIMES, SEEDS, strategy_orders, world_document
from src.execution.reality_ladder_verify import verify_reality_ladder_file
from src.execution.trust import BoundEngineTrust, CertificationIndex, EngineTrustError


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "eval/reality_ladder/forge_v0_2_4_1/reality_ladder_artifact.json"
TASK = ROOT / "eval/tasks/forge_v0_2_4_1/task_001.json"
CERTIFICATION = ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"


def test_world_and_strategy_grid_is_deterministic_and_causal() -> None:
    hashes = set()
    for regime in REGIMES:
        for seed in SEEDS:
            world = world_document(regime, seed)
            assert world == world_document(regime, seed)
            hashes.add(world["world_hash"])
            orders = strategy_orders(world)
            assert orders
            assert all(order["submitted_ns"] > order["signal_ns"] for order in orders)
    assert len(hashes) == 15


def test_tool_plane_rejects_hftbacktest_before_request_parsing() -> None:
    task = load_execution_task(TASK)
    assert task.engine_trust_policy is not None
    trust = BoundEngineTrust(task.engine_trust_policy, CertificationIndex.load(CERTIFICATION))
    plane = SimulationToolPlane(default_registry(), engine_trust=trust)
    with pytest.raises(EngineTrustError, match="not allowed"):
        plane.call("simulation.run", {"engine": "hftbacktest", "request": {}})


def test_frozen_reality_ladder_verifies_independently() -> None:
    report = verify_reality_ladder_file(ARTIFACT, root=ROOT)
    assert report["valid"], report["errors"]
    assert report["records"] == 90
    assert report["cases"] == 15
    assert report["alpha_survival_ratio"] == pytest.approx(0.071873325789)
