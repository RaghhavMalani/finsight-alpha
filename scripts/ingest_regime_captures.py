"""Append new receive-captured IEX bars; never relabel/rewrite historical bars."""

from __future__ import annotations

import argparse
from datetime import date, timedelta
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.regime_intelligence.alpaca import sessions
from src.regime_intelligence.collector import replay_captures
from src.regime_intelligence.contracts import ASSETS, PITDataset
from src.regime_intelligence.providers import VersionedExportProvider
from src.regime_intelligence.service import data_root, install_dataset, merge_publications


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", choices=ASSETS, required=True)
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--root", type=Path, default=data_root())
    args = parser.parse_args(argv)
    from src.dynamics.market_regime_inputs import utc
    cutoff = utc(args.as_of)
    previous = VersionedExportProvider(args.root / (args.asset + ".json")).load()
    capture_root = args.root / "provider-snapshots/alpaca-iex-live"
    capture_days = [date.fromisoformat(p.name) for p in capture_root.glob("????-??-??")
                    if p.is_dir() and p.name <= cutoff.date().isoformat()]
    first_day = min(capture_days, default=cutoff.date()) - timedelta(days=1)
    calendar = sessions(first_day, cutoff.date() + timedelta(days=1))
    captures = replay_captures(capture_root,
                              asset=args.asset, cutoff=args.as_of, calendar=calendar)
    installed_times = {r.observed_at for r in previous.observations if r.stream == "intraday"}
    additions = [r for r in captures if r.observed_at not in installed_times]
    incoming = PITDataset.model_validate({**previous.model_dump(), "observations": additions})
    result = install_dataset(merge_publications(previous, incoming), args.root)
    result.update(appended_receive_bars=len(additions), existing_intervals_preserved=len(captures) - len(additions))
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
