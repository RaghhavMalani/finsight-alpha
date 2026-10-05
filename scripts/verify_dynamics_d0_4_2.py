"""Focused reproducibility/contract check for integrated product analytics."""

import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.dynamics.market_regime import compile_world
from src.dynamics.market_regime_inputs import RegimeWorld
from src.dynamics.market_regime_projection import ARTIFACT, verify_bundle


def compare(actual, expected, label="root"):
    if isinstance(expected, dict):
        assert set(actual) == set(expected), label
        for key in expected:
            if key != "artifact_hash":
                compare(actual[key], expected[key], label + "." + key)
    elif isinstance(expected, list):
        assert len(actual) == len(expected), label
        for i, item in enumerate(expected):
            compare(actual[i], item, label + f"[{i}]")
    elif isinstance(expected, float):
        assert np.isclose(actual, expected, rtol=2e-5, atol=2e-7), label
    else:
        assert actual == expected, label


def main():
    bundle = json.loads(ARTIFACT.read_bytes())
    verify_bundle(bundle)
    for record in bundle["worlds"].values():
        world = RegimeWorld.model_validate(record["input"])
        result = compile_world(world, as_of=record["projection"]["world"]["as_of"])
        compare(result, record["projection"])
    print(
        json.dumps(
            {
                "valid": True,
                "worlds": 2,
                "modules": 5,
                "frozen_parents": len(bundle["frozen_parent_bytes"]),
                "market_claim_eligible": False,
                "artifact_hash": bundle["artifact_hash"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
