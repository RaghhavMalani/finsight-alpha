"""Decimal, effective-dated NSE cash charges. Unknown components stay partial."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from src.truth.contracts import canonical_hash


def decimal(value):
    if isinstance(value, (float, bool)):
        raise TypeError("Supply exact decimal strings, not binary floats")
    result = Decimal(value)
    if not result.is_finite() or result < 0:
        raise ValueError("Cost inputs must be finite and nonnegative")
    return result


def calculate(schedule, *, trade_date, notional, side, settlement, inputs=None):
    day = date.fromisoformat(trade_date)
    if side not in {"BUY", "SELL"} or settlement not in {"DELIVERY", "NON_DELIVERY"}:
        raise ValueError(
            "Only NSE cash equity buy/sell delivery/non-delivery supported"
        )
    amount, supplied = decimal(notional), inputs or {}
    components, missing = [], []
    statutory = Decimal(0)
    for name in ("STT", "STAMP", "SEBI", "EXCHANGE", "IPFT", "GST"):
        candidates = [
            r
            for r in schedule["components"]
            if r["name"] == name
            and r["settlement"] in {settlement, "ANY"}
            and date.fromisoformat(r["effective_from"])
            <= day
            <= date.fromisoformat(r["evidenced_through"])
        ]
        if len(candidates) > 1:
            raise ValueError("Ambiguous overlapping fee evidence")
        record = candidates[0] if candidates else None
        if not record or not record.get("evidence", {}).get("source_sha256"):
            missing.append(name)
            components.append(
                {
                    "name": name,
                    "status": "UNAVAILABLE",
                    "amount": None,
                    "reason": "No effective-dated component evidence",
                }
            )
            continue
        if name == "GST":
            tax_base = supplied.get("gst_base")
            if (
                not tax_base
                or not tax_base.get("evidence_url")
                or not tax_base.get("source_sha256")
            ):
                missing.append("GST_BASE")
                components.append(
                    {
                        "name": name,
                        "status": "UNAVAILABLE",
                        "amount": None,
                        "reason": "18% service rate evidenced; exact invoice tax base not evidenced",
                        "evidence": record["evidence"],
                    }
                )
                continue
            base = decimal(tax_base["amount"])
        else:
            base = amount
        applicable = side in record["sides"]
        cost = base * decimal(record["rate"]) if applicable else Decimal(0)
        statutory += cost
        components.append(
            {
                "name": name,
                "status": "AVAILABLE",
                "amount": str(cost.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                "rate": record["rate"],
                "effective_from": record["effective_from"],
                "evidenced_through": record["evidenced_through"],
                "evidence": record["evidence"],
            }
        )
    private_missing = [
        name
        for name in ("brokerage", "spread", "slippage", "dp")
        if name not in supplied or not supplied[name].get("evidence")
    ]
    private_cost = sum(
        (
            decimal(supplied[name]["amount"])
            for name in ("brokerage", "spread", "slippage", "dp")
            if name not in private_missing
        ),
        Decimal(0),
    )
    return {
        "schema_version": "india-cost/1",
        "identity": canonical_hash(
            {
                "schedule": schedule,
                "trade_date": trade_date,
                "notional": str(amount),
                "side": side,
                "settlement": settlement,
                "inputs": supplied,
            }
        ),
        "trade_date": trade_date,
        "notional": str(amount),
        "side": side,
        "settlement": settlement,
        "currency": "INR",
        "components": components,
        "statutory_subtotal": str(
            statutory.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
        "statutory_status": "PARTIAL" if missing else "AVAILABLE",
        "statutory_missing": missing,
        "all_in_estimated_trading_cost": None
        if missing or private_missing
        else str(
            (statutory + private_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
        "all_in_status": "PARTIAL" if missing or private_missing else "AVAILABLE",
        "all_in_missing": missing + private_missing,
        "rounding": "Decimal exact components; sum before HALF_UP to INR 0.01. Not contract-note equivalence; STT invoice allocation/rounding not reconstructed.",
        "scope": "NSE cash-equity only; statutory subtotal separate from all-in estimate",
    }
