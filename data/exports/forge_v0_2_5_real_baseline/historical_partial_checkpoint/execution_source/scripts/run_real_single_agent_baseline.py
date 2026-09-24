"""Run the resumable 54-episode Forge v0.2.5 live-model baseline."""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.behavioral import LiveBaselineRunner, ModelIdentity, load_behavioral_suite
from src.execution.trust import CertificationIndex
from src.behavioral.openai_api import OpenAIFactory, GLOBAL_CAP, MODEL_CAPS, frozen_models
from dotenv import load_dotenv


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
    parser.add_argument("--models", type=Path, default=ROOT / "eval/models/forge_v0_2_5_openai.json")
    parser.add_argument("--client-factory", help="Optional adapter for non-OpenAI fixtures")
    parser.add_argument("--max-total-cost-usd", type=float, default=GLOBAL_CAP)
    parser.add_argument("--preflight", action="store_true", help="Validate local setup without API calls")
    parser.add_argument(
        "--output", type=Path,
        default=ROOT / "data/exports/forge_v0_2_5_real_baseline",
    )
    args = parser.parse_args()
    suite = load_behavioral_suite(ROOT / "eval/tasks/forge_v0_2_5/suite.json")
    certifications = CertificationIndex.load(
        ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"
    )
    models = _models(args.models)
    load_dotenv(ROOT / ".env.local", override=False)
    load_dotenv(ROOT / ".env", override=False)
    checkpoint = args.output.with_name(f".{args.output.name}.checkpoint")
    factory = _factory(args.client_factory) if args.client_factory else OpenAIFactory(checkpoint, os.getenv("OPENAI_API_KEY"))
    runner = LiveBaselineRunner(
        root=ROOT,
        suite=suite,
        certifications=certifications,
        models=models,
        client_factory=factory,
        output=args.output,
        authorized_total_cost_usd=args.max_total_cost_usd,
    )
    if args.preflight:
        print(json.dumps({"mode": "NO_API_CALLS", "episodes": 54,
            "models": [m.to_dict() for m in models], "global_hard_cap_usd": GLOBAL_CAP,
            "model_hard_caps_usd": MODEL_CAPS,
            "api_key_configured": bool(os.getenv("OPENAI_API_KEY")),
            "seed_semantics": "task/world only; no deterministic model seed",
            "release_tag_created": False}, indent=2))
        return
    if not args.client_factory and not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is not configured locally; no API calls made")
    manifest = runner.run()
    print(json.dumps({
        "baseline_id": manifest["baseline_id"],
        "episodes": manifest["episodes"],
        "metrics": manifest["metrics"],
        "total_cost_usd": manifest["total_cost_usd"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
