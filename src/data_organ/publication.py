"""Positive whitelist: metadata/counts only; no reconstructible price/vintage series."""

import json
import math
import re
from copy import deepcopy
from hashlib import sha256
from pathlib import Path

from src.data.license_policy import derived_publication_license
from src.replay.publication import canonical_bytes, first_party_license

KINDS = {
    "health",
    "revisions",
    "disagreement",
    "coverage",
    "lineage",
    "issues",
    "costs",
}
HEALTH = {
    "diagnostic_id",
    "source",
    "status",
    "window_start",
    "window_end",
    "rows",
    "library_start",
    "duplicates",
    "quarantined",
    "non_monotonic",
    "zero_observations",
    "robust_outliers",
    "missing_sessions",
    "calendar_status",
    "calendar_reason",
    "cleaning_stage",
    "clock_quality",
    "finding",
    "observation_age_seconds",
    "capture_age_seconds",
    "age_reference",
    "publication_lag_status",
    "publication_lag_median_seconds",
    "publication_lag_max_seconds",
    "adjustment_evidence_status",
    "ohlcv_status",
    "freshness_status",
}
PUBLIC_NUMERICAL = {
    "ken-french:daily-factors",
    "iima:daily-factors",
    "alfred:UNRATE",
    "bls:LNS14000000",
}


def record(value, allowed):
    if not isinstance(value, dict) or set(value) - set(allowed):
        raise ValueError("Unreviewed public diagnostic field")
    return value


def count(value):
    return type(value) is int and value >= 0


