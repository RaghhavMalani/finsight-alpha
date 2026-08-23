from __future__ import annotations

from datetime import date

import pandas as pd

from src.data.as_of import AsOfContext
from src.truth import EpistemicState, build_computation_contract
from src.truth.contracts import dataframe_hash


def test_as_of_filters_observation_and_publication_timestamps() -> None:
    frame = pd.DataFrame(
        {
            "Date": ["2025-01-01", "2025-01-02", "2025-01-03"],
            "available_from": ["2025-01-02", "2025-01-04", "2025-01-03"],
            "value": [1.0, 2.0, 3.0],
        }
    )
    context = AsOfContext.bind(date(2025, 1, 3))

    visible = context.filter_frame(
        frame, observed_at="Date", available_from="available_from"
    )

    assert visible["value"].tolist() == [1.0, 3.0]


def test_computation_contract_is_content_addressed() -> None:
    frame = pd.DataFrame(
        {"Date": pd.to_datetime(["2025-01-01", "2025-01-02"]), "value": [1.0, None]}
    )
    data_version = dataframe_hash(frame)
    context = AsOfContext.bind("2025-01-02")
    assert context.isoformat == "2025-01-02T23:59:59.999999Z"
    first = build_computation_contract(
        calculation="test",
        calculation_version="1.0.0",
        as_of=context,
        inputs={"b": 2, "a": 1},
        data_version=data_version,
        state=EpistemicState.DERIVED,
    )
    second = build_computation_contract(
        calculation="test",
        calculation_version="1.0.0",
        as_of=context,
        inputs={"a": 1, "b": 2},
        data_version=data_version,
        state=EpistemicState.DERIVED,
    )

    assert first["run_id"] == second["run_id"]
    assert first["state"] == "DERIVED"
