"""Publication-evidenced snapshots, cached historical replay, and comparison."""

from __future__ import annotations

from collections import OrderedDict
from concurrent.futures import Future
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import threading

from src import config
from src.dynamics.market_regime import CLAIMS, POLICY, compile_world, fracture, clean
from src.dynamics.market_regime_inputs import digest, utc, RegimeInputError
from src.dynamics.market_regime_projection import load_lab, source_hashes
from src.intelligence.snapshots import SnapshotStore
from src.regime_intelligence.contracts import (
    ASSETS,
    STREAMS,
    PITDataset,
    to_world,
    visible_payload,
)
from src.regime_intelligence.providers import VersionedExportProvider

VERSION = "market-regime-product/1"
_lock = threading.Lock()
_cache = OrderedDict()
_pending: dict[tuple, Future] = {}


def data_root() -> Path:
    return config.DATA_DIR / "regime_intelligence/v1"


def load_dataset(asset: str) -> PITDataset:
    if asset not in ASSETS:
        raise RegimeInputError("Supported real assets: " + ", ".join(ASSETS))
    dataset = VersionedExportProvider(data_root() / (asset + ".json")).load()
    if dataset.asset != asset:
        raise RegimeInputError("Asset/file identity mismatch")
    return dataset


def merge_publications(previous: PITDataset, incoming: PITDataset) -> PITDataset:
    """Retain original capture evidence on repeated fetches of the same vintage."""
    if previous.model_dump(exclude={"observations", "factor_library"}) != incoming.model_dump(
        exclude={"observations", "factor_library"}
    ):
        raise RegimeInputError("Append requires identical dataset definitions")
    rows = {}
    for row in [*previous.observations, *incoming.observations]:
        identity = (
            row.stream,
            row.values.get("series", ""),
            row.observed_at,
            row.available_at,
        )
        if identity in rows:
            old = rows[identity]
            if old.model_dump(
                exclude={"as_of", "publication_evidence"}
            ) != row.model_dump(exclude={"as_of", "publication_evidence"}):
                raise RegimeInputError(
                    "Same publication identity has changed values or attribution"
                )
        else:
            rows[identity] = row
    releases = {digest(r.model_dump(mode="json")): r for r in
                [*previous.factor_library, *incoming.factor_library]}
    return PITDataset.model_validate({
        **previous.model_dump(), "observations": list(rows.values()),
        "factor_library": list(releases.values()),
    })


def install_dataset(dataset: PITDataset, root: Path | None = None) -> dict:
    """Operator-only ingestion: append publications, never overwrite history."""
    if dataset.asset not in ASSETS:
        raise RegimeInputError("Asset is not in the v1 universe")
    root = root or data_root()
    root.mkdir(parents=True, exist_ok=True)
    lock_path = root / (dataset.asset + ".ingest.lock")
    try:
        handle = lock_path.open("x", encoding="utf-8")
    except FileExistsError as error:
        raise RegimeInputError(
            "Another import is active; investigate a stale operator lock before retrying"
        ) from error
    try:
        with handle:
            return _install(dataset, root)
    finally:
        lock_path.unlink()


def _install(dataset: PITDataset, root: Path) -> dict:
    path = root / (dataset.asset + ".json")
    document = dataset.model_dump(mode="json")
    if path.exists():
        previous = VersionedExportProvider(path).load().model_dump(mode="json")
        if {k: v for k, v in previous.items() if k not in ("observations", "factor_library")} != {
            k: v for k, v in document.items() if k not in ("observations", "factor_library")
        }:
            raise RegimeInputError("Dataset definitions cannot be silently changed")
        old_rows = {digest(row): row for row in previous["observations"]}
        new_rows = {digest(row): row for row in document["observations"]}
        if not old_rows.keys() <= new_rows.keys():
            raise RegimeInputError(
                "Import removes or rewrites historical publication evidence"
            )
        if not {digest(r) for r in previous.get("factor_library", [])} <= {
            digest(r) for r in document.get("factor_library", [])
        }:
            raise RegimeInputError("Import removes French release evidence")
    snapshot = SnapshotStore(root / "snapshots", register_metadata=False).record(
        "regime-pit-export",
        "local://publication-evidenced-export",
        {"asset": dataset.asset},
        document,
        dataset_key="regime-pit:" + dataset.asset,
    )
    root.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(document, sort_keys=True, allow_nan=False), encoding="utf-8"
    )
    temporary.replace(path)
    return {
        "asset": dataset.asset,
        "snapshot_id": snapshot.lineage.snapshot_id,
        "observations": len(dataset.observations),
    }


