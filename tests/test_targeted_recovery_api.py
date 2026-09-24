from __future__ import annotations

from backend.main import app
from backend.routes.dynamics import targeted_recovery_artifact


def test_http_surface_exposes_targeted_recovery() -> None:
    assert "/dynamics/certification/targeted-recovery" in app.openapi()["paths"]


def test_route_loads_the_frozen_targeted_recovery() -> None:
    artifact = targeted_recovery_artifact()

    assert artifact["schema_version"] == "dynamics-targeted-recovery/0.3.3"
    assert artifact["graduation"]["decision"] == "NO_GRADUATE"
