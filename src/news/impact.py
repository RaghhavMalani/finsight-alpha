"""Evidence-labelled news impact analysis for the terminal.

The output is intentionally a scenario framework, not a price target.  It
separates provider relevance metadata from heuristic sentiment and only calls a
headline a likely driver when the source tags the requested ticker and the
event has enough company-specific materiality.
"""

from __future__ import annotations

from datetime import datetime, timezone
import math
import re
from typing import Any, Dict, Iterable, List

from src.news.sentiment import score_text

_EVENTS: list[dict[str, Any]] = [
    {
        "type": "EARNINGS / GUIDANCE",
        "terms": {
            "earnings",
            "revenue",
            "eps",
            "guidance",
            "outlook",
            "margin",
            "profit",
            "quarter",
        },
        "channel": "Estimate revisions",
        "kpi": "Revenue growth · EPS · operating margin",
        "horizon": "1D–3M",
        "materiality": 86,
    },
    {
        "type": "M&A / CAPITAL ALLOCATION",
        "terms": {
            "acquire",
            "acquisition",
            "merger",
            "takeover",
            "buyback",
            "dividend",
            "stake",
            "deal",
        },
        "channel": "Cash flows, control premium and dilution",
        "kpi": "FCF · leverage · share count · ROIC",
        "horizon": "1W–12M",
        "materiality": 82,
    },
    {
        "type": "REGULATION / LEGAL",
        "terms": {
            "regulator",
            "regulation",
            "antitrust",
            "lawsuit",
            "probe",
            "investigation",
            "ban",
            "fine",
            "approval",
        },
        "channel": "License to operate and compliance cost",
        "kpi": "Addressable market · opex · contingent liability",
        "horizon": "1W–24M",
        "materiality": 78,
    },
    {
        "type": "PRODUCT / CUSTOMER",
        "terms": {
            "launch",
            "product",
            "customer",
            "contract",
            "partnership",
            "order",
            "demand",
            "subscriber",
        },
        "channel": "Volume, pricing and adoption",
        "kpi": "Bookings · units · ARPU · market share",
        "horizon": "1W–12M",
        "materiality": 68,
    },
    {
        "type": "SUPPLY CHAIN",
        "terms": {
            "supply",
            "shortage",
            "shipment",
            "factory",
            "plant",
            "capacity",
            "inventory",
            "supplier",
        },
        "channel": "Availability, input cost and working capital",
        "kpi": "Gross margin · inventory days · delivery volume",
        "horizon": "1W–6M",
        "materiality": 64,
    },
    {
        "type": "ANALYST / POSITIONING",
        "terms": {
            "upgrade",
            "downgrade",
            "target",
            "analyst",
            "rating",
            "bullish",
            "bearish",
            "short interest",
        },
        "channel": "Expectations and positioning",
        "kpi": "Consensus EPS · valuation multiple · short interest",
        "horizon": "1D–1M",
        "materiality": 48,
    },
    {
        "type": "MACRO / MARKET",
        "terms": {
            "fed",
            "rates",
            "yield",
            "inflation",
            "tariff",
            "currency",
            "oil",
            "futures",
            "market",
        },
        "channel": "Discount rate and factor beta",
        "kpi": "WACC · FX translation · input cost · sector multiple",
        "horizon": "1D–6M",
        "materiality": 42,
    },
]

_DEFAULT_EVENT = {
    "type": "CORPORATE / MARKET UPDATE",
    "channel": "Expectations and information flow",
    "kpi": "Consensus estimates · valuation multiple",
    "horizon": "1D–3M",
    "materiality": 36,
}

_HIGH_IMPACT = {
    "bankruptcy",
    "default",
    "fraud",
    "recall",
    "halt",
    "ban",
    "acquisition",
    "merger",
    "guidance",
    "earnings",
    "approval",
    "investigation",
}


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9']+", (text or "").lower()))


