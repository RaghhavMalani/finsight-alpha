"""Operator ingestion; no Date-only fallback and no synthetic market substitution."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.regime_intelligence.contracts import PITDataset
from src.regime_intelligence.providers import (
    FredVintageProvider,
    VersionedExportProvider,
    publication_csv,
)
from src.regime_intelligence.service import (
    data_root,
    install_dataset,
    merge_publications,
)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "input",
        type=Path,
        help="Versioned regime-pit/1 JSON; may be an empty metadata template",
    )
    parser.add_argument("--daily-csv", type=Path)
    parser.add_argument("--intraday-csv", type=Path)
    parser.add_argument(
        "--source",
        help="CSV provider identity; publication evidence is still required per row",
    )
    parser.add_argument(
        "--fred",
        action="append",
        default=[],
        metavar="SERIES:DIRECTION",
        help="HIGH_IS_STRESS or LOW_IS_STRESS; explicit macro augmentation",
    )
    parser.add_argument(
        "--as-of",
        help="Timezone-aware FRED vintage query cutoff, not a guessed publication time",
    )
    parser.add_argument("--root", type=Path, default=data_root())
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args(argv)
    try:
        dataset = VersionedExportProvider(args.input).load()
        rows = []
        for stream, path in (
            ("daily", args.daily_csv),
            ("intraday", args.intraday_csv),
        ):
            if path:
                if not args.source:
                    raise ValueError("CSV ingestion requires --source")
                rows.extend(publication_csv(path, stream=stream, source=args.source))
        if args.fred:
            if not args.as_of:
                raise ValueError("FRED ingestion requires an explicit --as-of")
            provider = FredVintageProvider(
                os.getenv("FRED_API_KEY", ""), args.root / "provider-snapshots"
            )
            for spec in args.fred:
                series, direction = spec.split(":", 1)
                if direction not in ("HIGH_IS_STRESS", "LOW_IS_STRESS"):
                    raise ValueError("Explicit stress direction required")
                rows.extend(provider.observations(series, direction, args.as_of))
        additions = PITDataset.model_validate(
            {**dataset.model_dump(), "observations": rows}
        )
        incoming = merge_publications(dataset, additions)
        path = args.root / (incoming.asset + ".json")
        if path.exists():
            incoming = merge_publications(
                VersionedExportProvider(path).load(), incoming
            )
        if args.validate_only:
            print(
                f"Valid publication contract: {incoming.asset}, {len(incoming.observations)} rows; no installation"
            )
        else:
            print(install_dataset(incoming, args.root))
        return 0
    except (ValueError, OSError, RuntimeError) as error:
        # Credentials never appear in provider requests printed by this CLI.
        print(
            f"Import refused: {type(error).__name__}. Check publication evidence and provider configuration.",
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
