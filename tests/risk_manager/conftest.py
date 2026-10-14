"""Memory-only sweep fixtures. No synthetic result enters production artifacts."""
from pathlib import Path
import pytest
from src.risk_manager import sweep

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def preflight():
    """Build a synthetic genesis in memory despite retained production history."""
    patch = pytest.MonkeyPatch()
    patch.setattr(sweep, "previous", lambda root, manifest: (None, None, None, None, []))
    before = (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes()
    try:
        result = sweep.run(ROOT, publish_artifacts=False)
        assert result["status"] == "PARTIAL"
        assert (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes() == before
        return result
    finally:
        patch.undo()