def lineage(payload: dict) -> list[dict]:
    result = []
    for stream in STREAMS:
        rows = [r for r in payload["observations"] if r["stream"] == stream]
        result.append(
            {
                "stream": stream,
                "status": "AVAILABLE" if rows else "UNAVAILABLE",
                "observations": len(rows),
                "sources": sorted({r["source"] for r in rows}),
                "revisions": sorted({r["revision"] for r in rows}),
                "quality": sorted({r["quality"] for r in rows}),
                "available_through": max(
                    (r["available_at"] for r in rows), default=None
                ),
                "publication_evidence": sorted(
                    {r["publication_evidence"] for r in rows}
                ),
                "source_as_of": max((r["as_of"] for r in rows), default=None),
            }
        )
    return result


def evidence_disclosure(payload: dict) -> dict:
    market = [r for r in payload["observations"] if r["stream"] in ("daily", "intraday")]
    quality = {r["quality"] for r in market}
    mode = (
        "MIXED" if "CONSERVATIVE_MARKET_TIME" in quality and len(quality) > 1
        else "CONSERVATIVE_MARKET_TIME" if "CONSERVATIVE_MARKET_TIME" in quality
        else "RECEIVE_TIMESTAMP_CAPTURED" if "RECEIVE_TIMESTAMP_CAPTURED" in quality
        else "STRICT_PIT" if market else "UNAVAILABLE"
    )
    iex = any(r["source"] == "ALPACA_IEX" for r in market)
    return {
        "mode": mode,
        "coverage": "IEX ONLY" if iex else "SOURCE_DEFINED",
        "historical_receive_timing": "UNAVAILABLE" if "CONSERVATIVE_MARKET_TIME" in quality else "EVIDENCED",
        "disclosure": (
            "Historical market availability reconstructed conservatively; exact historical receive timestamp unavailable. "
            if "CONSERVATIVE_MARKET_TIME" in quality else ""
        ) + ("Coverage: IEX ONLY. Not consolidated US market volume, trades or liquidity." if iex else "See source definitions."),
    }


def factor_library_lineage(payload: dict) -> list[dict]:
    rows = payload.get("factor_library", [])
    return [
        {
            "family": family, "frequency": frequency,
            "observations": len(selected),
            "available_through": max(r["available_at"] for r in selected),
            "quality": sorted({r["quality"] for r in selected}),
            "sources": sorted({r["source_url"] for r in selected}),
            "content_hashes": sorted({r["content_hash"] for r in selected}),
            "factors": sorted({k for r in selected for k in r["values"]}),
            "note": "Source library evidence; seven-factor neutrality remains incomplete. RMW/CMA are not QUAL/VOL/LIQ.",
        }
        for family, frequency in sorted({(r["family"], r["frequency"]) for r in rows})
        for selected in [[r for r in rows if r["family"] == family and r["frequency"] == frequency]]
    ]


def transition_timeline(analysis: dict) -> list[dict]:
    rows, previous = [], None
    for state in analysis["timeline"]:
        ledger = fracture(state["vector"], previous)
        rows.append(
            {
                "observed_at": state["observed_at"],
                "available_at": state["available_at"],
                "regime": state["regime"],
                "vector": state["vector"],
                "fracture": ledger,
                "transition": ledger["status"] == "COMPLETE"
                and ledger["score"] >= 0.10,
            }
        )
        previous = state["vector"]
    if rows:
        rows[-1]["fracture"] = analysis["current"]["fracture"]
        rows[-1]["transition"] = (
            rows[-1]["fracture"]["status"] == "COMPLETE"
            and rows[-1]["fracture"]["score"] >= 0.10
        )
    return rows


