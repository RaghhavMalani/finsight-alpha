"""Verify the frozen D0.4.1 artifact independently."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.dynamics.hawkes_identifiability import DEFAULT_D041_ARTIFACT  # noqa: E402
from src.dynamics.hawkes_identifiability_verifier import (  # noqa: E402
    verify_hawkes_identifiability,
)


def main() -> int:
    artifact = json.loads(DEFAULT_D041_ARTIFACT.read_text(encoding="utf-8"))
    report = verify_hawkes_identifiability(artifact)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
