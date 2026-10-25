"""Validated retained Data Organ monitoring, separate from frozen science.

Only five exact routes can select sweep inputs. A current immutable Data receipt
authorizes the seven existing Data publication aliases; no caller selectors,
provider calls or wall-clock evaluation are involved. Fixed-directory sealed
receipt history can prove carried lineage; it cannot select current inputs.
"""
from __future__ import annotations
from hashlib import sha256
from pathlib import Path
import re
import math
from .contracts import canonical, clock, decode, digest, Origin, utc
from datetime import date
from contextlib import contextmanager
from contextvars import ContextVar

_OPERATION_CACHE=ContextVar("risk_monitoring_operation_cache",default=None)

@contextmanager
def monitoring_operation():
    """Cache validated immutable catalog only within one bounded operation."""
    existing=_OPERATION_CACHE.get()
    token=_OPERATION_CACHE.set({}) if existing is None else None
    try:
        yield
    finally:
        if token is not None:
            _OPERATION_CACHE.reset(token)

def _decoded(root, relative):
    cache=_OPERATION_CACHE.get()
    key=(str(Path(root).resolve()),relative)
    if cache is not None and key in cache:
        return cache[key]
    value=decode(_read(root,relative))
    if cache is not None:
        cache[key]=value
    return value

KINDS = ("issues", "health", "coverage", "disagreement", "lineage")
ALL_KINDS = (*KINDS, "costs", "revisions")
ALIASES = {"data_"+kind: "/data/"+kind for kind in KINDS}
SOURCES = ["alfred:UNRATE", "bls:LNS14000000", "iima:daily-factors", "ken-french:daily-factors"]
LEGACY_DIAGNOSTIC_GAP = dict(origin_id="8ffbf62700f73b5d1bc4bdd1dd9edfb10d815445e9f839d14092968c87ce55a3",source="iima:daily-factors",diagnostic_id="56f095517555152343b851b87cce444fcb7ac48a14bbfb26a4625395296d047e")
MIRRORS = tuple("data/exports/data_organ_v0_1/"+kind+".json" for kind in (*ALL_KINDS, "manifest", "receipt"))
HEALTH_KEYS = set("diagnostic_id source status window_start window_end rows library_start duplicates quarantined non_monotonic zero_observations robust_outliers missing_sessions calendar_status calendar_reason cleaning_stage clock_quality finding observation_age_seconds capture_age_seconds age_reference publication_lag_status publication_lag_median_seconds publication_lag_max_seconds adjustment_evidence_status ohlcv_status freshness_status".split())
SOURCE_KEYS = set("source source_url source_version_id capture_sha256 captured_at clock_quality schema_hash licence calendar field_definition unit feed_scope price_basis adapter_version adapter_metadata_hash".split())
LICENCE_KEYS = set("status permitted_uses dataset_key valid_through attribution source_urls terms_url basis".split())
CALENDAR_KEYS = set("mic status reason version source_url source_sha256 start end sessions_hash meaning".split())
ENTRY_KEYS = set("status kind url sha256 bytes sources licence input_hash as_of observed_at available_at reason scope".split())

def record(value, allowed, required=()):
    if not isinstance(value, dict) or set(value)-set(allowed) or set(required)-set(value):
        raise ValueError("Unreviewed retained Data schema")
    return value

def _read(root, relative):
    root=Path(root).resolve()
    path=root/relative
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError("Retained Data path escape")
    return path.read_bytes()

def _hash(value):
    return isinstance(value,str) and re.fullmatch("[a-f0-9]{64}",value)

def _count(value):
    return type(value) is int and value >= 0

def _licence(value, cutoff, *, source=None):
    record(value, LICENCE_KEYS, ("status","permitted_uses","dataset_key","valid_through"))
    if value["status"] not in {"ACTIVE","FIRST_PARTY","PUBLIC_DOMAIN"} or value["permitted_uses"] != ["publish_derived"]:
        raise ValueError("Retained Data derived permission absent")
    if source and value["dataset_key"] != source:
        raise ValueError("Retained Data grant subject substituted")
    _strings(value["permitted_uses"])
    _text(value["dataset_key"])
    for key in ("attribution","terms_url","basis"):
        if key in value:
            _text(value[key])
    if "source_urls" in value:
        _strings(value["source_urls"])
    if value["valid_through"] is not None:
        _text(value["valid_through"])
    if value["valid_through"] and clock(value["valid_through"]) <= clock(cutoff):
        raise ValueError("Retained Data grant expired")

def _text(value, *, optional=False):
    if optional and value is None:
        return
    if not isinstance(value,str) or not value or len(value)>4096:
        raise ValueError("Retained Data scalar text required")

def _number(value, *, optional=False):
    if optional and value is None:
        return
    if type(value) not in (int,float) or not math.isfinite(value) or value<0:
        raise ValueError("Retained Data finite nonnegative number required")

def _day(value, *, optional=False):
    if optional and value is None:
        return
    _text(value)
    if date.fromisoformat(value).isoformat()!=value:
        raise ValueError("Retained Data ISO date required")

def _enum(value, allowed):
    if not isinstance(value,str) or value not in allowed:
        raise ValueError("Unreviewed retained Data enum")

