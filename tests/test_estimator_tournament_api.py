"""D0.3.2 frozen estimator tournament HTTP surface tests."""

from backend.main import app


def test_http_surface_exposes_frozen_tournament() -> None:
    assert "/dynamics/certification/estimator-tournament" in app.openapi()["paths"]