def _compute(payload: dict, as_of: str, version: str) -> dict:
    analysis = None
    reason = None
    if sum(r["stream"] == "daily" for r in payload["observations"]) < 2:
        reason = "UNAVAILABLE: need two daily bars with genuine publication evidence at this cutoff"
    else:
        analysis = compile_world(to_world(payload), as_of=as_of)
    target = (
        "SUPPLIED_STRATEGY"
        if any(
            r["stream"] == "daily" and r["values"].get("strategy_return") is not None
            for r in payload["observations"]
        )
        else "ASSET_BUY_AND_HOLD_RETURN"
    )
    result = {
        "schema_version": VERSION,
        "analytics_version": POLICY["version"],
        "asset": payload["asset"],
        "scope": "REAL_PIT",
        "as_of": as_of,
        "input_hash": digest(payload),
        "status": "AVAILABLE" if analysis else "UNAVAILABLE",
        "reason": reason,
        "claims": CLAIMS,
        "analysis": analysis,
        "state_at": analysis["current"]["available_at"] if analysis else None,
        "provenance": lineage(payload),
        "market_evidence": evidence_disclosure(payload),
        "factor_library": factor_library_lineage(payload),
        "definitions": payload["definitions"],
        "attribution_target": target,
        "timeline": transition_timeline(analysis) if analysis else [],
        "cache_identity": {
            "input_hash": digest(payload),
            "as_of": as_of,
            "asset": payload["asset"],
            "analytics_version": version,
        },
        "note": "State evaluated at the latest published daily price bar; later events/releases enter the next bar state. NOW is latest installed evidence, not a live trading feed.",
    }
    result["snapshot_hash"] = digest(result)
    return result


def replay_dataset(dataset: PITDataset, as_of: str) -> dict:
    cutoff = utc(as_of).isoformat()
    payload = visible_payload(dataset, cutoff)
    # Validate the release boundary, including its frozen parents, without
    # changing or recalibrating any estimator.
    load_lab("demo-full")
    version = POLICY["version"] + ":" + digest(source_hashes())
    key = (digest(payload), cutoff, dataset.asset, version)
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return copy.deepcopy(_cache[key])
        owner = key not in _pending
        future = _pending.setdefault(key, Future())
    if not owner:
        return copy.deepcopy(future.result(timeout=180))
    try:
        result = _compute(payload, cutoff, version)
        with _lock:
            _cache[key] = result
            while len(_cache) > 24:
                _cache.popitem(last=False)
        future.set_result(result)
        return copy.deepcopy(result)
    except BaseException as error:
        future.set_exception(error)
        raise
    finally:
        with _lock:
            _pending.pop(key, None)


def snapshot(
    asset: str,
    as_of: str | None = None,
    source: str = "real",
    dataset: PITDataset | None = None,
) -> dict:
    if source in ("demo-full", "demo-sparse"):
        if asset != "DEMO":
            raise RegimeInputError(
                "Synthetic worlds must use asset=DEMO, never a real ticker"
            )
        analysis = load_lab(source, as_of)
        result = {
            "schema_version": VERSION,
            "analytics_version": POLICY["version"],
            "asset": "DEMO",
            "scope": "SYNTHETIC",
            "as_of": analysis["world"]["as_of"],
            "input_hash": analysis["world"]["input_hash"],
            "status": "AVAILABLE",
            "reason": None,
            "claims": CLAIMS,
            "analysis": analysis,
            "state_at": analysis["current"]["available_at"],
            "provenance": [
                {
                    "stream": "synthetic",
                    "status": "AVAILABLE",
                    "sources": [analysis["world"]["source"]],
                    "revisions": [analysis["world"]["revision"]],
                    "quality": ["SYNTHETIC"],
                    "observations": analysis["world"]["observations"],
                    "available_through": analysis["world"]["as_of"],
                    "source_as_of": analysis["world"]["as_of"],
                    "publication_evidence": ["Explicit frozen demo"],
                }
            ],
            "definitions": {},
            "attribution_target": "SYNTHETIC_STRATEGY",
            "timeline": transition_timeline(analysis),
            "cache_identity": {
                "input_hash": analysis["world"]["input_hash"],
                "as_of": analysis["world"]["as_of"],
                "asset": "DEMO",
                "analytics_version": POLICY["version"],
            },
            "note": "Synthetic integration demo, not SPY/QQQ/IWM market history.",
        }
        result["snapshot_hash"] = digest(result)
        return result
    if source != "real":
        raise RegimeInputError("Unknown data source")
    dataset = dataset or load_dataset(asset)
    if dataset.asset != asset:
        raise RegimeInputError("Requested asset does not match dataset")
    cutoff = (
        as_of
        if as_of is not None
        else max(
            (r.available_at for r in dataset.observations),
            default=datetime.now(timezone.utc),
        ).isoformat()
    )
    return replay_dataset(dataset, cutoff)


