"""Broken lineage cannot release cached numerical views or mutate sealed runs."""

from types import SimpleNamespace

import pytest

from backend.routes import regimes as route
from src.regimes.publication import (
    project_factors,
    project_history,
    project_lineage,
    project_snapshot,
    project_timeline,
)
from tests.regimes.test_api import client


@pytest.mark.parametrize("chains", [{}, {"volatility": {"status": "INVALID", "reason": "admission seal changed"}}])
@pytest.mark.parametrize("kind", ["snapshot", "timeline", "factors", "history"])
def test_numerical_projections_reject_missing_or_invalid_lineage(chains, kind):
    snapshot = {"lineage": chains, "runs": {"volatility": {"current": {"realized_vol_20": 0.01}}}}
    project = {"snapshot": project_snapshot, "timeline": project_timeline, "factors": project_factors}
    with pytest.raises(ValueError, match="INPUT_LINEAGE_INVALID"):
        if kind == "history":
            project_history(None, snapshot, "regimes:snapshot:" + "1" * 64)
        else:
            project[kind](snapshot)
    assert snapshot["runs"]["volatility"]["current"] == {"realized_vol_20": 0.01}


@pytest.mark.parametrize("path", [
    "/regimes/snapshot?asset=US-MKT",
    "/regimes/timeline?asset=US-MKT",
    "/regimes/factors?asset=US-MKT",
    "/regimes/seasonality?asset=US-MKT",
    "/regimes/compare?assets=US-MKT,IN-MKT",
    "/regimes/matrix",
])
def test_broken_lineage_returns_409_before_any_numerical_projection(monkeypatch, tmp_path, path):
    snapshot = {"lineage": {"volatility": {"status": "INVALID", "reason": "admission seal changed"}}}
    pipe = SimpleNamespace(snapshot=lambda *_: snapshot)
    monkeypatch.setattr(route, "_pipeline", lambda *_: pipe)
    monkeypatch.setattr(route, "_latest", lambda *_: "2026-10-10T13:59:59Z")
    response = client(monkeypatch, tmp_path, org=1).get(path)
    assert response.status_code == 409
    assert "INPUT_LINEAGE_INVALID" in response.json()["detail"]
    assert "payload" not in response.json()


def test_invalid_lineage_remains_readable_as_a_diagnostic():
    snapshot = {"asset": "US-MKT", "lineage": {"volatility": {
        "status": "INVALID", "run_id": "1" * 64, "reason": "admission seal changed",
    }}}
    value = project_lineage(snapshot)
    assert value["runs"]["volatility"] == snapshot["lineage"]["volatility"]
    assert value["source_values"] == "LOCAL_ONLY"
