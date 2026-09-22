from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from backend.main import app
from backend.routes import dynamics
from src.dynamics.generalization_autopsy import (
    GeneralizationAutopsyError,
    load_frozen_generalization_autopsy,
)


def test_http_surface_exposes_generalization_autopsy() -> None:
    assert "/dynamics/certification/generalization-autopsy" in app.openapi()["paths"]


def test_route_returns_frozen_non_market_artifact() -> None:
    payload = dynamics.generalization_autopsy_artifact()

    assert payload["schema_version"] == "dynamics-generalization-autopsy/0.3.3.1"
    assert payload["scientific_conclusion"]["d0_3_3_result"] == "NO_GRADUATE"
    assert payload["market_claim_eligible"] is False
    assert payload["marketClaimEligible"] is False


def test_loader_and_api_fail_closed_for_corruption(tmp_path, monkeypatch) -> None:
    corrupt = tmp_path / "generalization_autopsy.json"
    corrupt.write_text(json.dumps({"artifact_hash": "corrupt"}), encoding="utf-8")
    with pytest.raises(GeneralizationAutopsyError):
        load_frozen_generalization_autopsy(corrupt)

    def fail_closed() -> dict:
        raise GeneralizationAutopsyError("corrupted diagnostic artifact")

    monkeypatch.setattr(dynamics, "load_frozen_generalization_autopsy", fail_closed)
    with pytest.raises(HTTPException) as captured:
        dynamics.generalization_autopsy_artifact()
    assert captured.value.status_code == 409