def validate_public(kind, payload):
    """Every nested record has an explicit schema; negative raw-field checks are additional."""
    if kind == "health":
        for item in record(payload, {"items"})["items"]:
            record(item, HEALTH)
            grant(item["source"])
            if any(
                not count(item[k])
                for k in (
                    "rows",
                    "quarantined",
                    "duplicates",
                    "non_monotonic",
                    "zero_observations",
                    "robust_outliers",
                )
            ):
                raise ValueError("Invalid health count")
            if (
                item["calendar_status"] == "UNAVAILABLE"
                and item["missing_sessions"] is not None
            ):
                raise ValueError("Unsupported calendar cannot claim coverage")
            if item["clock_quality"] == "CAPTURE_ONLY" and (
                item.get("publication_lag_status", "UNAVAILABLE") != "UNAVAILABLE"
                or item.get("publication_lag_median_seconds") is not None
                or item.get("publication_lag_max_seconds") is not None
            ):
                raise ValueError("Capture-only history cannot claim publication lags")
    elif kind == "revisions":
        record(payload, {"source", "summary"})
        if payload["source"] != "alfred:UNRATE":
            raise PermissionError("Only aggregated UNRATE revision evidence is public")
        summary = record(
            payload["summary"],
            {
                "status",
                "reason",
                "periods",
                "revised_periods",
                "transitions",
                "semantics",
                "yearly",
            },
        )
        for row in summary["yearly"]:
            record(
                row,
                {
                    "year",
                    "periods",
                    "revised_periods",
                    "transitions",
                    "absolute_revision_sum",
                },
            )
            if (
                not count(row["periods"])
                or row["periods"] < 6
                or not isinstance(row["year"], str)
                or len(row["year"]) != 4
            ):
                raise ValueError(
                    "Revision publication must be aggregated across periods"
                )
            if (
                not count(row["revised_periods"])
                or row["revised_periods"] > row["periods"]
                or not count(row["transitions"])
                or type(row["absolute_revision_sum"]) not in (int, float)
                or not math.isfinite(row["absolute_revision_sum"])
                or row["absolute_revision_sum"] < 0
            ):
                raise ValueError("Invalid revision aggregate")
    elif kind == "disagreement":
        record(payload, {"sources", "summary"})
        record(
            payload["summary"],
            {
                "status",
                "pairs",
                "different",
                "max_absolute_delta",
                "meaning",
                "reasons",
                "comparison_cutoff",
                "information_basis",
            },
        )
        if payload["summary"].get("status") == "AVAILABLE" and (
            set(payload["sources"]) != {"alfred:UNRATE", "bls:LNS14000000"}
            or payload["summary"]["pairs"] < 6
        ):
            raise ValueError(
                "Public disagreement requires aggregate macro mirror evidence"
            )
        summary = payload["summary"]
        if not count(summary["pairs"]) or (
            summary["status"] == "AVAILABLE"
            and (
                not count(summary["different"])
                or summary["different"] > summary["pairs"]
                or type(summary["max_absolute_delta"]) not in (int, float)
                or not math.isfinite(summary["max_absolute_delta"])
                or summary["max_absolute_delta"] < 0
            )
        ):
            raise ValueError("Invalid disagreement aggregate")
    elif kind == "coverage":
        for item in record(payload, {"items"})["items"]:
            record(
                item,
                {
                    "source",
                    "country",
                    "label",
                    "fields",
                    "cadence",
                    "clock_quality",
                    "calendar",
                    "scope",
                    "source_url",
                    "status",
                    "rows",
                    "reason",
                    "licence",
                },
            )
            record(
                item["licence"],
                {
                    "status",
                    "permitted_uses",
                    "dataset_key",
                    "valid_through",
                    "attribution",
                    "source_urls",
                    "terms_url",
                    "basis",
                },
            )
            if not count(item["rows"]) or (
                item["source"] not in PUBLIC_NUMERICAL and item["rows"] != 0
            ):
                raise ValueError("Restricted public coverage must stay metadata only")
            if item["source"] not in PUBLIC_NUMERICAL and (
                item["licence"]["status"] != "UNVERIFIED"
                or item["licence"]["permitted_uses"]
            ):
                raise ValueError("Restricted publication permission cannot be inferred")
    elif kind == "lineage":
        for item in record(payload, {"items"})["items"]:
            record(
                item,
                {
                    "status",
                    "signal_id",
                    "signal_sha256",
                    "admission_id",
                    "admission_seal",
                    "source_version_id",
                    "capture_sha256",
                    "schema_hash",
                    "licence_resolution_hash",
                    "source",
                    "source_bytes",
                },
            )
            source = record(
                item["source"],
                {
                    "source",
                    "source_url",
                    "source_version_id",
                    "capture_sha256",
                    "captured_at",
                    "clock_quality",
                    "schema_hash",
                    "licence",
                    "calendar",
                    "field_definition",
                    "unit",
                    "feed_scope",
                    "price_basis",
                    "adapter_version",
                    "adapter_metadata_hash",
                },
            )
            grant(source["source"])
            if (
                item["status"] != "VERIFIED"
                or item["source_bytes"] != "LOCAL_ONLY"
                or any(
                    not isinstance(item[k], str)
                    or not re.fullmatch(r"[a-f0-9]{64}", item[k])
                    for k in (
                        "signal_id",
                        "signal_sha256",
                        "admission_id",
                        "admission_seal",
                        "source_version_id",
                        "capture_sha256",
                        "schema_hash",
                        "licence_resolution_hash",
                    )
                )
                or any(
                    item[k] != source[k]
                    for k in ("source_version_id", "capture_sha256", "schema_hash")
                )
            ):
                raise ValueError("Invalid public lineage binding")
            record(
                source["licence"],
                {
                    "status",
                    "permitted_uses",
                    "dataset_key",
                    "valid_through",
                    "attribution",
                    "source_urls",
                    "terms_url",
                    "basis",
                },
            )
            record(
                source["calendar"],
                {
                    "mic",
                    "status",
                    "reason",
                    "version",
                    "source_url",
                    "source_sha256",
                    "start",
                    "end",
                    "sessions_hash",
                    "meaning",
                },
            )
    elif kind == "issues":
        for item in record(payload, {"items"})["items"]:
            record(
                item,
                {
                    "id",
                    "source",
                    "severity",
                    "kind",
                    "status",
                    "reason",
                    "first_seen_at",
                    "last_seen_at",
                    "occurrences",
                    "evidence",
                },
            )
    elif kind == "costs":
        record(payload, {"label", "example"})
        example = record(
            payload["example"],
            {
                "schema_version",
                "identity",
                "trade_date",
                "notional",
                "side",
                "settlement",
                "currency",
                "components",
                "statutory_subtotal",
                "statutory_status",
                "statutory_missing",
                "all_in_estimated_trading_cost",
                "all_in_status",
                "all_in_missing",
                "rounding",
                "scope",
            },
        )
        if (
            example["notional"] != "100000"
            or example["side"] != "BUY"
            or example["settlement"] != "DELIVERY"
        ):
            raise ValueError(
                "Public cost evidence is only the fixed illustrative example"
            )
        if (
            example["all_in_status"] != "AVAILABLE"
            and example["all_in_estimated_trading_cost"] is not None
        ):
            raise ValueError("Partial costs cannot publish an all-in total")
        for component in example["components"]:
            record(
                component,
                {
                    "name",
                    "status",
                    "amount",
                    "reason",
                    "rate",
                    "effective_from",
                    "evidenced_through",
                    "evidence",
                },
            )
            if "evidence" in component:
                record(
                    component["evidence"],
                    {
                        "source_url",
                        "source_sha256",
                        "captured_at",
                        "publication_date",
                        "clock_quality",
                        "representation",
                    },
                )
    else:
        raise ValueError("Unknown publication kind")
    canonical_bytes(payload)
    return payload


