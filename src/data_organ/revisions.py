"""Captured vintage predecessors. Capture-only data cannot invent revisions."""

from collections import defaultdict
from itertools import pairwise

from finsight.plugins.contracts import utc


def predecessor(rows, observed_at, as_of):
    cutoff = utc(as_of)
    eligible = [
        r
        for r in rows
        if r["observed_at"] == observed_at and utc(r["available_at"]) <= cutoff
    ]
    return max(eligible, key=lambda r: utc(r["available_at"]), default=None)


def summarize(rows, quality):
    if quality not in {"PUBLICATION_TIMESTAMP", "CONSERVATIVE_VINTAGE_DAY"}:
        return {
            "status": "UNAVAILABLE",
            "reason": "No evidenced historical vintages; capture-only updates are not release revisions",
            "periods": 0,
            "revised_periods": 0,
            "transitions": 0,
            "yearly": [],
        }
    groups = defaultdict(list)
    for row in rows:
        groups[(row["asset"], row["field"], row["observed_at"])].append(row)
    years = defaultdict(
        lambda: {
            "periods": 0,
            "revised_periods": 0,
            "transitions": 0,
            "absolute_revision_sum": 0.0,
        }
    )
    transitions = 0
    revised = 0
    for (_, _, observed), values in groups.items():
        ordered = sorted(values, key=lambda r: utc(r["available_at"]))
        changes = [
            b["value"] - a["value"]
            for a, b in pairwise(ordered)
            if a["value"] != b["value"]
        ]
        year = years[observed[:4]]
        year["periods"] += 1
        year["revised_periods"] += bool(changes)
        year["transitions"] += len(changes)
        year["absolute_revision_sum"] += sum(map(abs, changes))
        transitions += len(changes)
        revised += bool(changes)
    return {
        "status": "AVAILABLE" if groups else "UNAVAILABLE",
        "reason": None if groups else "No captured vintages",
        "periods": len(groups),
        "revised_periods": revised,
        "transitions": transitions,
        "yearly": [{"year": y, **v} for y, v in sorted(years.items())],
        "semantics": "Yearly aggregates of witnessed vintage intervals; no raw vintage matrix",
    }
