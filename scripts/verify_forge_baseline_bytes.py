"""Every file listed in the frozen Forge v0.2.5 baseline manifest still has its recorded SHA-256."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data/exports/forge_v0_2_5_real_baseline"


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    bad = [name for name, digest in manifest["artifacts"].items()
           if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest]
    if bad:
        raise SystemExit("Frozen Forge byte mismatch: " + ", ".join(bad))
    print(f"Verified {len(manifest['artifacts'])} frozen Forge file hashes")


if __name__ == "__main__":
    main()