def _strings(value):
    if not isinstance(value,list) or any(not isinstance(v,str) for v in value):
        raise ValueError("Retained Data scalar list required")

def _snapshot(root, kind):
    frozen=_decoded(root,"eval/risk_manager/v0.1/phase0-6-freeze.json")
    expected=frozen["files"]["data/exports/data_organ_v0_1/"+kind+".json"]
    raw=_read(root,"eval/risk_manager/v0.1/frozen-monitoring/"+expected["sha256"]+".json")
    if sha256(raw.replace(b"\r\n",b"\n") if expected["mode"]=="canonical_text" else raw).hexdigest()!=expected["sha256"]:
        raise ValueError("Original monitoring snapshot changed")
    # Decode the exact bytes whose immutable digest was checked above.
    return decode(raw)

def _baseline(root):
    frozen=_decoded(root,"eval/risk_manager/v0.1/phase0-6-freeze.json")
    return frozen,_snapshot(root,"receipt"),_snapshot(root,"coverage")

def _profiles(root, receipt):
    sources=[*receipt["source_versions"],*(row["source"] for row in _snapshot(root,"lineage")["items"])]
    return {canonical({k:v for k,v in source.items() if k not in {"source_version_id","capture_sha256","captured_at"}}) for source in sources}

def _evidence(root):
    evidence=_decoded(root,"eval/risk_manager/v0.1/evidence-map.json")
    frozen,receipt,_=_baseline(root)
    for alias,route in ALIASES.items():
        spec=evidence["artifacts"][alias]
        ident=frozen["routes"][route]
        if spec!={"artifact_id":ident,"entry":frozen["artifacts"][ident]}:
            raise ValueError("Original monitoring evidence binding substituted")
    if evidence["evaluation_cutoff"]!=receipt["as_of"] or any(
        entry!=frozen["artifacts"].get(identity) for identity,entry in evidence["health_history"].items()):
        raise ValueError("Original monitoring history/cutoff substituted")
    return evidence

def _source(value, cutoff, *, profiles=None):
    record(value,SOURCE_KEYS,SOURCE_KEYS-{"adapter_version","adapter_metadata_hash"})
    if value["source"] not in SOURCES or clock(value["captured_at"]) > clock(cutoff):
        raise ValueError("Retained Data source chronology/substitution")
    for key in ("source_version_id","capture_sha256","schema_hash"):
        if not _hash(value[key]):
            raise ValueError("Retained source identity invalid")
    for key in ("source_url","clock_quality","field_definition","unit","feed_scope","price_basis"):
        _text(value[key])
    if "adapter_version" in value:
        _text(value["adapter_version"])
        if not _hash(value.get("adapter_metadata_hash")):
            raise ValueError("Retained adapter identity invalid")
    elif "adapter_metadata_hash" in value:
        raise ValueError("Retained adapter version absent")
    _licence(value["licence"],cutoff,source=value["source"])
    record(value["calendar"],CALENDAR_KEYS,("status",))
    for key,val in value["calendar"].items():
        _text(val,optional=key=="reason")
    profile={k:v for k,v in value.items() if k not in {"source_version_id","capture_sha256","captured_at"}}
    if profiles is not None and canonical(profile) not in profiles:
        raise ValueError("Retained Data source definition changed")

