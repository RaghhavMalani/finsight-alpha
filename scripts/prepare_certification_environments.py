"""Provision fresh isolated workers from the committed exact dependency locks.

Existing environments are never reused or deleted. The caller chooses a new root.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.eval.canonical import canonical_sha256

ENGINES = ("vectorbt", "nautilus", "hftbacktest", "legacy-hft")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    destination = args.destination.resolve()
    if destination.exists():
        parser.error("destination must not already exist; certification requires fresh environments")
    destination.mkdir(parents=True)
    env = {key: value for key, value in os.environ.items()
           if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"}}
    env.update(PYTHONUTF8="1", PYTHONHASHSEED="0", PIP_DISABLE_PIP_VERSION_CHECK="1")
    provisioned = {}
    for engine in ENGINES:
        lock_path = ROOT / "scripts" / "engine_certification" / "locks" / (engine + ".txt")
        lines = tuple(sorted(line.strip() for line in lock_path.read_text().splitlines() if line.strip()))
        directory = destination / engine
        subprocess.run([sys.executable, "-m", "venv", str(directory)], env=env, check=True)
        python = directory / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        print(f"Installing {engine} from its frozen dependency lock", flush=True)
        subprocess.run([str(python), "-m", "pip", "install", "--no-compile", "--no-deps", "-r", str(lock_path)],
                       env=env, check=True)
        installed = subprocess.check_output([str(python), "-m", "pip", "freeze", "--all"], env=env, text=True)
        actual = tuple(sorted(line.strip() for line in installed.splitlines() if line.strip()))
        if actual != lines:
            raise RuntimeError(f"{engine} environment does not reproduce the committed lock: {set(actual) ^ set(lines)}")
        subprocess.run([str(python), "-m", "pip", "check"], env=env, check=True)
        provisioned[engine] = {"dependency_lock_hash": canonical_sha256(lines), "fresh_install": True}
    receipt = {"schema_version": "forge-clean-environments/0.2.4", "engines": provisioned}
    receipt["receipt_hash"] = canonical_sha256(receipt)
    (destination / "provisioning.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"environment_root": str(destination), "receipt_hash": receipt["receipt_hash"]}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
