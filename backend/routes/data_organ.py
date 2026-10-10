"""Authenticated local, tenant-scoped diagnostic GETs; never fetch upstream."""

import re

from fastapi import APIRouter, HTTPException, Request

from src import config
from src.data_organ.catalog import catalog, costs_schedule
from src.data_organ.costs import calculate
from src.data_organ.lineage import inspect_lineage, inspect_lineages
from src.data_organ.publication import envelope
from src.data_organ.registry import Registry
from src.data_organ.revisions import summarize
from src.data_organ.service import Service
from src.truth.contracts import canonical_hash

router = APIRouter(prefix="/data", tags=["data-organ"])


def service(request):
    if config.APP_ENV == "production":
        raise HTTPException(
            503,
            "Data Organ runtime is local only; public diagnostics use checked Replay",
        )
    org = getattr(request.state, "organization_id", None)
    if type(org) is not int or org < 1 or not getattr(request.state, "user_id", None):
        raise HTTPException(401, "Authenticated organization required")
    path = config.EXPORTS_DIR / "replay-source/data-organ" / str(org)
    return Service(Registry(path / "registry.duckdb"), path / "captures"), "org-" + str(
        org
    )


@router.get("/lineage/{signal_id}")
def signal_lineage(request: Request, signal_id: str):
    if not re.fullmatch(r"[a-f0-9]{64}", signal_id):
        raise HTTPException(422, "Content-addressed signal id required")
    svc, tenant_id = service(request)
    try:
        return inspect_lineage(
            svc.registry, tenant_id, signal_id, raw_directory=svc.raw_directory
        )
    except (ValueError, FileNotFoundError) as error:
        raise HTTPException(422, str(error)) from error


@router.get("/{view}")
def diagnostic_view(request: Request, view: str):
    if view not in {
        "health",
        "coverage",
        "revisions",
        "lineage",
        "issues",
        "disagreement",
        "costs",
    }:
        raise HTTPException(404, "Unknown Data Organ view")
    svc, tenant_id = service(request)
    try:
        entries = svc.registry.entries(tenant_id)
        latest = {
            e["payload"]["source"]: e for e in entries if e["kind"] == "SOURCE_VERSION"
        }
        completed = {
            e["payload"]["admission_id"]
            for e in entries
            if e["kind"] in {"ATTEMPT_COMPLETED", "RECOVERY_COMPLETED"}
        }
        admissions = {}
        versions = {
            e["identity"]: e["payload"]
            for e in entries
            if e["kind"] == "SOURCE_VERSION"
        }
        for e in entries:
            if e["kind"] == "ADMISSION" and e["identity"] in completed:
                cap = versions[e["payload"]["source_version_id"]]
                key = (cap["source"], cap["source_url"])
                if (
                    key not in admissions
                    or cap["captured_at"] >= admissions[key][0]["captured_at"]
                ):
                    admissions[key] = (cap, e["payload"]["observations"])
        counts = {}
        for (source, _), (_, rows) in admissions.items():
            counts[source] = counts.get(source, 0) + len(rows)
        if view == "health":
            from src.data_organ.publication import HEALTH

            payload = {
                "items": [
                    {k: v for k, v in e["payload"].items() if k in HEALTH}
                    for e in entries
                    if e["kind"] == "DIAGNOSTIC"
                ]
            }
        elif view == "coverage":
            payload = {
                "items": [
                    {
                        **p,
                        "status": "ADMITTED"
                        if p["source"] in counts
                        else "UNAVAILABLE",
                        "rows": counts.get(p["source"], 0),
                        "reason": None
                        if p["source"] in counts
                        else "No local tenant admission",
                        "licence": latest[p["source"]]["payload"]["licence"]
                        if p["source"] in latest
                        else {"status": "UNVERIFIED", "permitted_uses": []},
                    }
                    for p in catalog()["profiles"]
                ]
            }
        elif view == "revisions":
            rows = [
                r
                for (source, _), (_, observations) in admissions.items()
                if source == "alfred:UNRATE"
                for r in observations
            ]
            payload = {
                "source": "alfred:UNRATE",
                "summary": summarize(rows, "CONSERVATIVE_VINTAGE_DAY"),
            }
        elif view == "lineage":
            payload = {
                "items": inspect_lineages(
                    svc.registry,
                    tenant_id,
                    [e["identity"] for e in entries if e["kind"] == "SIGNAL_MAPPING"][
                        :10
                    ],
                )
            }
        elif view == "issues":
            payload = {
                "items": [
                    {
                        "id": e["hash"],
                        "source": e["payload"]["source"],
                        "severity": "HIGH",
                        "kind": "SOURCE_ATTEMPT_FAILED",
                        "status": "OPEN",
                        "reason": e["payload"]["reason"],
                        "first_seen_at": e["payload"]["at"],
                        "last_seen_at": e["payload"]["at"],
                        "occurrences": 1,
                        "evidence": [e["hash"]],
                    }
                    for e in entries
                    if e["kind"] == "ATTEMPT_FAILED"
                ]
            }
        elif view == "costs":
            schedule = costs_schedule()
            day = max(c["evidenced_through"] for c in schedule["components"])
            payload = {
                "example": calculate(
                    schedule,
                    trade_date=day,
                    notional="100000",
                    side="BUY",
                    settlement="DELIVERY",
                ),
                "label": "Illustrative statutory schedule; supply broker-specific evidence locally",
            }
        else:
            payload = {
                "sources": [],
                "summary": {
                    "status": "UNAVAILABLE",
                    "pairs": 0,
                    "meaning": "No compatible local comparison admitted; no provider splice",
                },
            }
        from src.data_organ.service import now

        result = envelope(
            view,
            payload,
            as_of=now(),
            sources=list(latest),
            input_hash=canonical_hash(entries),
        )
        result["scope"] = "LOCAL_ONLY"
        return result
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(422, str(error)) from error