def _payload(kind, payload, cutoff, *, legacy_health=False, profiles=None, coverage_profiles=None, health_profiles=None):
    if kind in {"health","coverage","lineage","issues"}:
        record(payload,{"items"},{"items"})
        if not isinstance(payload["items"],list):
            raise ValueError("Retained Data items are not a list")
    if kind=="health":
        seen=set()
        for row in payload["items"]:
            record(row,HEALTH_KEYS,HEALTH_KEYS if not legacy_health else HEALTH_KEYS-set("age_reference capture_age_seconds observation_age_seconds freshness_status publication_lag_max_seconds publication_lag_median_seconds publication_lag_status adjustment_evidence_status ohlcv_status".split()))
            if row["source"] not in SOURCES or not _hash(row["diagnostic_id"]) or row["diagnostic_id"] in seen:
                raise ValueError("Retained health source/identity substituted")
            seen.add(row["diagnostic_id"])
            _enum(row["status"],{"AVAILABLE","PARTIAL"})
            _enum(row["calendar_status"],{"AVAILABLE","UNAVAILABLE","NOT_APPLICABLE"})
            _enum(row["clock_quality"],{"CAPTURE_ONLY","CONSERVATIVE_VINTAGE_DAY"})
            _enum(row["cleaning_stage"],{"CAPTURED_INPUT"})
            for key in ("window_start","window_end","library_start"):
                _day(row[key],optional=key=="library_start")
            if row["window_start"]>row["window_end"] or row["window_end"]>cutoff[:10]:
                raise ValueError("Retained health window chronology")
            _text(row["calendar_reason"],optional=True)
            _text(row["finding"])
            if not legacy_health and health_profiles is not None and (row["clock_quality"],row["calendar_status"],row["finding"]) not in health_profiles.get(row["source"],set()):
                raise ValueError("Retained health source meaning changed")
            if row["missing_sessions"] is not None and not _count(row["missing_sessions"]):
                raise ValueError("Invalid retained missing sessions")
            for key in ("observation_age_seconds","capture_age_seconds","publication_lag_median_seconds","publication_lag_max_seconds"):
                if key in row:
                    _number(row[key],optional=True)
            for key,allowed in {
                "publication_lag_status":{"AVAILABLE","UNAVAILABLE"},
                "adjustment_evidence_status":{"NOT_APPLICABLE"},"ohlcv_status":{"UNAVAILABLE"},
                "freshness_status":{"HISTORICAL_WINDOW","STALE","UNKNOWN","WITHIN_PROFILE"}}.items():
                if key in row:
                    _enum(row[key],allowed)
            if row.get("publication_lag_status")=="AVAILABLE" and (row.get("publication_lag_median_seconds") is None or row.get("publication_lag_max_seconds") is None):
                raise ValueError("Retained available lag lacks values")
            for key in ("rows","duplicates","quarantined","non_monotonic","zero_observations","robust_outliers"):
                if not _count(row[key]):
                    raise ValueError("Invalid health count")
            if row.get("age_reference") and clock(row["age_reference"]) > clock(cutoff):
                raise ValueError("Future retained health diagnostic")
            if row["calendar_status"]=="UNAVAILABLE" and row["missing_sessions"] is not None:
                raise ValueError("Unsupported calendar claimed coverage")
            if row["clock_quality"]=="CAPTURE_ONLY" and (row.get("publication_lag_status","UNAVAILABLE")!="UNAVAILABLE"
                or row.get("publication_lag_median_seconds") is not None or row.get("publication_lag_max_seconds") is not None):
                raise ValueError("Capture-only source claimed publication lag")
    elif kind=="issues":
        seen=set()
        for row in payload["items"]:
            Origin.model_validate(row)
            if coverage_profiles is not None and row["source"] not in coverage_profiles:
                raise ValueError("Unreviewed retained Issue source")
            if row["kind"]=="PARTIAL_SOURCE_HEALTH" and (len(row["evidence"])!=1 or row["id"]!=digest([row["evidence"][0],"health"]) or row["severity"]!="MEDIUM" or row["status"]!="OPEN" or row["occurrences"]!=1):
                raise ValueError("Retained health Issue derivation substituted")
            if row["kind"]=="SOURCE_ATTEMPT_FAILED" and len(row["reason"])<280 and row["id"]!=digest([row["source"],row["reason"]]):
                raise ValueError("Retained source-attempt Issue derivation substituted")
            if not _hash(row["id"]) or row["id"] in seen or row["kind"] not in {"SOURCE_ATTEMPT_FAILED","PARTIAL_SOURCE_HEALTH"}:
                raise ValueError("Retained Data Issue identity/kind substituted")
            seen.add(row["id"])
            if clock(row["first_seen_at"])>clock(row["last_seen_at"]) or clock(row["last_seen_at"])>clock(cutoff):
                raise ValueError("Retained Data Issue chronology")
            if not row["evidence"] or any(not _hash(item) for item in row["evidence"]):
                raise ValueError("Retained Data Issue evidence invalid")
    elif kind=="coverage":
        keys=set("source country label fields cadence clock_quality calendar scope source_url status rows reason licence".split())
        for row in payload["items"]:
            record(row,keys,keys)
            record(row["licence"],LICENCE_KEYS,("status","permitted_uses"))
            for key in keys-{"fields","licence","rows"}:
                _text(row[key],optional=key=="reason")
            _strings(row["fields"])
            if coverage_profiles is not None:
                original=coverage_profiles.get(row["source"])
                dynamic={"status","rows","reason"}
                if not original or {k:v for k,v in row.items() if k not in dynamic}!={k:v for k,v in original.items() if k not in dynamic}:
                    raise ValueError("Retained coverage source definition changed")
            _enum(row["status"],{"ADMITTED","RETAINED","UNAVAILABLE"})
            if not _count(row["rows"]):
                raise ValueError("Invalid retained coverage count")
            if row["source"] in SOURCES:
                _licence(row["licence"],cutoff,source=row["source"])
            elif row["rows"]!=0 or row["licence"]["status"]!="UNVERIFIED" or row["licence"]["permitted_uses"]:
                raise ValueError("Restricted retained source admitted")
    elif kind=="lineage":
        seen=set()
        keys=set("status signal_id signal_sha256 admission_id admission_seal source_version_id capture_sha256 schema_hash licence_resolution_hash source source_bytes".split())
        for row in payload["items"]:
            record(row,keys,keys)
            _source(row["source"],cutoff,profiles=profiles)
            if row["signal_id"] in seen:
                raise ValueError("Retained Data lineage duplicate")
            seen.add(row["signal_id"])
            if row["status"]!="VERIFIED" or row["source_bytes"]!="LOCAL_ONLY" or any(not _hash(row[k]) for k in keys-{"status","source","source_bytes"}):
                raise ValueError("Retained Data lineage invalid")
            if row["licence_resolution_hash"]!=digest(row["source"]["licence"]):
                raise ValueError("Retained Data licence resolution substituted")
            if any(row[k]!=row["source"][k] for k in ("source_version_id","capture_sha256","schema_hash")):
                raise ValueError("Retained Data lineage/source substituted")
    elif kind=="disagreement":
        record(payload,{"sources","summary"},{"sources","summary"})
        keys=set("status pairs different max_absolute_delta meaning reasons comparison_cutoff information_basis".split())
        summary=record(payload["summary"],keys,keys-{"reasons"})
        _strings(payload["sources"])
        _enum(summary["status"],{"AVAILABLE","UNAVAILABLE"})
        for key in ("meaning","information_basis"):
            _text(summary[key])
        if "reasons" in summary:
            _strings(summary["reasons"])
        _text(summary["comparison_cutoff"])
        if not summary["comparison_cutoff"].endswith(("Z","+00:00")):
            raise ValueError("Retained mirror cutoff needs explicit UTC")
        if summary["different"] is not None and not _count(summary["different"]):
            raise ValueError("Invalid retained disagreement count")
        _number(summary["max_absolute_delta"],optional=True)
        if not _count(summary["pairs"]) or clock(utc(summary["comparison_cutoff"]))>clock(cutoff):
            raise ValueError("Retained mirror chronology/count invalid")
        if summary["status"]=="AVAILABLE" and (set(payload["sources"])!={"alfred:UNRATE","bls:LNS14000000"}
            or summary["pairs"]<6 or not _count(summary["different"]) or summary["different"]>summary["pairs"]):
            raise ValueError("Retained mirror comparison invalid")
    elif kind=="revisions":
        record(payload,{"source","summary"},{"source","summary"})
        if payload["source"]!="alfred:UNRATE":
            raise ValueError("Unreviewed retained revision source")
        summary=record(payload["summary"],set("status reason periods revised_periods transitions semantics yearly".split()),("status","periods","revised_periods","transitions","yearly"))
        _enum(summary["status"],{"AVAILABLE","UNAVAILABLE"})
        _text(summary.get("reason"),optional=True)
        _text(summary.get("semantics"),optional=True)
        if not isinstance(summary["yearly"],list) or any(not _count(summary[key]) for key in ("periods","revised_periods","transitions")):
            raise ValueError("Retained revision aggregates invalid")
        for row in summary["yearly"]:
            record(row,set("year periods revised_periods transitions absolute_revision_sum".split()),("year","periods","revised_periods","transitions","absolute_revision_sum"))
            if not _count(row["periods"]) or row["periods"]<6 or not isinstance(row["year"],str) or len(row["year"])!=4 or not _count(row["revised_periods"]) or row["revised_periods"]>row["periods"] or not _count(row["transitions"]) or type(row["absolute_revision_sum"]) not in (int,float) or not math.isfinite(row["absolute_revision_sum"]) or row["absolute_revision_sum"]<0:
                raise ValueError("Invalid retained revision aggregate")
    elif kind=="costs":
        record(payload,{"label","example"},{"label","example"})
        example=record(payload["example"],set("schema_version identity trade_date notional side settlement currency components statutory_subtotal statutory_status statutory_missing all_in_estimated_trading_cost all_in_status all_in_missing rounding scope".split()))
        if example["notional"]!="100000" or example["side"]!="BUY" or example["settlement"]!="DELIVERY":
            raise ValueError("Retained costs are only the fixed illustrative example")
        if example["all_in_status"]!="AVAILABLE" and example["all_in_estimated_trading_cost"] is not None:
            raise ValueError("Partial retained costs published an all-in total")
        for component in example["components"]:
            record(component,set("name status amount reason rate effective_from evidenced_through evidence".split()))
            if "evidence" in component:
                record(component["evidence"],set("source_url source_sha256 captured_at publication_date clock_quality representation".split()))
    if kind=="disagreement" and payload["summary"]["status"]=="AVAILABLE":
        delta=payload["summary"]["max_absolute_delta"]
        if type(delta) not in (int,float) or not math.isfinite(delta) or delta<0:
            raise ValueError("Invalid retained mirror delta")

