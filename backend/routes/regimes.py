"""Authenticated, local, read-only Phase 5 regime views.

GET routes read sealed runs and admitted local evidence only: no upstream fetch,
no computation, no registry writes. New cutoffs are computed by the explicit
operator command `scripts/export_regimes_replay.py`. Public visitors use the
SHA-checked Replay artifacts instead.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request

from src import config
from src.regimes.contracts import CLAIMS, SCHEMA, module_status
from src.regimes.profile import market, profile

router = APIRouter(prefix="/regimes", tags=["regimes"])


def _runtime(asset):
    spec = market(asset)
    local = spec["tier"] == "LOCAL_ONLY"
    name = "regimes-local-runtime" if local else "regimes-runtime"
    tenant = "local-regime-evidence" if local else profile()["tenant"]
    return config.EXPORTS_DIR / "replay-source" / name, tenant


def _gate(request):
    if config.APP_ENV == "production":
        raise HTTPException(503, "Regime runtime is local only; public views use checked Replay")
    org = getattr(request.state, "organization_id", None)
    if type(org) is not int or org < 1 or not getattr(request.state, "user_id", None):
        raise HTTPException(401, "Authenticated organization required")


def _pipeline(asset):
    try:
        market(asset)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    runtime, tenant = _runtime(asset)
    if not (Path(runtime) / "runs.sqlite").exists():
        raise HTTPException(404, "UNAVAILABLE: no sealed Phase 5 runs in the local runtime")
    from src.regimes.service import Pipeline

    return Pipeline(runtime, tenant_id=tenant)


def _latest(pipe, asset):
    cutoffs = [
        r["contract"]["as_of"]
        for r in pipe.registry.list_runs(pipe.tenant_id)
        if (r.get("contract") or {}).get("asset") == asset
        and r["contract"]["plugin"].endswith(".volatility")
    ]
    if not cutoffs:
        raise HTTPException(404, "UNAVAILABLE: no sealed runs for this asset")
    return max(cutoffs)


def _snapshot(asset, as_of):
    pipe = _pipeline(asset)
    as_of = as_of or _latest(pipe, asset)
    try:
        return pipe.snapshot(asset, as_of)
    except LookupError as error:
        raise HTTPException(404, "UNAVAILABLE: " + str(error)) from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


def _envelope(kind, snapshot, payload):
    return {
        "schema_version": SCHEMA,
        "kind": kind,
        "asset": snapshot["asset"] if snapshot else None,
        "market": snapshot["market"] if snapshot else None,
        "requested_as_of": snapshot["requested_as_of"] if snapshot else None,
        "state_at": snapshot["state_at"] if snapshot else None,
        "input_hash": snapshot["input_hash"] if snapshot else None,
        "run_ids": snapshot["run_ids"] if snapshot else None,
        "evidence_scope": snapshot["evidence_scope"] if snapshot else None,
        "evidence_quality": snapshot["evidence_quality"] if snapshot else None,
        "calendar": snapshot["calendar"] if snapshot else None,
        "module_statuses": snapshot["module_statuses"] if snapshot else None,
        "source_lineage": "See /regimes/lineage",
        "claims": dict(CLAIMS),
        "badge": "LOCAL MODEL RUN",
        "payload": payload,
    }


@router.get("/assets")
def assets(request: Request):
    _gate(request)
    settings = profile()
    rows = []
    for asset, spec in {**settings["markets"], **settings["local_assets"]}.items():
        runtime, _ = _runtime(asset)
        rows.append(
            {
                "asset": asset,
                "label": spec["label"],
                "tier": spec["tier"],
                "badges": spec["badges"],
                "observation_unit": spec["observation_unit"],
                "local_runtime": (Path(runtime) / "runs.sqlite").exists(),
            }
        )
    return {"schema_version": SCHEMA, "assets": rows, "claims": dict(CLAIMS)}


@router.get("/snapshot")
def snapshot(request: Request, asset: str = Query(...), as_of: str | None = None):
    _gate(request)
    from src.regimes.publication import project_snapshot

    snap = _snapshot(asset, as_of)
    return _envelope("snapshot", snap, project_snapshot(snap))


@router.get("/timeline")
def timeline(request: Request, asset: str = Query(...), as_of: str | None = None):
    _gate(request)
    from src.regimes.publication import project_timeline

    snap = _snapshot(asset, as_of)
    return _envelope("timeline", snap, project_timeline(snap))


@router.get("/factors")
def factors(request: Request, asset: str = Query(...), as_of: str | None = None):
    _gate(request)
    from src.regimes.publication import project_factors

    snap = _snapshot(asset, as_of)
    return _envelope("factors", snap, project_factors(snap))


@router.get("/lineage")
def lineage(request: Request, asset: str = Query(...), as_of: str | None = None):
    _gate(request)
    from src.regimes.publication import project_lineage

    snap = _snapshot(asset, as_of)
    return _envelope("lineage", snap, project_lineage(snap))


@router.get("/seasonality")
def seasonality(request: Request, asset: str = Query(...), as_of: str | None = None):
    _gate(request)
    snap = _snapshot(asset, as_of)
    run = snap["runs"].get("seasonality")
    payload = (
        {"status": run["status"], "cells": run["paths"].get("cells"), "profile": run["paths"].get("profile"), "diagnostics": run["diagnostics"]}
        if run and run["status"] != "UNAVAILABLE"
        else snap["module_statuses"]["seasonality"]
    )
    return _envelope("seasonality", snap, payload)


@router.get("/events")
def events(request: Request, asset: str = Query(...)):
    _gate(request)
    market(asset)
    return _envelope(
        "events",
        None,
        module_status(
            "UNAVAILABLE",
            "EVENT PRESSURE — UNAVAILABLE: no admitted event stream",
            unblock="An admitted event stream with genuine observation/availability clocks and a licence",
        ),
    )


@router.get("/compare")
def compare(
    request: Request,
    asset: str | None = None,
    left: str | None = None,
    right: str | None = None,
    assets: str | None = None,
):
    _gate(request)
    from src.regimes.publication import project_snapshot

    if assets:
        names = [a for a in assets.split(",") if a]
        if len(names) != 2:
            raise HTTPException(422, "Compare exactly two markets")
        pair = [_snapshot(name, None) for name in names]
    elif asset and left and right:
        pair = [_snapshot(asset, left), _snapshot(asset, right)]
    else:
        raise HTTPException(422, "Use ?assets=A,B or ?asset=X&left=T1&right=T2")
    return {
        "schema_version": SCHEMA,
        "kind": "compare",
        "claims": dict(CLAIMS),
        "semantics": "Each side keeps its own requested_as_of, state_at and evidence; nothing is aligned or filled",
        "sides": [_envelope("snapshot", s, project_snapshot(s)) for s in pair],
    }


@router.get("/matrix")
def matrix(request: Request, local: bool = False):
    _gate(request)
    from src.regimes import matrix as module

    settings = profile()
    names = list(settings["markets"]) + (list(settings["local_assets"]) if local else [])
    snapshots = []
    for name in names:
        try:
            snapshots.append(_snapshot(name, None))
        except HTTPException as error:
            if error.status_code != 404:
                raise
    if not snapshots:
        raise HTTPException(404, "UNAVAILABLE: no sealed snapshots")
    return {"schema_version": SCHEMA, "kind": "matrix", "claims": dict(CLAIMS), "payload": module.build(snapshots)}
