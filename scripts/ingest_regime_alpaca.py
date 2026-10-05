"""Activate free IEX history; no paid feed, orders, or hidden strict-PIT claim."""

from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.regime_intelligence.alpaca import AlpacaPITProvider
from src.dynamics.market_regime_inputs import digest
from src.regime_intelligence.contracts import ASSETS, PITDataset
from src.regime_intelligence.french import FrenchLibraryProvider, daily_factor_observations
from src.regime_intelligence.providers import VersionedExportProvider, alfred_observations
from src.regime_intelligence.service import data_root, install_dataset, merge_publications


def captured_macro(root: Path) -> list:
    rows = []
    for path in sorted((root / "provider-snapshots/fred-alfred").glob("*/*.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        series = document["public_params"].get("series_id")
        if series not in ("CPIAUCSL", "UNRATE"):
            continue
        if digest(document["payload"]) != document["lineage"]["content_hash"]:
            raise ValueError("ALFRED snapshot content hash mismatch")
        rows.extend(alfred_observations(
            document["payload"], series=series, direction="HIGH_IS_STRESS",
            source_as_of=document["lineage"]["retrieved_at"],
            reference="Immutable snapshot " + document["lineage"]["snapshot_id"],
        ))
    if not rows:
        raise ValueError("Existing ALFRED CPI/unemployment snapshots are required")
    return rows


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", choices=ASSETS, action="append")
    parser.add_argument("--start", type=date.fromisoformat, default=date(2016, 1, 1))
    parser.add_argument("--end", type=date.fromisoformat, default=date.today(), help="Exclusive NY date")
    parser.add_argument("--intraday-sessions", type=int, default=90)
    parser.add_argument("--env-file", type=Path, help="Read local credentials into process; never copied to snapshots")
    parser.add_argument("--root", type=Path, default=data_root())
    args = parser.parse_args(argv)
    if args.env_file:
        from dotenv import load_dotenv
        load_dotenv(args.env_file, override=False)
    try:
        macro = captured_macro(args.root)
        library = FrenchLibraryProvider(args.root / "provider-snapshots/kenneth-french").load(args.start)
        factors = daily_factor_observations(library)
        for asset in args.asset or ASSETS:
            provider = AlpacaPITProvider(asset, args.start, args.end, args.root / "provider-snapshots",
                                         intraday_sessions=args.intraday_sessions)
            incoming = provider.load()
            incoming = PITDataset.model_validate({
                **incoming.model_dump(), "observations": [*incoming.observations, *macro, *factors],
                "factor_library": library,
            })
            path = args.root / (asset + ".json")
            if path.exists():
                incoming = merge_publications(VersionedExportProvider(path).load(), incoming)
            result = install_dataset(incoming, args.root)
            result.update({"source": "ALPACA_IEX", "feed": "iex", "coverage": "IEX ONLY",
                           "quality": "CONSERVATIVE_MARKET_TIME", "daily": sum(r.stream == "daily" for r in incoming.observations),
                           "intraday": sum(r.stream == "intraday" for r in incoming.observations),
                           "factor_library": len(incoming.factor_library), "raw_pages": provider.audit})
            print(json.dumps(result, sort_keys=True), flush=True)
        return 0
    except (ValueError, OSError, RuntimeError) as error:
        # Do not print provider exception text/requests; headers contain secrets.
        print(f"Free activation refused: {type(error).__name__}. Check source evidence and free IEX access.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
