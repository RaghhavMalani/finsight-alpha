"""Read-only verification of the immutable Phase 2 v1 reference, including refresh."""
from __future__ import annotations
import argparse
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def execute(runtime=None, public=None, *, refresh=False):
    """The Phase 2 reference is a closed v1 archive, including scheduled refresh."""
    from scripts.verify_plugin_replay import verify

    verify()
    print("ARCHIVED: v1 history verified; no model executed or holdout opened")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--runtime",
        type=Path,
        default=ROOT / "data/exports/replay-source/nervous-runtime",
    )
    parser.add_argument("--public", type=Path, default=ROOT / "frontend-v2/public")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    execute(args.runtime, args.public, refresh=args.refresh)