def read_data(root, manifest, identity, *, expected_kind=None):
    match=re.fullmatch(r"data-organ:(health|issues|coverage|disagreement|lineage|costs|revisions):([a-f0-9]{64})",identity or "")
    if not match or (expected_kind and match[1]!=expected_kind):
        raise ValueError("Retained Data route/kind substitution")
    kind, hashed=match.groups()
    entry=manifest["artifacts"].get(identity)
    record(entry,ENTRY_KEYS,ENTRY_KEYS)
    expected_url="/artifacts/replay/"+identity.replace(":","-")+".json"
    if (entry["kind"],entry["url"],entry["status"],entry["scope"],entry["sources"],entry["sha256"]) != (
        "data-organ-"+kind,expected_url,"AVAILABLE","REAL_DERIVED_DIAGNOSTICS",SOURCES,hashed):
        raise ValueError("Retained Data manifest binding substituted")
    if not _hash(entry["input_hash"]) or not _count(entry["bytes"]):
        raise ValueError("Retained Data entry identity invalid")
    if len({entry["as_of"],entry["available_at"],entry["observed_at"]})!=1 or clock(entry["as_of"])>clock(manifest["as_of"]):
        raise ValueError("Retained Data publication chronology invalid")
    _licence(entry["licence"],entry["as_of"],source="project:data-organ-diagnostics")
    raw=_read(root,"frontend-v2/public"+expected_url)
    if sha256(raw).hexdigest()!=hashed or len(raw)!=entry["bytes"]:
        raise ValueError("Retained Data artifact bytes substituted")
    value=decode(raw)
    record(value,{"schema_version","kind","scope","as_of","sources","input_hash","claims","payload"},
        {"schema_version","kind","scope","as_of","sources","input_hash","claims","payload"})
    if (value["schema_version"],value["kind"],value["scope"],value["as_of"],value["sources"],value["input_hash"]) != (
        "data-organ-replay/1",kind,entry["scope"],entry["as_of"],SOURCES,entry["input_hash"]):
        raise ValueError("Retained Data envelope provenance substituted")
    names={"inference_certified","market_claim_eligible","causal_claim_eligible","validated_alpha"}
    if set(value["claims"])!=names or any(type(v) is not bool or v is not False for v in value["claims"].values()):
        raise ValueError("Retained Data claim promotion")
    legacy=_decoded(root,"eval/risk_manager/v0.1/evidence-map.json")["health_history"].get(identity)
    _,baseline_receipt,baseline_coverage=_baseline(root)
    if entry["licence"]!=baseline_receipt["entries"][kind]["licence"] or entry["reason"] is not None:
        raise ValueError("Retained Data publication grant/reason changed")
    profiles=_profiles(root,baseline_receipt)
    coverage_profiles={row["source"]:row for row in baseline_coverage["items"]}
    health_profiles={}
    for row in _snapshot(root,"health")["items"]:
        health_profiles.setdefault(row["source"],set()).add((row["clock_quality"],row["calendar_status"],row["finding"]))
    _payload(kind,value["payload"],entry["as_of"],legacy_health=legacy==entry,profiles=profiles,coverage_profiles=coverage_profiles,health_profiles=health_profiles)
    if kind=="disagreement":
        original=_snapshot(root,kind)["summary"]
        suffix=" Retained prior capture; current refresh unavailable."
        if value["payload"]["summary"]["meaning"]!=original["meaning"] or value["payload"]["summary"]["information_basis"] not in {original["information_basis"],original["information_basis"].removesuffix(suffix)}:
            raise ValueError("Retained mirror evidence meaning changed")
    if kind=="revisions" and value["payload"]["summary"].get("semantics")!=_snapshot(root,kind)["summary"].get("semantics"):
        raise ValueError("Retained revision evidence meaning changed")
    if kind=="costs" and value["payload"]!=_snapshot(root,"costs"):
        raise ValueError("Fixed illustrative cost metadata changed")
    return value

