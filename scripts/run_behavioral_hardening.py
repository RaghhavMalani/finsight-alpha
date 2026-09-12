"""Run the resumable 72-episode Forge v0.2.5.1 hardening benchmark."""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.behavioral.contracts import ModelIdentity
from src.behavioral_hardening import HardeningBenchmarkRunner, load_hardening_suite
from src.behavioral_hardening.openai_api import (
    GLOBAL_CAP,
    MODEL_CAPS,
    HardeningOpenAIFactory,
    frozen_models,
)
from src.execution.trust import CertificationIndex


def _models(path: Path) -> tuple[ModelIdentity, ...]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if set(document) != {"schema_version", "models"}:
        raise ValueError("model suite fields must be exactly models and schema_version")
    if document["schema_version"] != "forge-behavioral-hardening-models/0.2.5.1":
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
    parser.add_argument(
        "--models", type=Path, default=ROOT / "eval/models/forge_v0_2_5_1_openai.json"
    )
    parser.add_argument("--client-factory", help="Optional adapter for non-OpenAI fixtures")
    parser.add_argument("--max-total-cost-usd", type=float, default=GLOBAL_CAP)
    parser.add_argument("--preflight", action="store_true", help="Validate setup without API calls")
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data/exports/forge_v0_2_5_1_behavioral_hardening",
    )
    args = parser.parse_args()
    suite = load_hardening_suite(ROOT / "eval/tasks/forge_v0_2_5_1/suite.json")
    certifications = CertificationIndex.load(
        ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"
    )
    models = _models(args.models)
    load_dotenv(ROOT / ".env.local", override=False)
    load_dotenv(ROOT / ".env", override=False)
    checkpoint = args.output.with_name(f".{args.output.name}.checkpoint")
    factory = (
        _factory(args.client_factory)
        if args.client_factory
        else HardeningOpenAIFactory(checkpoint, os.getenv("OPENAI_API_KEY"))
    )
    runner = HardeningBenchmarkRunner(
        root=ROOT,
        suite=suite,
        certifications=certifications,
        models=models,
        client_factory=factory,
        output=args.output,
        authorized_total_cost_usd=args.max_total_cost_usd,
    )
    if args.preflight:
        print(json.dumps({
            "mode": "NO_API_CALLS",
            "episodes": 72,
            "tasks": len(suite.tasks),
            "models": [model.to_dict() for model in models],
            "seeds": list(runner.seeds),
            "global_hard_cap_usd": GLOBAL_CAP,
            "model_hard_caps_usd": MODEL_CAPS,
            "api_key_configured": bool(os.getenv("OPENAI_API_KEY")),
            "seed_semantics": "task/world only; no deterministic model seed",
            "reuses_v0_2_5_trajectories": False,
            "release_tag_created": False,
        }, indent=2))
        return
    if not args.client_factory and not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is not configured locally; no API calls made")
    manifest = runner.run()
    print(json.dumps({
        "benchmark_id": manifest["benchmark_id"],
        "episodes": manifest["episodes"],
        "metrics": manifest["metrics"],
        "total_cost_usd": manifest["total_cost_usd"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
