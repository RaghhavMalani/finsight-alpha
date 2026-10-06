"""Archive free live IEX messages with local UTC receipt evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.regime_intelligence.collector import collect
from src.regime_intelligence.service import data_root


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration-seconds", type=int, default=60, help="0 = continuous until operator stops")
    parser.add_argument("--max-messages", type=int, default=100000)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--root", type=Path, default=data_root() / "provider-snapshots/alpaca-iex-live")
    args = parser.parse_args(argv)
    if args.env_file:
        from dotenv import load_dotenv
        load_dotenv(args.env_file, override=False)
    try:
        print(json.dumps(collect(args.root, duration_seconds=args.duration_seconds, max_messages=args.max_messages)))
        return 0
    except Exception as error:
        print(f"IEX archival collector stopped: {type(error).__name__}. Credentials and auth messages are not logged.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
