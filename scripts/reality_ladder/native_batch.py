"""Time multiple ladder tapes while calling the exact certified adapter functions."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import platform
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=("vectorbt", "nautilus"), required=True)
    args = parser.parse_args()
    request = json.load(sys.stdin)
    if args.engine == "vectorbt":
        import vectorbt as package
        from scripts.engine_certification.vectorbt_semantic import execute

        distribution = "vectorbt"
        invoke = execute
    else:
        import nautilus_trader as package
        from scripts.engine_certification.nautilus_semantic import run_tape

        distribution = "nautilus_trader"
        invoke = run_tape

    results = []
    for run in request["runs"]:
        started = time.perf_counter()
        result = invoke(run["tape"])
        elapsed = time.perf_counter() - started
        results.append({
            "run_key": run["run_key"],
            "runtime_seconds": elapsed,
            "result": result,
        })
    response = {
        "schema_version": "forge-reality-ladder-native-batch/0.2.4.1",
        "engine": args.engine,
        "version": package.__version__,
        "request_hash": request["request_hash"],
        "runtime": {
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "distribution_version": importlib.metadata.version(distribution),
        },
        "results": results,
    }
    print(json.dumps(response, sort_keys=True, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
