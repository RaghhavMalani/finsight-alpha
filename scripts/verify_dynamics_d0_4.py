"""Independently verify the frozen D0.4 Hawkes artifact."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.dynamics.hawkes_certification import DEFAULT_D04_ARTIFACT  # noqa: E402
from src.dynamics.hawkes_verifier import verify_hawkes_certification  # noqa: E402


def main() -> int:
    artifact = json.loads(DEFAULT_D04_ARTIFACT.read_text(encoding="utf-8"))
    report = verify_hawkes_certification(artifact)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
