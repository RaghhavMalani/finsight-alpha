"""Sourced Global Eye knowledge graph: read the graph and propagate an event to exposed securities.

Read-only, behind the same session gate as every other API route. Every node and edge is a cited
public fact, and both routes only return relationships available at or before the requested as_of.
"""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field, ValidationError

from src.geo.graph import load_graph, propagate
from src.geo.graph.graph import LATEST
from src.geo.graph.model import parse_instant

router = APIRouter(prefix="/geo/graph", tags=["geo-graph"])


@lru_cache(maxsize=4)  # seed versions are immutable files; a changed graph gets a new version
def _load(version: str):
    return load_graph(version)


def _graph(version: str):
    try:
        return _load(version)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, "Unknown graph version") from None


def _as_of(value: str | None) -> str:
    now = datetime.now(timezone.utc)
    if value is None:
        return now.isoformat().replace("+00:00", "Z")
    try:
        if parse_instant(value) > now:
            raise HTTPException(422, "as_of cannot be in the future")
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    return value


class EventIn(BaseModel):
    kind: Literal["earthquake", "cyclone", "conflict", "disruption"]
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    time: str
    magnitude: float | None = Field(default=None, ge=0, le=10, allow_inf_nan=False)
    as_of: str | None = None  # defaults to now; never later than now
    max_paths: int = Field(default=50, ge=1, le=500)


@router.get("")
def graph(version: str = LATEST, as_of: str | None = None) -> dict:
    return _graph(version).to_dict(_as_of(as_of))


@router.post("/propagate")
def propagate_event(payload: dict = Body(...), version: str = LATEST) -> dict:
    try:
        event = EventIn.model_validate(payload)
    except ValidationError as error:
        # Inputs are left out of the report: a NaN in the request must not break the error response.
        raise HTTPException(422, error.errors(include_input=False, include_url=False)) from None
    as_of = _as_of(event.as_of)
    try:
        return propagate(_graph(version), event.model_dump(exclude={"as_of", "max_paths"}),
                         as_of=as_of, max_paths=event.max_paths)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
