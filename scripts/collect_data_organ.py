"""Bounded operator capture/admission; all source bytes and runtime databases local."""

import argparse
import json
import os
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finsight.plugins import SignalStore
from src.data_organ import adapters
from src.data_organ.catalog import catalog
from src.data_organ.registry import Registry
from src.data_organ.service import Service

RUNTIME = ROOT / "data/exports/replay-source/data-organ-runtime"
TENANT = "public-data-evidence"


def import_capture(path, metadata_path, *, runtime, organization_id):
    """Explicit local operator import; never anonymously publish restricted data."""
    if organization_id is None or organization_id < 1:
        raise ValueError(
            "An authenticated local organization is required for operator imports"
        )
    tenant_id = "org-" + str(organization_id)
    service = Service(
        Registry(runtime / "registry.duckdb"),
        runtime / "captures",
        SignalStore(runtime / "signals"),
        organization_id=organization_id,
    )
    meta = json.loads(metadata_path.read_bytes())
    source = meta.get("source", "UNKNOWN_OPERATOR_IMPORT")
    try:
        raw = path.read_bytes()
        if (
            len(raw) > 32 * 1024 * 1024
            or meta.get("schema_version") != "data-organ-operator-capture/1"
            or sha256(raw).hexdigest() != meta.get("sha256")
        ):
            raise ValueError(
                "Bounded source bytes and their operator capture receipt must match"
            )
        window = meta["window"]
        from datetime import date

        if (
            len(window) != 2
            or not 0
            <= (date.fromisoformat(window[1]) - date.fromisoformat(window[0])).days
            <= 2 * 366
        ):
            raise ValueError("Operator window must be bounded to two years")
        if source in {"rbi:policy-repo", "mospi:cpi-combined"}:
            from src.data_organ.india import release_import

            cap, raw, rows = release_import(
                raw,
                source=source,
                source_url=meta["source_url"],
                captured_at=meta["captured_at"],
            )
        elif source in {"nse:bhavcopy", "yfinance"}:
            from io import BytesIO

            import pandas as pd

            frame = pd.read_csv(BytesIO(raw))
            if source == "nse:bhavcopy":
                from src.data_organ.calendars import sessions

                sessions(
                    meta["calendar"], *window
                )  # Never standardize before calendar evidence is admitted.
                mapping = {
                    "TIMESTAMP": "Date",
                    "SYMBOL": "Ticker",
                    "OPEN": "Open",
                    "HIGH": "High",
                    "LOW": "Low",
                    "CLOSE": "Close",
                    "TOTTRDQTY": "Volume",
                }
                if not set(mapping) <= set(frame):
                    raise ValueError("Unsupported official bhavcopy schema")
                if "SERIES" in frame:
                    frame = frame[frame.SERIES == "EQ"].copy()
                frame = frame.rename(columns=mapping)
                frame = frame[frame.Ticker == meta["asset"].removesuffix(".NS")].copy()
                frame.Date = pd.to_datetime(frame.Date, utc=True)
            cap, raw, rows = adapters.market_provider(
                frame,
                raw,
                meta["captured_at"],
                source=source,
                source_url=meta["source_url"],
                asset=meta["asset"],
                calendar=meta["calendar"],
                price_basis=meta["price_basis"],
                cleaning_stage=meta["cleaning_stage"],
                date_only_utc_period=meta.get("date_only_utc_period", False),
            )
        elif source == "alpaca:iex":
            from src.regime_intelligence.alpaca import URL, historical_bar, sessions
            from src.regime_intelligence.contracts import ASSETS

            if (
                meta["asset"] not in ASSETS
                or meta["source_url"] != URL
                or meta.get("feed") != "iex"
                or meta.get("adjustment") != "raw"
                or meta.get("stream") != "daily"
            ):
                raise ValueError("Bounded daily IEX/raw capture evidence is required")
            payload = json.loads(raw)
            if set(payload["bars"]) != {meta["asset"]} or payload.get(
                "next_page_token"
            ):
                raise ValueError(
                    "Single complete operator page required; no silent partial pagination"
                )
            calendar = sessions(
                date.fromisoformat(window[0]), date.fromisoformat(window[1])
            )
            observations = [
                historical_bar(
                    r,
                    stream="daily",
                    calendar=calendar,
                    as_of=meta["captured_at"],
                    snapshot_id=meta["sha256"],
                    content_hash=meta["sha256"],
                )
                for r in payload["bars"][meta["asset"]]
            ]
            cap, raw, rows = adapters.alpaca(
                [r for r in observations if r is not None],
                raw,
                meta["captured_at"],
                meta["source_url"],
                asset=meta["asset"],
            )
        else:
            raise ValueError("Source is outside the approved operator import scope")
        return service.ingest(tenant_id, cap, raw, rows, window=window)
    except (ValueError, TypeError, OSError, KeyError) as error:
        service.unavailable(tenant_id, source, str(error))
        raise