def _finite(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        return number if math.isfinite(number) else default
    except (TypeError, ValueError):
        return default


def _event_for(text: str) -> dict[str, Any]:
    words = _tokens(text)
    best = None
    best_hits = 0
    for event in _EVENTS:
        hits = len(words.intersection(event["terms"]))
        if hits > best_hits:
            best = event
            best_hits = hits
    return dict(best or _DEFAULT_EVENT)


def _related(item: Dict[str, Any]) -> list[str]:
    raw = item.get("related_tickers") or item.get("relatedTickers") or []
    if not isinstance(raw, Iterable) or isinstance(raw, (str, bytes)):
        return []
    return list(dict.fromkeys(str(value).upper() for value in raw if value))


def _relevance(ticker: str, item: Dict[str, Any], text: str) -> tuple[str, float]:
    related = _related(item)
    base = ticker.split(".", 1)[0].upper()
    if ticker in related or base in related:
        return "PROVIDER-TAGGED", 0.96
    if re.search(rf"(?<![A-Z0-9]){re.escape(base)}(?![A-Z0-9])", text.upper()):
        return "DIRECT MENTION", 0.76
    if related:
        return "CO-MENTIONED", 0.48
    return "ASSOCIATION UNVERIFIED", 0.24


def _direction(score: float) -> tuple[str, str]:
    if score > 0.12:
        return "POSITIVE SENSITIVITY", "Upside skew"
    if score < -0.12:
        return "NEGATIVE SENSITIVITY", "Downside skew"
    return "TWO-SIDED", "No directional edge"


def _scenario_text(ticker: str, event: dict[str, Any], score: float) -> dict[str, str]:
    kpi = event["kpi"]
    if score > 0.12:
        base = f"Evidence is constructive if the update produces measurable improvement in {kpi}."
        upside = f"Upside: follow-through plus estimate upgrades makes the catalyst durable for {ticker}."
        downside = "Failure case: expectations rise faster than delivered fundamentals; the move mean-reverts."
    elif score < -0.12:
        base = f"Evidence is adverse if the update causes estimate cuts or deterioration in {kpi}."
        upside = "Recovery case: the issue proves temporary, contained, or already reflected in consensus."
        downside = f"Downside: second-order effects compound and force further de-rating in {ticker}."
    else:
        base = f"Direction is unresolved; confirmation must come from {kpi}."
        upside = "Upside: hard operating evidence resolves the ambiguity above current expectations."
        downside = "Downside: the narrative remains unconfirmed while positioning becomes crowded."
    return {"base": base, "upside": upside, "downside": downside}


def analyze_news_impact(ticker: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build a transparent catalyst-to-scenario graph from normalized news."""
    symbol = ticker.strip().upper()
    analyses: list[dict[str, Any]] = []

    for index, item in enumerate(items):
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        text = f"{title} {item.get('summary') or ''}"
        scored = score_text(text)
        score = _finite(item.get("score"), _finite(scored.get("score")))
        event = _event_for(text)
        relevance_label, relevance_confidence = _relevance(symbol, item, text)
        high_impact_hits = len(_tokens(text).intersection(_HIGH_IMPACT))
        materiality = min(99, int(event["materiality"] + min(12, high_impact_hits * 5)))
        evidence_confidence = min(
            0.98, relevance_confidence * (0.72 + min(materiality, 90) / 300)
        )
        causality = (
            "LIKELY DRIVER"
            if relevance_label == "PROVIDER-TAGGED"
            and materiality >= 60
            and abs(score) >= 0.15
            else (
                "RELEVANT CATALYST"
                if relevance_label in {"PROVIDER-TAGGED", "DIRECT MENTION"}
                else "CO-MENTIONED · NOT CAUSAL"
            )
        )
        sensitivity, market_path = _direction(score)
        related = _related(item)
        affected = []
        for related_symbol in list(dict.fromkeys([symbol, *related]))[:7]:
            affected.append(
                {
                    "ticker": related_symbol,
                    "role": (
                        "PRIMARY"
                        if related_symbol == symbol
                        else "SECOND-ORDER / CO-MENTIONED"
                    ),
                    "scenario_sensitivity": sensitivity,
                }
            )

        flow = [
            {"stage": "CATALYST", "title": event["type"], "detail": title},
            {"stage": "TRANSMISSION", "title": event["channel"], "detail": causality},
            {
                "stage": "KPI CHECK",
                "title": event["kpi"],
                "detail": f"Horizon {event['horizon']}",
            },
            {
                "stage": "MARKET PATH",
                "title": market_path,
                "detail": f"{sensitivity} · scenario, not forecast",
            },
        ]
        analyses.append(
            {
                "id": str(item.get("url") or f"{symbol}-{index}"),
                "headline": title,
                "publisher": item.get("publisher") or "—",
                "published": item.get("published") or "",
                "url": item.get("url") or "",
                "event_type": event["type"],
                "relevance_label": relevance_label,
                "causality_label": causality,
                "sentiment_score": round(score, 3),
                "sentiment_label": (
                    "BULLISH"
                    if score > 0.12
                    else "BEARISH" if score < -0.12 else "MIXED"
                ),
                "materiality": materiality,
                "confidence": round(evidence_confidence * 100),
                "horizon": event["horizon"],
                "flow": flow,
                "scenarios": _scenario_text(symbol, event, score),
                "affected_companies": affected,
            }
        )

    analyses.sort(
        key=lambda value: (value["confidence"] * value["materiality"]), reverse=True
    )
    weighted_numerator = 0.0
    weighted_denominator = 0.0
    verified = 0
    for analysis in analyses:
        weight = max(0.05, analysis["confidence"] / 100) * max(
            0.1, analysis["materiality"] / 100
        )
        weighted_numerator += analysis["sentiment_score"] * weight
        weighted_denominator += weight
        verified += int(analysis["relevance_label"] == "PROVIDER-TAGGED")
    aggregate_score = (
        weighted_numerator / weighted_denominator if weighted_denominator else 0.0
    )
    bullish_probability = round(max(5, min(95, 50 + aggregate_score * 42)))
    bearish_probability = round(max(5, min(95, 50 - aggregate_score * 42)))
    signal = (
        "BULLISH SKEW"
        if aggregate_score > 0.12
        else "BEARISH SKEW" if aggregate_score < -0.12 else "MIXED / WAIT"
    )
    coverage = verified / len(analyses) if analyses else 0.0
    confidence = (
        round(min(96, 24 + coverage * 48 + min(len(analyses), 8) * 3))
        if analyses
        else 0
    )

    return {
        "ticker": symbol,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "signal": {
            "label": signal,
            "score": round(aggregate_score, 3),
            "bullish_probability": bullish_probability,
            "bearish_probability": bearish_probability,
            "confidence": confidence,
        },
        "evidence": {
            "headlines": len(analyses),
            "provider_tagged": verified,
            "coverage_pct": round(coverage * 100),
        },
        "analyses": analyses,
        "methodology": "Provider ticker tags establish relevance; event rules map transmission and KPI exposure; finance-lexicon sentiment sets scenario direction. This is decision support, not a price forecast.",
    }