def _receipt_metadata(root, receipt):
    """Strict shared receipt contract; only stdlib and Risk metadata helpers."""
    record(receipt,{"schema_version","admissions","as_of","computation_sources","entries","execution","holdout_openings","input_hash","journal_tip","model_runs","raw_inputs","source_versions"},
        {"schema_version","admissions","as_of","computation_sources","entries","execution","holdout_openings","input_hash","journal_tip","model_runs","raw_inputs","source_versions"})
    clock(receipt["as_of"])
    if receipt["schema_version"]!="data-organ-receipt/1" or type(receipt["model_runs"]) is not int or receipt["model_runs"]!=0 or type(receipt["holdout_openings"]) is not int or receipt["holdout_openings"]!=0 or receipt["raw_inputs"]!="LOCAL_ONLY":
        raise ValueError("Retained Data receipt crossed scientific/raw boundary")
    if set(receipt["entries"])!=set(ALL_KINDS):
        raise ValueError("Retained Data receipt omitted a publication")
    if not isinstance(receipt["source_versions"],list) or not isinstance(receipt["admissions"],list):
        raise ValueError("Retained receipt inventory must be lists")
    _,baseline_receipt,_=_baseline(root)
    profiles=_profiles(root,baseline_receipt)
    for source in receipt["source_versions"]:
        _source(source,receipt["as_of"],profiles=profiles)
    execution=record(receipt["execution"],{"commit","dependency_manifest_hash","dirty_computation"},{"commit","dependency_manifest_hash","dirty_computation"})
    if not isinstance(execution["commit"],str) or not re.fullmatch("[a-f0-9]{40}",execution["commit"]) or not _hash(receipt["input_hash"]) or not _hash(receipt["journal_tip"]):
        raise ValueError("Retained receipt identity invalid")
    frozen=_decoded(root,"eval/risk_manager/v0.1/phase0-6-freeze.json")
    baseline_receipt=decode(_read(root,"eval/risk_manager/v0.1/frozen-monitoring/"+frozen["files"]["data/exports/data_organ_v0_1/receipt.json"]["sha256"]+".json"))
    expected_sources=baseline_receipt["computation_sources"]
    reviewed_names={"scripts/export_data_organ_replay.py",*("src/data_organ/"+name+".py" for name in ("adapters","calendars","contracts","costs","diagnostics","lineage","publication","revisions","service"))}
    if set(receipt["computation_sources"])!=reviewed_names or receipt["computation_sources"]!=expected_sources or receipt["execution"]["dependency_manifest_hash"]!=digest(receipt["computation_sources"]) or receipt["execution"]["dirty_computation"] is not False:
        raise ValueError("Retained Data computation provenance substituted")
    if any(sha256(_read(root,name).replace(b"\r\n",b"\n")).hexdigest()!=expected for name,expected in expected_sources.items()):
        raise ValueError("Retained Data computation source bytes changed")
    versions={source["source_version_id"]:source for source in receipt["source_versions"]}
    if len(versions)!=len(receipt["source_versions"]):
        raise ValueError("Retained source version duplicate")
    admissions={}
    for admission in receipt["admissions"]:
        record(admission,{"id","seal","source_version_id","admitted_rows","quarantined_rows"},{"id","seal","source_version_id","admitted_rows","quarantined_rows"})
        if any(not _hash(admission[key]) for key in ("id","seal","source_version_id")) or not _count(admission["admitted_rows"]) or not _count(admission["quarantined_rows"]):
            raise ValueError("Retained admission identity/count invalid")
        if admission["id"] in admissions:
            raise ValueError("Retained admission duplicate")
        if admission["source_version_id"] not in versions:
            raise ValueError("Retained admission source version absent")
        admissions[admission["id"]]=admission
    return versions,admissions


