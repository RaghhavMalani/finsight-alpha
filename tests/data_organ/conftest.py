from hashlib import sha256

import pytest

from finsight.plugins import SignalStore
from src.data.license_policy import derived_publication_license
from src.data_organ.contracts import Capture
from src.data_organ.registry import Registry
from src.data_organ.service import Service


@pytest.fixture
def evidence(tmp_path):
    raw = b"official capture test bytes; synthetic test only"
    cap = Capture(
        "alfred:UNRATE",
        "https://alfred.stlouisfed.org/series?seid=UNRATE",
        sha256(raw).hexdigest(),
        "2025-03-01T12:00:00Z",
        {"unemployment_rate": "float"},
        derived_publication_license("alfred:UNRATE", None),
        "PUBLICATION_TIMESTAMP",
        {"status": "NOT_APPLICABLE"},
        "BLS U3",
        "percent",
        "BLS_U3",
    )
    rows = [
        {
            "asset": "UNRATE",
            "field": "unemployment_rate",
            "value": 4.0,
            "observed_at": "2025-01-01T00:00:00Z",
            "available_at": "2025-02-01T12:00:00Z",
            "revision": "r1",
        }
    ]
    registry = Registry(tmp_path / "admissions.duckdb")
    store = SignalStore(tmp_path / "signals")
    service = Service(registry, tmp_path / "captures", store)
    return service, cap, raw, rows
