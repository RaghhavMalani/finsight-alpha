"""D0.3.2.1 frozen failure microscope HTTP surface tests."""

from backend.main import app


def test_http_surface_exposes_failure_decomposition() -> None:
    assert "/dynamics/certification/failure-decomposition" in app.openapi()["paths"]
