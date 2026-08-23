"""Versioned envelopes for values displayed by FinSight."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import pandas as pd

from src.data.as_of import AsOfContext


class EpistemicState(str, Enum):
    OBSERVED = "OBSERVED"
    DERIVED = "DERIVED"
    MODELLED = "MODELLED"
    SIMULATED = "SIMULATED"
    STALE = "STALE"
    UNAVAILABLE = "UNAVAILABLE"


def canonical_hash(value: Any) -> str:
    """Hash JSON-compatible content with stable key and scalar ordering."""

    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def dataframe_hash(frame: pd.DataFrame, columns: list[str] | None = None) -> str:
    selected = frame.loc[:, columns] if columns is not None else frame
    records = selected.copy()
    for column in records.columns:
        if pd.api.types.is_datetime64_any_dtype(records[column]):
            records[column] = pd.to_datetime(records[column], utc=True).map(
                lambda value: value.isoformat()
            )
    records = records.astype(object).where(pd.notna(records), None)
    return canonical_hash(records.to_dict(orient="records"))


def build_computation_contract(
    *,
    calculation: str,
    calculation_version: str,
    as_of: AsOfContext,
    inputs: Any,
    data_version: str,
    state: EpistemicState,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Build a content-addressed ``data -> calculation -> result`` contract."""

    generated = generated_at or datetime.now(timezone.utc)
    input_hash = canonical_hash(inputs)
    run_id = canonical_hash(
        {
            "calculation": calculation,
            "calculation_version": calculation_version,
            "as_of": as_of.isoformat,
            "data_version": data_version,
            "input_hash": input_hash,
        }
    )
    return {
        "run_id": run_id,
        "state": state.value,
        "as_of": as_of.isoformat,
        "generated_at": generated.astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "data_version": data_version,
        "calculation": calculation,
        "calculation_version": calculation_version,
        "input_hash": input_hash,
    }
