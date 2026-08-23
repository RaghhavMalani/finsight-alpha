from pathlib import Path

import pandas as pd
import pytest

from src.benchmark import load_benchmark_case
from src.world import ColumnShock, MarketWorld, MarketWorldError


TASKS = Path(__file__).resolve().parents[1] / "eval" / "tasks" / "forge_v0_1"


def test_strict_world_filters_observation_and_availability_boundaries():
    case = load_benchmark_case(TASKS / "pit_total_return.json")

    visible = case.world.data("prices")

    assert visible["close"].tolist() == [100.0, 110.0]
    assert case.world.contains_evidence(
        case.world.evidence("prices", 1, evidence_id="latest")
    )
    with pytest.raises(MarketWorldError, match="outside visible"):
        case.world.evidence("prices", 2, evidence_id="future")


def test_world_data_is_defensive_and_counterfactual_forks_are_deterministic():
    case = load_benchmark_case(TASKS / "pit_total_return.json")
    exposed = case.world.data("prices")
    exposed.loc[0, "close"] = -1.0

    shock = ColumnShock("prices", "close", "multiply", 2.0)
    first = case.world.fork("prices_x2", (shock,))
    second = case.world.fork("prices_x2", (shock,))

    assert case.world.data("prices")["close"].tolist() == [100.0, 110.0]
    assert first.data("prices")["close"].tolist() == [200.0, 220.0]
    assert first.parent_world_id == case.world.world_id
    assert first.world_id == second.world_id
    assert first.world_id != case.world.world_id


def test_strict_world_rejects_datasets_without_availability_time():
    world = MarketWorld(as_of="2024-01-01", information_policy="strict")
    frame = pd.DataFrame(
        [{"observed_at": "2023-12-31T00:00:00Z", "value": 1.0}]
    )

    with pytest.raises(MarketWorldError, match="available_from"):
        world.with_dataset("prices", frame, available_from=None)