def compare(asset: str, left: str, right: str, source: str = "real") -> dict:
    # Read the dataset once: both cutoffs use the same immutable input view.
    dataset = load_dataset(asset) if source == "real" else None
    a, b = snapshot(asset, left, source, dataset), snapshot(
        asset, right, source, dataset
    )
    return {
        "schema_version": "regime-compare/1",
        "asset": asset,
        "claims": CLAIMS,
        "left": a,
        "right": b,
        "vector_delta": {
            k: (
                clean(
                    b["analysis"]["current"]["vector"][k]
                    - a["analysis"]["current"]["vector"][k]
                )
                if a["analysis"]
                and b["analysis"]
                and a["analysis"]["current"]["vector"][k] is not None
                and b["analysis"]["current"]["vector"][k] is not None
                else None
            )
            for k in ("V", "L", "M", "H", "F", "S", "C")
        },
    }


def catalog() -> dict:
    assets = []
    for asset in ASSETS:
        try:
            dataset = load_dataset(asset)
            cutoffs = sorted(
                {
                    r.available_at.isoformat()
                    for r in dataset.observations
                    if r.stream == "daily"
                }
            )
            disclosure = evidence_disclosure({"observations": [
                {"stream": r.stream, "source": r.source, "quality": r.quality}
                for r in dataset.observations
            ]})
            assets.append(
                {
                    "asset": asset,
                    "source": "real",
                    "scope": "REAL_PIT",
                    "available": bool(cutoffs),
                    "reason": None if cutoffs else "No published daily price bars",
                    "cutoffs": cutoffs,
                    "evidence_mode": disclosure["mode"],
                    "coverage": disclosure["coverage"],
                }
            )
        except (FileNotFoundError, ValueError, OSError) as error:
            assets.append(
                {
                    "asset": asset,
                    "source": "real",
                    "scope": "REAL_PIT",
                    "available": False,
                    "reason": (
                        "No valid publication-evidenced input installed"
                        if isinstance(error, FileNotFoundError)
                        else "Installed input failed validation"
                    ),
                    "cutoffs": [],
                }
            )
    for source in ("demo-full", "demo-sparse"):
        data = load_lab(source)
        assets.append(
            {
                "asset": "DEMO",
                "source": source,
                "scope": "SYNTHETIC",
                "available": True,
                "reason": "Not market history",
                "cutoffs": [r["available_at"] for r in data["timeline"][1:]],
            }
        )
    return {
        "schema_version": "regime-product-catalog/1",
        "assets": assets,
        "read_only": True,
        "network_downloads": False,
        "provider_requirements": [
            "Versioned JSON/CSV exports require actual available_at and publication evidence",
            "ALFRED adapter requires FRED_API_KEY and original vintage history",
            "Free Alpaca IEX history uses disclosed CONSERVATIVE_MARKET_TIME; exact receive timing is unavailable",
            "Forward Alpaca IEX captures use RECEIVE_TIMESTAMP_CAPTURED; IEX is not consolidated US volume",
            "Factors/liquidity/events stay UNAVAILABLE until legitimate feeds are installed",
        ],
    }
