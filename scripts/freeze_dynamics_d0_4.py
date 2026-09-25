"""Freeze the D0.4 Hawkes event-process certification artifact."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.dynamics.hawkes_certification import (  # noqa: E402
    DEFAULT_D04_ARTIFACT,
    run_hawkes_certification,
)
from src.dynamics.hawkes_verifier import verify_hawkes_certification  # noqa: E402


def main() -> int:
    artifact = run_hawkes_certification()
    report = verify_hawkes_certification(artifact)
    if not report["valid"]:
        raise SystemExit("D0.4 verification failed: " + "; ".join(report["errors"]))
    rendered = json.dumps(artifact, indent=2, sort_keys=True) + "\n"
    target = Path(DEFAULT_D04_ARTIFACT)
    if target.exists() and target.read_text(encoding="utf-8") != rendered:
        raise SystemExit(f"refusing to replace a different frozen artifact: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(rendered, encoding="utf-8")
    print(f"D0.4 artifact: {target}")
    print(f"artifact_hash: {artifact['artifact_hash']}")
    print(f"worlds: {report['worlds']}")
    print(f"program_result: {report['program_result']}")
    for row in artifact["metrics"]:
        print(f"{row['metric']}: {row['estimate']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
