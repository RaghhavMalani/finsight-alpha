"""Scheduled ingestion entrypoint for the first intelligence verticals.

Examples:
    python scripts/ingest_intelligence.py
    python scripts/ingest_intelligence.py --state Karnataka --commodity Tomato --country IND

Each successful provider payload is persisted as an immutable, content-addressed
snapshot. Run this command from cron, Task Scheduler, or a managed scheduler.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.intelligence import AgricultureIntelligenceService, CountryIntelligenceService


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest source-lineage-aware intelligence snapshots.")
    parser.add_argument("--state", default="Maharashtra")
    parser.add_argument("--district")
    parser.add_argument("--commodity", default="Onion")
    parser.add_argument("--market")
    parser.add_argument("--latitude", type=float, default=18.5204)
    parser.add_argument("--longitude", type=float, default=73.8567)
    parser.add_argument("--country", choices=("IND", "USA"), default="IND")
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    parser.add_argument("--trade-year", type=int)
    parser.add_argument("--commodity-code", default="10")
    args = parser.parse_args()

    agriculture = AgricultureIntelligenceService().overview(
        state=args.state,
        district=args.district,
        commodity=args.commodity,
        market=args.market,
        latitude=args.latitude,
        longitude=args.longitude,
    )
    country = CountryIntelligenceService().pulse(
        args.country,
        as_of=args.as_of,
        trade_year=args.trade_year,
        commodity_code=args.commodity_code,
    )
    result = {
        "agriculture": {
            "status": agriculture["status"],
            "snapshots": len(agriculture["lineage"]),
            "issues": agriculture["issues"],
        },
        "country": {
            "status": country["status"],
            "snapshots": len(country["lineage"]),
            "issues": country["issues"],
        },
    }
    print(json.dumps(result, indent=2))
    return 0 if agriculture["status"] != "unavailable" and country["status"] != "unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
