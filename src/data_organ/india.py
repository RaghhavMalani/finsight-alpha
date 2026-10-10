"""Operator-supplied RBI/MOSPI release evidence; permissions remain unresolved."""

import json

from .adapters import capture


def release_import(raw, *, source, source_url, captured_at, calendar=None):
    allowed = {
        "rbi:policy-repo": ("repo_rate", "https://www.rbi.org.in/"),
        "mospi:cpi-combined": ("cpi_combined", "https://www.mospi.gov.in/"),
    }
    if source not in allowed or not source_url.startswith(allowed[source][1]):
        raise ValueError("Bounded official India macro release required")
    payload = json.loads(raw)
    if payload.get("schema_version") != "india-macro-release/1" or not isinstance(
        payload.get("observations"), list
    ):
        raise ValueError("Unknown India macro release schema")
    rows = []
    for row in payload["observations"]:
        if (
            not row.get("publication_evidence")
            or not row.get("available_at")
            or not row.get("revision")
        ):
            raise ValueError(
                "Actual publication timestamp, citation and vintage identity required"
            )
        rows.append(
            {
                "asset": source,
                "field": allowed[source][0],
                "value": row["value"],
                "observed_at": row["observed_at"],
                "available_at": row["available_at"],
                "revision": row["revision"],
            }
        )
    licence = {
        "status": "UNVERIFIED",
        "permitted_uses": [],
        "dataset_key": source,
        "reason": "No dataset-specific CPI/repo publication grant verified",
    }
    return (
        capture(
            source,
            source_url,
            raw,
            captured_at,
            schema={allowed[source][0]: "float"},
            quality="PUBLICATION_TIMESTAMP",
            calendar=calendar,
            unit="percent" if source.startswith("rbi") else "index",
            definition=allowed[source][0],
            feed="OFFICIAL_MACRO",
            licence=licence,
        ),
        raw,
        rows,
    )