def _receipt_values(root, manifest, receipt, *, current=False):
    values={}
    for kind in ALL_KINDS:
        spec=receipt["entries"][kind]
        identity=spec["artifact_id"]
        entry={k:v for k,v in spec.items() if k!="artifact_id"}
        if entry!=manifest["artifacts"].get(identity) or (current and manifest["routes"].get("/data/"+kind)!=identity):
            raise ValueError("Retained Data route/receipt substitution")
        value=read_data(root,manifest,identity,expected_kind=kind)
        if value["as_of"]!=receipt["as_of"] or value["input_hash"]!=receipt["input_hash"]:
            raise ValueError("Mixed retained Data publication bundle")
        values[kind]=value
    return values


# This is the existing Data archive's sealed receipt namespace, not an input
# selector. Bounds allow thousands of retained epochs without unbounded reads.
_RECEIPT_DIRECTORY="data/exports/data_organ_v0_1"
_HISTORY_RECEIPTS=4096
_HISTORY_RECEIPT_BYTES=16*1024*1024
_HISTORY_TOTAL_BYTES=128*1024*1024


def _retained_lineage(root, manifest, receipt, rows, unresolved):
    """Prove absent admissions from older manifest-bound immutable metadata."""
    directory=Path(root)/_RECEIPT_DIRECTORY
    if directory.is_symlink():
        raise ValueError("Retained Data history path escape")
    names=[]
    for path in directory.iterdir():
        if path.name.startswith("receipt-") and path.suffix==".json":
            if not re.fullmatch(r"receipt-[a-f0-9]{64}\.json",path.name):
                raise ValueError("Unreviewed retained Data receipt name")
            names.append(path.name)
            if len(names)>_HISTORY_RECEIPTS:
                raise ValueError("Retained Data receipt history limit")
    targets={row["signal_id"]:row for row in rows}
    versions={row["source_version_id"]:row["source"] for row in rows}
    bindings={row["admission_id"]:(row["admission_seal"],row["source_version_id"]) for row in rows}
    seen_admissions={a["id"]:a for a in receipt["admissions"] if a["id"] in bindings}
    witnesses=set()
    total=0
    baseline=clock(_snapshot(root,"receipt")["as_of"])
    cutoff=clock(receipt["as_of"])
    for name in sorted(names):
        relative=_RECEIPT_DIRECTORY+"/"+name
        path=Path(root)/relative
        # Check size before read as well as exact bytes afterward.
        if path.stat().st_size>_HISTORY_RECEIPT_BYTES:
            raise ValueError("Retained Data receipt byte limit")
        raw=_read(root,relative)
        total+=len(raw)
        if len(raw)>_HISTORY_RECEIPT_BYTES or total>_HISTORY_TOTAL_BYTES:
            raise ValueError("Retained Data receipt byte limit")
        if name!="receipt-"+sha256(raw).hexdigest()+".json":
            raise ValueError("Retained Data receipt history substitution")
        prior=decode(raw)
        prior_cutoff=clock(prior["as_of"])
        if prior_cutoff>cutoff:
            raise ValueError("Future retained Data receipt")
        if prior_cutoff<baseline:
            # Original pre-monitoring history cannot expand the frozen exception.
            continue
        prior_versions,prior_admissions=_receipt_metadata(root,prior)
        for kind,spec in prior["entries"].items():
            identity=spec.get("artifact_id")
            if not isinstance(identity,str) or not re.fullmatch("data-organ:"+kind+r":[a-f0-9]{64}",identity) or not _count(spec.get("bytes")):
                raise ValueError("Retained Data history artifact identity invalid")
            artifact=Path(root)/("frontend-v2/public/artifacts/replay/"+identity.replace(":","-")+".json")
            size=artifact.stat().st_size
            total+=size
            if size!=spec["bytes"] or total>_HISTORY_TOTAL_BYTES:
                raise ValueError("Retained Data history artifact byte limit")
        values=_receipt_values(root,manifest,prior)
        for identity,source in versions.items():
            if identity in prior_versions and prior_versions[identity]!=source:
                raise ValueError("Conflicting retained Data source version")
        for identity,binding in bindings.items():
            admission=prior_admissions.get(identity)
            if admission is None:
                continue
            if (admission["seal"],admission["source_version_id"])!=binding or (identity in seen_admissions and seen_admissions[identity]!=admission):
                raise ValueError("Conflicting retained Data admission")
            seen_admissions[identity]=admission
        for row in values["lineage"]["payload"]["items"]:
            if row["signal_id"] not in targets:
                continue
            if row!=targets[row["signal_id"]]:
                raise ValueError("Conflicting retained Data lineage row")
            admission=prior_admissions.get(row["admission_id"])
            if prior_cutoff<cutoff and admission and prior_versions.get(row["source_version_id"])==row["source"]:
                if (admission["seal"],admission["source_version_id"])==(row["admission_seal"],row["source_version_id"]):
                    witnesses.add(canonical(row))
    if any(canonical(row) not in witnesses for row in unresolved):
        raise ValueError("Retained Data lineage lacks a sealed prior admission")


