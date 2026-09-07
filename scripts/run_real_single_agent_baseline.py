"""Run the resumable 54-episode Forge v0.2.5 live-model baseline."""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.behavioral import LiveBaselineRunner, ModelIdentity, load_behavioral_suite
from src.execution.trust import CertificationIndex


def _models(path: Path) -> tuple[ModelIdentity, ...]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if set(document) != {"schema_version", "models"}:
        raise ValueError("model suite fields must be exactly models and schema_version")
    if document["schema_version"] != "forge-real-single-agent-models/0.2.5":
        raise ValueError("unsupported model suite schema")
    return tuple(ModelIdentity.from_dict(item) for item in document["models"])


def _factory(reference: str):
    module_name, separator, attribute = reference.partition(":")
    if not separator or not module_name or not attribute:
        raise ValueError("client factory must use module.path:callable format")
    factory = getattr(importlib.import_module(module_name), attribute)
    if not callable(factory):
        raise TypeError("client factory reference is not callable")
    return factory


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, required=True)
    parser.add_argument("--client-factory", required=True)
    parser.add_argument("--max-total-cost-usd", type=float, required=True)
    parser.add_argument(
        "--output", type=Path,
        default=ROOT / "data/exports/forge_v0_2_5_real_baseline",
    )
    args = parser.parse_args()
    suite = load_behavioral_suite(ROOT / "eval/tasks/forge_v0_2_5/suite.json")
    certifications = CertificationIndex.load(
        ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"
    )
    manifest = LiveBaselineRunner(
        root=ROOT,
        suite=suite,
        certifications=certifications,
        models=_models(args.models),
        client_factory=_factory(args.client_factory),
        output=args.output,
        authorized_total_cost_usd=args.max_total_cost_usd,
    ).run()
    print(json.dumps({
        "baseline_id": manifest["baseline_id"],
        "episodes": manifest["episodes"],
        "metrics": manifest["metrics"],
        "total_cost_usd": manifest["total_cost_usd"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
