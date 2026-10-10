"""Read sealed admissions -> aggregated diagnostics. Never run a model/holdout."""

import argparse
import json
import subprocess
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finsight.plugins.contracts import utc
from scripts.collect_data_organ import RUNTIME, TENANT
from src.data_organ.catalog import catalog, costs_schedule
from src.data_organ.contracts import Capture, public_metadata
from src.data_organ.costs import calculate
from src.data_organ.diagnostics import disagreement
from src.data_organ.lineage import inspect_lineages
from src.data_organ.publication import (
    disagreement_projection,
    health_projection,
    publish,
    revision_projection,
)
from src.data_organ.registry import Registry
from src.data_organ.revisions import summarize
from src.truth.contracts import canonical_hash

DIRECTORY = ROOT / "data/exports/data_organ_v0_1"


def export(runtime=RUNTIME, public=ROOT / "frontend-v2/public", directory=DIRECTORY):
    registry = Registry(runtime / "registry.duckdb")
    entries = registry.entries(TENANT)
    versions = {
        e["identity"]: Capture(**e["payload"])
        for e in entries
        if e["kind"] == "SOURCE_VERSION"
    }
    completed = {
        e["payload"]["admission_id"]
        for e in entries
        if e["kind"] in {"ATTEMPT_COMPLETED", "RECOVERY_COMPLETED"}
    }
    admissions = [
        e for e in entries if e["kind"] == "ADMISSION" and e["identity"] in completed
    ]
    diagnostics = [e["payload"] for e in entries if e["kind"] == "DIAGNOSTIC"]
    actual_sources = sorted({c.source for c in versions.values()})
    # One current admission per source URL; older versions remain in the journal.
    by_url = {}
    for entry in admissions:
        cap = versions[entry["payload"]["source_version_id"]]
        key = (cap.source, cap.source_url)
        if key not in by_url or utc(cap.captured_at) >= utc(by_url[key][0].captured_at):
            by_url[key] = (cap, entry["payload"]["observations"])
    latest = {}
    for cap, rows in by_url.values():
        prior = latest.get(cap.source)
        latest[cap.source] = (cap, (prior[1] if prior else []) + rows)
    actual_sources = sorted(latest)
    current_version_ids = {cap.identity for cap, _ in by_url.values()}
    latest_health = {}
    for diagnostic in diagnostics:
        if diagnostic["contract"]["source_version"] in current_version_ids:
            latest_health[
                (diagnostic["source"], diagnostic["contract"]["source_version"])
            ] = diagnostic
    health = {"items": health_projection(list(latest_health.values()))}
    if "alfred:UNRATE" in latest:
        cap, rows = latest["alfred:UNRATE"]
        revisions = {
            "source": cap.source,
            "summary": revision_projection(
                summarize(rows, cap.clock_quality), cap.source
            ),
        }
    else:
        revisions = {
            "source": "alfred:UNRATE",
            "summary": {
                "status": "UNAVAILABLE",
                "reason": "No captured ALFRED vintage history",
                "yearly": [],
            },
        }
    mirror = {
        "status": "UNAVAILABLE",
        "pairs": 0,
        "meaning": "Both admitted ALFRED/BLS captures are required; no fallback",
    }
    if {"alfred:UNRATE", "bls:LNS14000000"} <= set(latest):
        a_cap, a_rows = latest["alfred:UNRATE"]
        b_cap, b_rows = latest["bls:LNS14000000"]
        # Current snapshot check at the later capture clock, never a PIT backdate.
        cutoff = max(utc(a_cap.captured_at), utc(b_cap.captured_at)).isoformat()
        by_period = {}
        for row in a_rows:
            if utc(row["available_at"]) <= utc(cutoff) and (
                row["observed_at"] not in by_period
                or utc(row["available_at"])
                > utc(by_period[row["observed_at"]]["available_at"])
            ):
                by_period[row["observed_at"]] = row
        # Comparison-only common information cutoff; original clocks remain sealed.
        a = [
            {
                **r,
                "observed_at": utc(r["observed_at"]).isoformat(),
                "available_at": cutoff,
            }
            for r in by_period.values()
        ]
        b = [
            {
                **r,
                "observed_at": utc(r["observed_at"]).isoformat(),
                "available_at": cutoff,
            }
            for r in b_rows
        ]
        if a_cap.captured_at[:10] != b_cap.captured_at[:10]:
            mirror = {
                "status": "INCOMPATIBLE",
                "pairs": 0,
                "reasons": ["different capture days"],
                "meaning": "No compatible current snapshots; no splice",
            }
        else:
            mirror = disagreement(a, b, a_cap, b_cap, mirror=True)
        mirror["comparison_cutoff"] = cutoff
        mirror["information_basis"] = (
            "Latest ALFRED predecessor versus BLS current capture. Same-day captures; no BLS historical vintage reconstruction. This is a current mirror check only."
        )
    discrepancies = {
        "sources": ["alfred:UNRATE", "bls:LNS14000000"],
        "summary": disagreement_projection(
            mirror, ["alfred:UNRATE", "bls:LNS14000000"]
        ),
    }
    failures = [e for e in entries if e["kind"] == "ATTEMPT_FAILED"]
    coverage = []
    for profile in catalog()["profiles"]:
        cap_rows = latest.get(profile["source"])
        failed = [e for e in failures if e["payload"]["source"] == profile["source"]]
        item = dict(profile)
        item.update(
            status="ADMITTED" if cap_rows else "UNAVAILABLE",
            rows=len(cap_rows[1]) if cap_rows else 0,
            reason=None
            if cap_rows
            else failed[-1]["payload"]["reason"]
            if failed
            else "No admitted evidence",
        )
        item["licence"] = (
            cap_rows[0].licence
            if cap_rows
            else {"status": "UNVERIFIED", "permitted_uses": []}
        )
        if cap_rows:
            item["clock_quality"] = cap_rows[0].clock_quality
            completions = [
                e["payload"]["at"]
                for e in entries
                if e["kind"] == "ATTEMPT_COMPLETED"
                and e["payload"]["source"] == profile["source"]
            ]
            if failed and (
                not completions
                or utc(failed[-1]["payload"]["at"]) > max(map(utc, completions))
            ):
                item.update(
                    status="RETAINED",
                    reason="Latest refresh unavailable; prior admitted capture retained. "
                    + failed[-1]["payload"]["reason"],
                )
        coverage.append(item)
    issues = []
    groups = {}
    for entry in failures:
        payload = entry["payload"]
        groups.setdefault((payload["source"], payload["reason"]), []).append(entry)
    for (source, reason), attempts in groups.items():
        issues.append(
            {
                "id": canonical_hash([source, reason]),
                "source": source,
                "severity": "HIGH" if source not in latest else "INFO",
                "kind": "SOURCE_ATTEMPT_FAILED",
                "status": "OPEN",
                "reason": reason[:280],
                "first_seen_at": attempts[0]["payload"]["at"],
                "last_seen_at": attempts[-1]["payload"]["at"],
                "occurrences": len(attempts),
                "evidence": [e["hash"] for e in attempts],
            }
        )
    for h in diagnostics:
        if h["quarantined"] or h["calendar_status"] == "UNAVAILABLE":
            issues.append(
                {
                    "id": canonical_hash([h["diagnostic_id"], "health"]),
                    "source": h["source"],
                    "severity": "MEDIUM",
                    "kind": "PARTIAL_SOURCE_HEALTH",
                    "status": "OPEN",
                    "reason": str(h["quarantined"])
                    + " invalid observations quarantined. "
                    + (h["calendar_reason"] or ""),
                    "first_seen_at": versions[
                        h["contract"]["source_version"]
                    ].captured_at,
                    "last_seen_at": versions[
                        h["contract"]["source_version"]
                    ].captured_at,
                    "occurrences": 1,
                    "evidence": [h["diagnostic_id"]],
                }
            )
    mappings = [e for e in entries if e["kind"] == "SIGNAL_MAPPING"]
    sampled_ids = []
    seen = set()
    for mapping in mappings:
        version_id = mapping["payload"]["source_version_id"]
        if version_id not in seen:
            sampled_ids.append(mapping["identity"])
            seen.add(version_id)
    sampled = inspect_lineages(
        registry, TENANT, sampled_ids, raw_directory=runtime / "captures"
    )
    for value in sampled:
        value["source"]["calendar"] = {
            k: v for k, v in value["source"]["calendar"].items() if k != "sessions"
        }
    schedule = costs_schedule()
    clocks = (
        [e["payload"].get("at") for e in entries if e["payload"].get("at")]
        + [c.captured_at for c in versions.values()]
        + [r["evidence"]["captured_at"] for r in schedule["components"]]
    )
    as_of = max(map(utc, clocks)).isoformat().replace("+00:00", "Z")
    cost_day = max(r["evidenced_through"] for r in schedule["components"])
    costs = {
        "example": calculate(
            schedule,
            trade_date=cost_day,
            notional="100000",
            side="BUY",
            settlement="DELIVERY",
        ),
        "label": "Illustrative INR 100,000 cash-equity buy; not a witnessed trade or broker quote",
    }
    values = {
        "health": health,
        "revisions": revisions,
        "disagreement": discrepancies,
        "coverage": {"items": coverage},
        "lineage": {"items": sampled},
        "issues": {"items": issues},
        "costs": costs,
    }
    # Stable from admitted journal evidence, not current Git HEAD or wall-clock.
    declared_files = [
        "scripts/export_data_organ_replay.py",
        "src/data_organ/publication.py",
        "src/data_organ/revisions.py",
        "src/data_organ/diagnostics.py",
        "src/data_organ/costs.py",
        "src/data_organ/adapters.py",
        "src/data_organ/contracts.py",
        "src/data_organ/service.py",
        "src/data_organ/calendars.py",
        "src/data_organ/lineage.py",
    ]
    computation_sources = {
        p: sha256((ROOT / p).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
        for p in declared_files
    }
    # A cold scheduled runner may have no credentials/captures. Retain the prior
    # checked evidence explicitly, while publishing its actual failed attempts.
    prior_receipt = (
        json.loads((directory / "receipt.json").read_bytes())
        if (directory / "receipt.json").exists()
        else None
    )
    if prior_receipt:
        raw_receipt = (directory / "receipt.json").read_bytes()
        sealed = directory / ("receipt-" + sha256(raw_receipt).hexdigest() + ".json")
        if not sealed.exists() or sealed.read_bytes() != raw_receipt:
            raise ValueError("Prior retained receipt is not sealed")
        for kind, entry in prior_receipt["entries"].items():
            raw = (public / entry["url"].lstrip("/")).read_bytes()
            if sha256(raw).hexdigest() != entry["sha256"] or json.loads(raw)[
                "payload"
            ] != json.loads((directory / (kind + ".json")).read_bytes()):
                raise ValueError("Prior retained diagnostic evidence substituted")
        as_of = (
            max(utc(as_of), utc(prior_receipt["as_of"]))
            .isoformat()
            .replace("+00:00", "Z")
        )
        for kind in ("health", "revisions", "disagreement", "lineage"):
            prior = json.loads((directory / (kind + ".json")).read_bytes())
            if kind in {"health", "lineage"}:
                seen_ids = {
                    r.get("diagnostic_id", r.get("signal_id"))
                    for r in values[kind]["items"]
                }
                values[kind]["items"].extend(
                    r
                    for r in prior["items"]
                    if r.get("diagnostic_id", r.get("signal_id")) not in seen_ids
                    and (r["source"] if kind == "health" else r["source"]["source"])
                    not in actual_sources
                )
            elif (
                values[kind]["summary"]["status"] == "UNAVAILABLE"
                and prior["summary"]["status"] == "AVAILABLE"
            ):
                values[kind] = prior
                if kind == "disagreement":
                    note = " Retained prior capture; current refresh unavailable."
                    if note not in values[kind]["summary"]["information_basis"]:
                        values[kind]["summary"]["information_basis"] += note
        prior_issues = json.loads((directory / "issues.json").read_bytes())["items"]
        current_issues = {i["id"]: i for i in values["issues"]["items"]}
        for old in prior_issues:
            if old["id"] not in current_issues:
                values["issues"]["items"].append(old)
            else:
                item = current_issues[old["id"]]
                item["first_seen_at"] = min(old["first_seen_at"], item["first_seen_at"])
                item["last_seen_at"] = max(old["last_seen_at"], item["last_seen_at"])
                item["evidence"] = list(
                    dict.fromkeys(old["evidence"] + item["evidence"])
                )
                item["occurrences"] = len(item["evidence"])
        prior_coverage = {
            r["source"]: r
            for r in json.loads((directory / "coverage.json").read_bytes())["items"]
        }
        for item in values["coverage"]["items"]:
            old = prior_coverage.get(item["source"])
            if (
                item["status"] == "UNAVAILABLE"
                and old
                and old["status"] in {"ADMITTED", "RETAINED"}
            ):
                item.update(
                    status="RETAINED",
                    rows=old["rows"],
                    clock_quality=old["clock_quality"],
                    licence=old["licence"],
                    reason="Current refresh unavailable; retained evidence from "
                    + max(
                        v["captured_at"]
                        for v in prior_receipt["source_versions"]
                        if v["source"] == item["source"]
                    )
                    + ". "
                    + item["reason"],
                )
        actual_sources = sorted(
            set(actual_sources) | set(prior_receipt["entries"]["health"]["sources"])
        )
    input_hash = canonical_hash(
        {
            "journal_tip": entries[-1]["hash"],
            "catalog": catalog(),
            "costs": schedule,
            "computation_sources": computation_sources,
            "derived_evidence_hash": canonical_hash(values),
        }
    )
    published = publish(
        public, values, as_of=as_of, input_hash=input_hash, sources=actual_sources
    )
    directory.mkdir(parents=True, exist_ok=True)
    for kind, value in values.items():
        raw = (
            json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
            + "\n"
        ).encode()
        (directory / (kind + "-" + sha256(raw).hexdigest() + ".json")).write_bytes(raw)
        (directory / (kind + ".json")).write_bytes(raw)
    record = {
        "schema_version": "data-organ-receipt/1",
        "as_of": as_of,
        "input_hash": input_hash,
        "journal_tip": entries[-1]["hash"],
        "computation_sources": computation_sources,
        "execution": {
            "commit": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
            ).strip(),
            "dependency_manifest_hash": canonical_hash(computation_sources),
            "dirty_computation": bool(
                subprocess.check_output(
                    ["git", "status", "--porcelain", "--", *declared_files],
                    cwd=ROOT,
                    text=True,
                ).strip()
            ),
        },
        "source_versions": list(
            {
                v["source_version_id"]: v
                for v in (
                    [public_metadata(c) for c in versions.values()]
                    + (prior_receipt["source_versions"] if prior_receipt else [])
                )
            }.values()
        ),
        "admissions": [
            {
                "id": e["identity"],
                "seal": e["hash"],
                "source_version_id": e["payload"]["source_version_id"],
                "admitted_rows": len(e["payload"]["observations"]),
                "quarantined_rows": len(e["payload"]["quarantine"]),
            }
            for e in admissions
        ],
        "entries": published,
        "model_runs": 0,
        "holdout_openings": 0,
        "raw_inputs": "LOCAL_ONLY",
    }
    raw = (json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n").encode()
    (directory / ("receipt-" + sha256(raw).hexdigest() + ".json")).write_bytes(raw)
    (directory / "receipt.json").write_bytes(raw)
    (directory / "manifest.json").write_text(
        json.dumps(published, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    (directory / "catalog.json").write_text(
        json.dumps(catalog(), sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "published": list(published),
                "admissions": len(admissions),
                "issues": len(issues),
                "model_runs": 0,
                "holdout_openings": 0,
            }
        )
    )
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=RUNTIME)
    args = parser.parse_args()
    export(args.runtime)
