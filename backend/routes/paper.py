"""Authenticated paper-book persistence.

Positions are scoped to the signed-in user and stored in the same configured
SQL database as authentication. The endpoint never creates fabricated default
positions: a new account starts with an empty paper book.
"""

from __future__ import annotations

import math
import os
import re
from typing import List

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, select

from src.auth.db import get_session
from src.auth.models import PaperPosition
from src.auth.security import verify_session

router = APIRouter(prefix="/paper", tags=["paper"])
_SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9.\-^=]{0,31}$")


class PositionInput(BaseModel):
    symbol: str
    qty: float
    entry: float

def _require_durable_storage() -> None:
    if not os.getenv("DATABASE_URL", "").strip():
        raise HTTPException(
            status_code=503,
            detail="Durable paper-book storage is not configured on this deployment.",
        )


class PaperBookInput(BaseModel):
    positions: List[PositionInput]


def _user_id(request: Request) -> int:
    user_id = verify_session(request.cookies.get("fs_session"))
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id


def _position_payload(position: PaperPosition) -> dict:
    return {
        "symbol": position.symbol,
        "qty": position.qty,
        "entry": position.entry,
        "updated_at": position.updated_at.isoformat() if position.updated_at else None,
    }


@router.get("/positions")
def get_positions(request: Request) -> dict:
    user_id = _user_id(request)
    _require_durable_storage()
    with get_session() as session:
        rows = session.scalars(
            select(PaperPosition)
            .where(PaperPosition.user_id == user_id)
            .order_by(PaperPosition.created_at, PaperPosition.id)
        ).all()
        return {"positions": [_position_payload(row) for row in rows]}


@router.put("/positions")
def replace_positions(payload: PaperBookInput, request: Request) -> dict:
    user_id = _user_id(request)
    _require_durable_storage()
    if len(payload.positions) > 100:
        raise HTTPException(status_code=422, detail="A paper book can contain at most 100 positions.")

    cleaned: list[tuple[str, float, float]] = []
    seen: set[str] = set()
    for position in payload.positions:
        symbol = position.symbol.strip().upper()
        qty = float(position.qty)
        entry = float(position.entry)
        if not _SYMBOL.fullmatch(symbol):
            raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol or '(empty)'}")
        if symbol in seen:
            raise HTTPException(status_code=422, detail=f"Duplicate symbol: {symbol}")
        if not math.isfinite(qty) or qty == 0:
            raise HTTPException(status_code=422, detail=f"Quantity for {symbol} must be finite and non-zero.")
        if not math.isfinite(entry) or entry <= 0:
            raise HTTPException(status_code=422, detail=f"Entry price for {symbol} must be positive.")
        seen.add(symbol)
        cleaned.append((symbol, qty, entry))

    with get_session() as session:
        session.execute(delete(PaperPosition).where(PaperPosition.user_id == user_id))
        rows = [
            PaperPosition(user_id=user_id, symbol=symbol, qty=qty, entry=entry)
            for symbol, qty, entry in cleaned
        ]
        session.add_all(rows)
        session.commit()
        for row in rows:
            session.refresh(row)
        return {"positions": [_position_payload(row) for row in rows]}
