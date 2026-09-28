"""Run once to freeze the preregistered D0.4.1 evidence artifact."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.dynamics.hawkes_identifiability import (  # noqa: E402
    DEFAULT_D041_ARTIFACT,
    run_hawkes_identifiability,
)
from src.dynamics.hawkes_identifiability_verifier import (  # noqa: E402
    verify_hawkes_identifiability,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=8)
    arguments = parser.parse_args()
    artifact = run_hawkes_identifiability(workers=arguments.workers)
    report = verify_hawkes_identifiability(artifact)
    if not report["valid"]:
        raise SystemExit("D0.4.1 verification failed before freeze: " + "; ".join(report["errors"]))
    target = Path(DEFAULT_D041_ARTIFACT)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"artifact": str(target), "artifact_hash": artifact["artifact_hash"], "status": artifact["program_result"]["status"], "worlds": len(artifact["worlds"])}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
