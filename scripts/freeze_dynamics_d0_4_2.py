"""Build ONE integrated product-reference artifact; not a certification ladder."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.dynamics.market_regime import compile_world
from src.dynamics.market_regime_fixture import demo_world
from src.dynamics.market_regime_inputs import digest
from src.dynamics.market_regime_projection import ARTIFACT, source_hashes, verify_bundle


def main() -> None:
    if ARTIFACT.exists():
        raise SystemExit("Refusing to overwrite integrated reference evidence")
    files = subprocess.check_output(
        ["git", "ls-files", "eval/dynamics"], cwd=ROOT, text=True
    ).splitlines()
    parents = {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in files
        if not name.startswith("eval/dynamics/d0_4_2/")
    }
    records = {}
    for sparse in (False, True):
        world = demo_world(sparse=sparse)
        projection = compile_world(world, as_of=world.daily[-1].available_at)
        records[world.id] = {"input": world.payload(), "projection": projection}
        print(
            world.id,
            projection["landscape"]["status"],
            len(projection["landscape"]["cells"]),
            flush=True,
        )
    bundle = {
        "schema_version": "market-regime-bundle/0.4.2",
        "parent_head": "0383d7d84db6944f1cc82614ce5bd76ad91a870d",
        "frozen_parent_bytes": parents,
        "source_hashes": source_hashes(),
        "worlds": records,
    }
    bundle["artifact_hash"] = digest(bundle)
    verify_bundle(bundle)
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    ARTIFACT.write_bytes(
        (json.dumps(bundle, indent=2, allow_nan=False) + "\n")
        .replace("\n", "\r\n")
        .encode()
    )
    print(bundle["artifact_hash"])


if __name__ == "__main__":
    main()
