"""Independently verify the frozen D0.3.4 replication artifact."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.dynamics.evidence_complete_replication import (  # noqa: E402
    DEFAULT_D034_ARTIFACT,
    verify_evidence_complete_replication,
)


def main() -> int:
    artifact = json.loads(DEFAULT_D034_ARTIFACT.read_text(encoding="utf-8"))
    report = verify_evidence_complete_replication(artifact)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
