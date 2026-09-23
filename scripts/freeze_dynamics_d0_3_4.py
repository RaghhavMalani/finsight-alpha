"""Freeze the D0.3.4 evidence-complete replication artifact."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.dynamics.evidence_complete_replication import (  # noqa: E402
    DEFAULT_D034_ARTIFACT,
    run_evidence_complete_replication,
    verify_evidence_complete_replication,
)


def main() -> int:
    artifact = run_evidence_complete_replication()
    report = verify_evidence_complete_replication(artifact)
    if not report["valid"]:
        raise SystemExit("D0.3.4 verification failed: " + "; ".join(report["errors"]))
    rendered = json.dumps(artifact, indent=2, sort_keys=True) + "\n"
    target = Path(DEFAULT_D034_ARTIFACT)
    if target.exists() and target.read_text(encoding="utf-8") != rendered:
        raise SystemExit(f"refusing to replace a different frozen artifact: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(rendered, encoding="utf-8")
    metrics = artifact["capability_estimates"]
    print(f"D0.3.4 artifact: {target}")
    print(f"artifact_hash: {artifact['artifact_hash']}")
    print(f"worlds: {report['evidence_complete_worlds']}/{report['executed_worlds']}")
    print(f"program_result: {report['program_result']}")
    for name in (
        "linear_specificity",
        "false_nonlinear_discovery_rate",
        "false_basin_discovery_rate",
        "double_well_detection",
        "basin_precision",
        "basin_recall",
        "potential_topology_accuracy",
        "state_diffusion_detection",
        "numerical_failure_rate",
    ):
        row = metrics[name]
        print(f"{name}: {row['estimate']:.6f} {row['wilson95']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
