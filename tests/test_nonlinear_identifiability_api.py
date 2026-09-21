"""Frozen D0.3.1 artifact and HTTP surface tests."""

from __future__ import annotations

from backend.main import app
from src.dynamics.identifiability import (
    load_frozen_identifiability_artifact,
    verify_identifiability_artifact,
)


def test_frozen_reference_is_valid_and_exposes_the_power_failure() -> None:
    artifact = load_frozen_identifiability_artifact()
    verification = verify_identifiability_artifact(artifact)

    assert verification["valid"] is True
    assert artifact["runs"] == 290
    assert artifact["capability_card"]["status"] == "CALIBRATED"
    assert artifact["capability_card"]["linear_specificity"] >= 0.95
    assert 0.0 < artifact["capability_card"]["nonlinear_detection_rate"] < 0.10
    assert artifact["capability_card"]["nonlinear_false_negative_rate"] >= 0.90
    assert 0.0 < artifact["capability_card"]["basin_recall"] < 0.20
    assert artifact["capability_card"]["potential_topology_accuracy"] == 0.0
    assert artifact["real_market_context"]["d03_selected_model"] == "M1"


def test_http_surface_exposes_d031_artifact() -> None:
    assert "/dynamics/certification/nonlinear-identifiability" in app.openapi()["paths"]