def current_receipt(root, manifest, *, mirrors=True):
    """One fixed pointer selects current inputs; history only proves carried rows."""
    raw=_read(root,"data/exports/data_organ_v0_1/receipt.json")
    seal=sha256(raw).hexdigest()
    if _read(root,"data/exports/data_organ_v0_1/receipt-"+seal+".json")!=raw:
        raise ValueError("Current retained Data receipt is not sealed")
    receipt=decode(raw)
    versions,admissions=_receipt_metadata(root,receipt)
    values=_receipt_values(root,manifest,receipt,current=True)
    original=_snapshot(root,"lineage")["items"]
    rows=[]
    unresolved=[]
    for row in values["lineage"]["payload"]["items"]:
        if row in original:
            continue
        rows.append(row)
        if versions.get(row["source_version_id"])!=row["source"]:
            raise ValueError("Retained Data lineage/source version substituted")
        admission=admissions.get(row["admission_id"])
        if admission is None:
            unresolved.append(row)
        elif (admission["seal"],admission["source_version_id"])!=(row["admission_seal"],row["source_version_id"]):
            raise ValueError("Retained Data lineage/receipt admission substituted")
    if unresolved:
        _retained_lineage(root,manifest,receipt,rows,unresolved)
    for kind,value in values.items():
        if mirrors and decode(_read(root,"data/exports/data_organ_v0_1/"+kind+".json"))!=value["payload"]:
            raise ValueError("Current retained Data mirror substituted")
    if mirrors and decode(_read(root,"data/exports/data_organ_v0_1/manifest.json"))!=receipt["entries"]:
        raise ValueError("Current retained Data manifest mirror substituted")
    issues_epochs=[clock(e["as_of"]) for ident,e in manifest["artifacts"].items()
        if re.fullmatch(r"data-organ:issues:[a-f0-9]{64}",ident)]
    if issues_epochs and clock(receipt["as_of"])!=max(issues_epochs):
        raise ValueError("Current retained Data monitoring rollback")
    return receipt

def _bundle(root, manifest, evidence, selected, health_values):
    entries=[spec["entry"] for spec in selected.values()]
    if len({(e["as_of"],e["input_hash"]) for e in entries})!=1:
        raise ValueError("Selected monitoring inputs are not one publication bundle")
    cutoff=max((e[key] for e in entries for key in ("as_of","available_at")),key=clock)
    values={alias:read_data(root,manifest,spec["artifact_id"],expected_kind=alias.removeprefix("data_"))
        for alias,spec in selected.items()}
    required={item for origin in values["data_issues"]["payload"]["items"] if origin["kind"]=="PARTIAL_SOURCE_HEALTH" for item in origin["evidence"]}
    health_history=dict(evidence["health_history"])
    diagnostics={}
    for identity,(entry,value) in health_values.items():
        if clock(entry["as_of"])>clock(cutoff):
            continue
        relevant=any(row["diagnostic_id"] in required for row in value["payload"]["items"])
        if relevant:
            health_history[identity]=entry
        for row in value["payload"]["items"]:
            known=diagnostics.get(row["diagnostic_id"])
            if known and known!=row:
                raise ValueError("Conflicting retained health diagnostic")
            diagnostics[row["diagnostic_id"]]=row
    unresolved=[]
    for origin in values["data_issues"]["payload"]["items"]:
        if origin["kind"]=="PARTIAL_SOURCE_HEALTH":
            for diagnostic in origin["evidence"]:
                if diagnostic in diagnostics:
                    row=diagnostics[diagnostic]
                    if row["source"]!=origin["source"] or row["status"]!="PARTIAL":
                        raise ValueError("Retained health diagnostic source/status substituted")
                    expected_reason=str(row["quarantined"])+" invalid observations quarantined. "+(row["calendar_reason"] or "")
                    if origin["reason"]!=expected_reason:
                        raise ValueError("Retained health Issue reason/diagnostic substituted")
                if diagnostic not in diagnostics:
                    gap=dict(origin_id=origin["id"],source=origin["source"],diagnostic_id=diagnostic)
                    original=next((o for o in _snapshot(root,"issues")["items"] if o["id"]==gap["origin_id"]),None)
                    if gap!=LEGACY_DIAGNOSTIC_GAP or origin!=original:
                        raise ValueError("Unresolved retained health diagnostic/source")
                    unresolved.append(gap)
    expected={spec["artifact_id"]:dict(input_id=spec["artifact_id"],sha256=spec["entry"]["sha256"],bytes=spec["entry"]["bytes"])
        for alias,spec in evidence["artifacts"].items() if alias not in ALIASES}
    for spec in selected.values():
        expected[spec["artifact_id"]]=dict(input_id=spec["artifact_id"],sha256=spec["entry"]["sha256"],bytes=spec["entry"]["bytes"])
    for identity,entry in health_history.items():
        if clock(entry["available_at"])>clock(cutoff):
            raise ValueError("Historical health reference crosses monitoring epoch")
        expected[identity]=dict(input_id=identity,sha256=entry["sha256"],bytes=entry["bytes"])
    expected.update({alias:dict(input_id=alias,sha256=spec["sha256"],bytes=spec["bytes"]) for alias,spec in evidence["files"].items()})
    return dict(evaluation_cutoff=cutoff,artifacts=selected,health_history=health_history,unresolved_diagnostics=unresolved,inputs=[expected[key] for key in sorted(expected)])