def grant(source):
    resolved = derived_publication_license(source, None)
    if source not in PUBLIC_NUMERICAL or "publish_derived" not in resolved.get(
        "permitted_uses", []
    ):
        raise PermissionError("Public numerical source unavailable: " + source)
    return resolved


def health_projection(rows):
    result = []
    for row in rows:
        grant(row["source"])
        result.append({k: deepcopy(v) for k, v in row.items() if k in HEALTH})
    return result


def revision_projection(rows, source):
    grant(source)
    # This v0.1 projection permits macro annual aggregates only, never price deltas.
    if source != "alfred:UNRATE":
        return {
            "status": "UNAVAILABLE",
            "reason": "No public macro revision permission/profile for this source",
            "yearly": [],
        }
    keys = {
        "status",
        "reason",
        "periods",
        "revised_periods",
        "transitions",
        "semantics",
    }
    result = {k: deepcopy(v) for k, v in rows.items() if k in keys}
    result["yearly"] = [
        {
            k: deepcopy(v)
            for k, v in r.items()
            if k
            in {
                "year",
                "periods",
                "revised_periods",
                "transitions",
                "absolute_revision_sum",
            }
        }
        for r in rows.get("yearly", [])
        if r["periods"] >= 6
    ]
    return result


def disagreement_projection(value, sources):
    for source in sources:
        grant(source)
    if set(sources) != {"alfred:UNRATE", "bls:LNS14000000"}:
        return {
            "status": "UNAVAILABLE",
            "pairs": 0,
            "meaning": "Public price disagreement is unavailable; local-only",
        }
    return {
        k: deepcopy(v)
        for k, v in value.items()
        if k
        in {
            "status",
            "pairs",
            "different",
            "max_absolute_delta",
            "meaning",
            "reasons",
            "comparison_cutoff",
            "information_basis",
        }
    }


def envelope(kind, payload, *, as_of, sources, input_hash):
    if kind not in KINDS:
        raise ValueError("Unreviewed Data Organ projection")
    return {
        "schema_version": "data-organ-replay/1",
        "kind": kind,
        "scope": "REAL_DERIVED_DIAGNOSTICS",
        "as_of": as_of,
        "sources": sources,
        "input_hash": input_hash,
        "claims": {
            "market_claim_eligible": False,
            "causal_claim_eligible": False,
            "validated_alpha": False,
            "inference_certified": False,
        },
        "payload": payload,
    }


def publish(public, values, *, as_of, input_hash, sources):
    from finsight.plugins.contracts import utc
    from src.replay.publication import ReplayPublisher

    public = Path(public)
    publisher = ReplayPublisher(public, as_of)
    pointer = public / "replay-manifest.json"
    if pointer.exists():
        publisher.manifest = json.loads(pointer.read_bytes())
        if utc(as_of) > utc(publisher.manifest["as_of"]):
            publisher.manifest["as_of"] = as_of
    permissions = [grant(s) for s in sources]
    licence = {
        **first_party_license("project:data-organ-diagnostics"),
        "attribution": "; ".join(g["attribution"] for g in permissions),
        "source_urls": sorted(
            {u for g in permissions for u in g.get("source_urls", [])}
        ),
        "basis": "First-party aggregated diagnostic metadata, respecting each numerical source grant. Restricted sources expose coverage limitations only.",
    }
    entries = {}
    for kind, payload in values.items():
        validate_public(kind, payload)
        value = envelope(
            kind, payload, as_of=as_of, sources=sources, input_hash=input_hash
        )
        raw = canonical_bytes(value)
        identity = "data-organ:" + kind + ":" + sha256(raw).hexdigest()
        if identity not in publisher.manifest["artifacts"]:
            publisher.publish(
                identity,
                value,
                kind="data-organ-" + kind,
                sources=sources or ["project:data-organ-diagnostics"],
                licence=licence,
                observed_at=as_of,
                available_at=as_of,
                input_hash=input_hash,
                scope="REAL_DERIVED_DIAGNOSTICS",
                as_of=as_of,
            )
        entry = publisher.manifest["artifacts"][identity]
        if (public / entry["url"].lstrip("/")).read_bytes() != raw:
            raise ValueError("Immutable Data Organ publication substitution")
        publisher.manifest["routes"]["/data/" + kind] = identity
        entries[kind] = {"artifact_id": identity, **entry}
    # No pruning. Old entries and every old public byte remain addressable.
    staged = pointer.with_suffix(".json.tmp")
    staged.write_bytes(canonical_bytes(publisher.manifest))
    staged.replace(pointer)
    return entries