def collect(runtime=RUNTIME, *, network=False, tenant_id=TENANT, organization_id=None):
    service = Service(
        Registry(runtime / "registry.duckdb"),
        runtime / "captures",
        SignalStore(runtime / "signals"),
        organization_id=organization_id,
    )
    profiles = catalog()
    results = []
    for country in ("US", "INDIA"):
        source = "ken-french:daily-factors" if country == "US" else "iima:daily-factors"
        try:
            for cap, raw, rows in adapters.factors(
                ROOT / "data/exports/replay-source", country, network=network
            ):
                results.append(
                    service.ingest(
                        tenant_id,
                        cap,
                        raw,
                        rows,
                        window=profiles["factor_window"],
                        require_public=True,
                    )
                )
        except (ValueError, TypeError, PermissionError, OSError, KeyError) as error:
            service.unavailable(tenant_id, source, str(error))
    if network:
        # Read credentials without printing them; no credentials enter journal metadata.
        from dotenv import dotenv_values

        env_path = ROOT / ".env"
        if not env_path.exists() and ROOT.parent.name == "worktrees":
            env_path = ROOT.parents[2] / ".env"
        values = dotenv_values(env_path) if env_path.exists() else {}
        key = os.getenv("FRED_API_KEY") or values.get("FRED_API_KEY")
        for source, provider in [
            ("alfred:UNRATE", lambda: adapters.alfred(key)),
            ("bls:LNS14000000", adapters.bls),
        ]:
            try:
                cap, raw, rows = provider()
                results.append(
                    service.ingest(
                        tenant_id,
                        cap,
                        raw,
                        rows,
                        window=profiles["macro_window"],
                        require_public=True,
                    )
                )
            except (ValueError, TypeError, PermissionError, OSError, KeyError) as error:
                service.unavailable(tenant_id, source, str(error))
    elif not service.registry.entries(tenant_id, "SOURCE_VERSION"):
        service.unavailable(
            tenant_id, "alfred:UNRATE", "Network collection not requested"
        )
    for source, reason in [
        ("alpaca:iex", "No admitted operator IEX capture; public grant unavailable"),
        ("yfinance", "No admitted local capture; public grant unavailable"),
        (
            "nse:bhavcopy",
            "Official NSE session evidence and operator capture unavailable; no fallback",
        ),
        ("nse:india-vix", "Public publication grant unavailable"),
        (
            "rbi:policy-repo",
            "No witnessed operator release import or verified dataset publication grant",
        ),
        (
            "mospi:cpi-combined",
            "No witnessed operator release import or verified dataset publication grant",
        ),
        (
            "india:fundamentals",
            "No admitted dataset/field coverage or publication permission",
        ),
    ]:
        service.unavailable(tenant_id, source, reason)
    print(
        json.dumps(
            {
                "results": results,
                "failures": len(service.registry.entries(tenant_id, "ATTEMPT_FAILED")),
                "raw_inputs": "LOCAL_ONLY",
            }
        )
    )
    return service


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--network", action="store_true")
    parser.add_argument("--runtime", type=Path, default=RUNTIME)
    parser.add_argument("--tenant", default=TENANT)
    parser.add_argument("--organization", type=int)
    parser.add_argument("--import-file", type=Path)
    parser.add_argument("--metadata-file", type=Path)
    args = parser.parse_args()
    if args.import_file:
        if args.network or not args.metadata_file:
            parser.error(
                "Local import requires --metadata-file and cannot use --network"
            )
        result = import_capture(
            args.import_file,
            args.metadata_file,
            runtime=args.runtime,
            organization_id=args.organization,
        )
        print(json.dumps(result))
    else:
        collect(
            args.runtime,
            network=args.network,
            tenant_id=args.tenant,
            organization_id=args.organization,
        )
