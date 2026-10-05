"""Independently verify the frozen D0.4.1.1 diagnostic artifact."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.dynamics.hawkes_boundary_verifier import verify_hawkes_boundary  # noqa: E402


def main() -> int:
    path = ROOT / "eval/dynamics/d0_4_1_1/hawkes_boundary_decomposition.json"
    report = verify_hawkes_boundary(json.loads(path.read_text(encoding="utf-8")))
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