def monitoring_catalog(root, manifest=None):
    """Derive historical coherent bundles from manifest identities, never a glob."""
    root=Path(root)
    manifest=manifest or decode(_read(root,"frontend-v2/public/replay-manifest.json"))
    cache=_OPERATION_CACHE.get()
    cache_key=("catalog",str(root.resolve()),digest(manifest))
    if cache is not None and cache_key in cache:
        return cache[cache_key]
    evidence=_evidence(root)
    if any(manifest["artifacts"].get(identity)!=entry for identity,entry in evidence["health_history"].items()):
        raise ValueError("Original retained health history missing or substituted")
    groups={}
    health={}
    for identity,entry in manifest["artifacts"].items():
        match=re.fullmatch(r"data-organ:(health|issues|coverage|disagreement|lineage):[a-f0-9]{64}",identity)
        if not match:
            continue
        if match[1]=="health":
            health[identity]=(entry,read_data(root,manifest,identity,expected_kind="health"))
        if clock(entry["as_of"]) < clock(evidence["evaluation_cutoff"]):
            continue
        key=(entry["as_of"],entry["input_hash"])
        by_kind=groups.setdefault(key,{})
        if match[1] in by_kind:
            raise ValueError("Ambiguous retained monitoring bundle")
        by_kind[match[1]]=dict(artifact_id=identity,entry=entry)
    bundles=[]
    for key,group in sorted(groups.items(),key=lambda item:clock(item[0][0])):
        if set(group)!=set(KINDS):
            # Older partial publications can provide history, never select a sweep.
            continue
        selected={"data_"+kind:group[kind] for kind in KINDS}
        bundles.append(_bundle(root,manifest,evidence,selected,health))
    if not bundles or bundles[0]["evaluation_cutoff"]!=evidence["evaluation_cutoff"]:
        raise ValueError("Original retained monitoring bundle missing")
    value=dict(schema_version="risk-monitoring-catalog/1",bundles=bundles)
    if cache is not None:
        cache[cache_key]=value
    return value

def selected_bundle(root, manifest):
    receipt=current_receipt(root,manifest)
    catalog=monitoring_catalog(root,manifest)
    matches=[bundle for bundle in catalog["bundles"] if all(
        bundle["artifacts"][alias]["artifact_id"]==manifest["routes"].get(route) for alias,route in ALIASES.items())]
    if len(matches)!=1 or matches[0]["evaluation_cutoff"]!=receipt["as_of"]:
        raise ValueError("Current retained monitoring bundle unavailable")
    if matches[0]["unresolved_diagnostics"]:
        # Explicitly approved historical gap: retain the exact frozen origin and
        # publish UNAVAILABLE coverage. No synthetic diagnostic is fabricated.
        # This is not an exception for a source, epoch or later origin revision.
        evidence=_evidence(root)
        original_spec=evidence["artifacts"]["data_issues"]
        original=read_data(root,manifest,original_spec["artifact_id"],expected_kind="issues")["payload"]["items"]
        current=read_data(root,manifest,matches[0]["artifacts"]["data_issues"]["artifact_id"],expected_kind="issues")["payload"]["items"]
        old=next((o for o in original if o["id"]==LEGACY_DIAGNOSTIC_GAP["origin_id"]),None)
        latest=next((o for o in current if o["id"]==LEGACY_DIAGNOSTIC_GAP["origin_id"]),None)
        if matches[0]["unresolved_diagnostics"]!=[LEGACY_DIAGNOSTIC_GAP] or not old or latest!=old:
            raise ValueError("Unresolved retained health diagnostic/source")
    return matches[0]

def bundle_at(root, cutoff, manifest=None, *, catalog=None):
    matches=[b for b in (catalog or monitoring_catalog(root,manifest))["bundles"] if b["evaluation_cutoff"]==cutoff]
    if len(matches)!=1:
        raise ValueError("Unknown retained monitoring evaluation epoch")
    return matches[0]
