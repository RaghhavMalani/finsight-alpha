"""Emit one explicitly synthetic memory-only browser failure scene.

This is engineering QA, never a retained/public risk publication. Only a local
temporary fixture response may use the nested receipt; no file is written.
"""
from pathlib import Path
import json
import sys
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.risk_manager import sweep
from src.risk_manager.contracts import CLAIMS
from src.risk_manager.publication import validate_public


def scene():
    attempts = []
    manifest = ROOT / "frontend-v2/public/replay-manifest.json"
    before = manifest.read_bytes()
    def failed_reader(root):
        raise FileNotFoundError("SYNTHETIC_TEST_ONLY reader fault")
    with patch.object(sweep, "freeze_inventory", failed_reader):
        result = sweep.run(ROOT, publish_artifacts=False, failure_sink=attempts.append)
    if result["status"] != "FAILED" or len(attempts) != 1 or attempts[0].get("kind") != "risk-sweep":
        raise ValueError("Synthetic failure scene could not retain a checked prior state")
    receipt = attempts[0]
    validate_public(receipt, ROOT)
    if manifest.read_bytes() != before:
        raise ValueError("Synthetic scene modified production manifest")
    return dict(schema_version="risk-browser-failure-fixture/1", evidence_class="SYNTHETIC_TEST_ONLY",
                claim_flags=dict(CLAIMS), result=result, receipt=receipt)


if __name__ == "__main__":
    # One compact last line makes startup diagnostics distinguishable from fixture JSON.
    print(json.dumps(scene(), sort_keys=True, separators=(",", ":")))
