"""Sourced Global Eye knowledge graph: read the graph and propagate an event to exposed securities.

Read-only, behind the same session gate as every other API route. Every node and edge is a cited
public fact, and propagation only uses relationships available at or before both the event time
and the requested as_of.
"""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.geo.graph import load_graph, propagate

router = APIRouter(prefix="/geo/graph", tags=["geo-graph"])


@lru_cache(maxsize=4)
def _graph(version: str):
    return load_graph(version)


class EventIn(BaseModel):
    kind: Literal["earthquake", "cyclone", "conflict", "disruption"]
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    time: str
    magnitude: float | None = Field(default=None, ge=0, le=10)
    as_of: str | None = None  # defaults to now; never later than now
    max_paths: int = Field(default=50, ge=1, le=500)


@router.get("")
def graph(version: str = "v1") -> dict:
    try:
        return _graph(version).to_dict()
    except FileNotFoundError:
        raise HTTPException(404, "Unknown graph version") from None


@router.post("/propagate")
def propagate_event(event: EventIn, version: str = "v1") -> dict:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    as_of = event.as_of or now
    try:
        if datetime.fromisoformat(as_of.replace("Z", "+00:00")) > datetime.now(timezone.utc):
            raise HTTPException(422, "as_of cannot be in the future")
        return propagate(_graph(version), event.model_dump(exclude={"as_of", "max_paths"}),
                         as_of=as_of, max_paths=event.max_paths)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    except FileNotFoundError:
        raise HTTPException(404, "Unknown graph version") from None
