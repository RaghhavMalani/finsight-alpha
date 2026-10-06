from __future__ import annotations

import json
import pandas as pd

from src.data.as_of import AsOfContext
from src.dynamics.market_regime_inputs import digest
from src.regime_intelligence.contracts import ASSETS, visible_payload
from src.regime_intelligence.service import load_dataset, evidence_disclosure


def pit_prices(ticker: str, as_of: str, source: str, *, dataset=None):
    if ticker not in ASSETS or source != "real":
        raise ValueError("Observatory requires installed real SPY, QQQ or IWM evidence")
    context = AsOfContext.bind(as_of)
    dataset = dataset or load_dataset(ticker)
    if dataset.asset != ticker:
        raise ValueError("PIT asset identity mismatch")
    payload = visible_payload(dataset, context.isoformat)
    rows = sorted((r for r in payload["observations"] if r["stream"] == "daily"),
                  key=lambda r: r["observed_at"])
    if len(rows) < 300:
        raise ValueError("Need at least 300 admitted daily bars")
    if any(r["source"] != "ALPACA_IEX" for r in rows):
        raise ValueError("Observatory activation requires attributed ALPACA_IEX daily evidence")
    records = [{"Date": r["observed_at"], "available_at": r["available_at"],
                **{name.capitalize(): r["values"][name]
                   for name in ("open", "high", "low", "close", "volume")}}
               for r in rows]
    frame = pd.DataFrame(records)
    frame["Date"] = pd.to_datetime(frame["Date"], utc=True)
    frame["available_at"] = pd.to_datetime(frame["available_at"], utc=True)
    disclosure = evidence_disclosure({"observations": rows})
    provenance = {
        "input_hash": digest(rows), "as_of": context.isoformat,
        "latest_observation": rows[-1]["observed_at"],
        "latest_availability": rows[-1]["available_at"],
        "source": sorted({r["source"] for r in rows}),
        "evidence_quality": sorted({r["quality"] for r in rows}),
        "evidence_mode": disclosure["mode"], "coverage": "IEX_ONLY",
        "disclosure": disclosure["disclosure"], "observations": len(rows),
        "price_basis": dataset.price_basis,
        "raw_snapshot_ids": sorted({value for r in rows
            if (value := json.loads(r["publication_evidence"]).get("snapshot_id"))}),
    }
    return frame, provenance
