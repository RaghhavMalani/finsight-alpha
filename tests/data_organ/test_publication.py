import json
from copy import deepcopy
from pathlib import Path

import pytest

from scripts.data_archive import verify
from src.data_organ.publication import (
    disagreement_projection,
    health_projection,
    revision_projection,
    validate_public,
)

ROOT = Path(__file__).resolve().parents[2]


def test_phase_0_through_2_bytes_and_original_permissions_are_preserved():
    verify(ROOT)


@pytest.mark.parametrize(
    "kind",
    ["health", "coverage", "revisions", "disagreement", "lineage", "issues", "costs"],
)
def test_each_projection_rejects_unknown_raw_or_encoded_fields(kind):
    value = json.loads(
        (ROOT / "data/exports/data_organ_v0_1" / (kind + ".json")).read_bytes()
    )
    validate_public(kind, value)
    corrupted = deepcopy(value)
    corrupted["licensed_price_history_encoded"] = "100,101,102"
    with pytest.raises(ValueError):
        validate_public(kind, corrupted)


def test_restricted_numerical_health_and_price_comparison_are_unavailable():
    for source in [
        "alpaca:iex",
        "yfinance",
        "nse:bhavcopy",
        "nse:india-vix",
        "rbi:policy-repo",
        "mospi:cpi-combined",
    ]:
        with pytest.raises(PermissionError):
            health_projection([{"source": source}])
    with pytest.raises(PermissionError):
        disagreement_projection({"status": "AVAILABLE"}, ["yfinance"])
    result = revision_projection(
        {"yearly": [{"year": "2025", "periods": 1, "raw_vintages": [4.0, 4.1]}]},
        "alfred:UNRATE",
    )
    assert result["yearly"] == []


def test_nested_price_pairs_and_revision_matrices_fail_closed():
    with pytest.raises(ValueError):
        validate_public(
            "disagreement",
            {
                "sources": ["alfred:UNRATE", "bls:LNS14000000"],
                "summary": {
                    "status": "AVAILABLE",
                    "pairs": 72,
                    "local_pairs": [{"a": 4, "b": 5}],
                },
            },
        )
    with pytest.raises(ValueError):
        validate_public(
            "revisions",
            {
                "source": "alfred:UNRATE",
                "summary": {
                    "yearly": [
                        {"year": "2025", "periods": 12, "vintage_matrix": [[4, 5]]}
                    ]
                },
            },
        )
