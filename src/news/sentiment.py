"""Lightweight financial sentiment scoring (lexicon-based, no dependencies).

A finance-tuned word list scores each headline in ``[-1, 1]`` from the balance
of positive vs negative terms. It's deterministic, instant, and offline - ideal
for a live terminal feed. (A heavier LLM/transformer scorer could be swapped in
behind the same interface later.)
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

POSITIVE = {
    "beat", "beats", "beating", "surge", "surges", "surged", "soar", "soars", "rally",
    "rallies", "gain", "gains", "gained", "jump", "jumps", "jumped", "upgrade", "upgraded",
    "outperform", "outperforms", "record", "records", "profit", "profits", "growth", "grow",
    "grows", "rise", "rises", "rising", "strong", "strength", "bullish", "boost", "boosts",
    "exceed", "exceeds", "exceeded", "top", "tops", "topped", "win", "wins", "expansion",
    "expand", "demand", "raises", "raised", "higher", "optimistic", "breakthrough", "approval",
    "approved", "partnership", "dividend", "buyback", "momentum", "rebound", "recovery", "upbeat",
}
NEGATIVE = {
    "miss", "misses", "missed", "plunge", "plunges", "plunged", "slump", "slumps", "fall",
    "falls", "fell", "drop", "drops", "dropped", "decline", "declines", "declined", "downgrade",
    "downgraded", "underperform", "loss", "losses", "weak", "weakness", "bearish", "cut", "cuts",
    "lawsuit", "probe", "investigation", "fraud", "recall", "warn", "warns", "warning", "layoff",
    "layoffs", "slowdown", "default", "bankruptcy", "lower", "concern", "concerns", "risk", "risks",
    "fears", "selloff", "crash", "halt", "halts", "ban", "fine", "fined", "delay", "delays",
    "scandal", "tumble", "tumbles", "sink", "sinks", "slash", "slashes", "woes", "struggle",
}

_WORD_RE = re.compile(r"[a-z']+")


def score_text(text: str) -> Dict[str, Any]:
    """Score a piece of text in [-1, 1] with a label."""
    words = _WORD_RE.findall((text or "").lower())
    pos = sum(1 for w in words if w in POSITIVE)
    neg = sum(1 for w in words if w in NEGATIVE)
    if pos + neg == 0:
        return {"score": 0.0, "label": "neutral", "pos": 0, "neg": 0}
    score = (pos - neg) / (pos + neg)
    label = "positive" if score > 0.15 else ("negative" if score < -0.15 else "neutral")
    return {"score": round(score, 3), "label": label, "pos": pos, "neg": neg}


def score_headlines(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Attach a sentiment score to each item and compute an aggregate."""
    scored: List[Dict[str, Any]] = []
    total = 0.0
    counts = {"positive": 0, "neutral": 0, "negative": 0}
    for it in items:
        s = score_text(f"{it.get('title','')} {it.get('summary','')}")
        scored.append({**it, **s})
        total += s["score"]
        counts[s["label"]] += 1

    overall = round(total / len(items), 3) if items else 0.0
    overall_label = "Bullish" if overall > 0.1 else ("Bearish" if overall < -0.1 else "Neutral")
    return {
        "items": scored,
        "overall_score": overall,
        "overall_label": overall_label,
        "counts": counts,
        "n": len(items),
    }
