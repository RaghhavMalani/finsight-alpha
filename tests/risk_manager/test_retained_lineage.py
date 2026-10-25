"""Read-only carried-admission proof; every mutation stays in synthetic tmp_path."""
from copy import deepcopy
from datetime import timedelta
from hashlib import sha256

import pytest

from src.risk_manager import monitoring
from src.risk_manager.contracts import canonical, clock, decode, digest
from src.risk_manager.evidence import forbidden_calls
from test_monitoring import retained, reseal

DIRECTORY="data/exports/data_organ_v0_1/"


def sealed(root, receipt, *, replace=None, current=False, raw=None):
    raw=raw if raw is not None else canonical(receipt)+b"\n"
    if replace is not None:
        replace.unlink()
    path=root/(DIRECTORY+"receipt-"+sha256(raw).hexdigest()+".json")
    path.write_bytes(raw)
    if current:
        (root/(DIRECTORY+"receipt.json")).write_bytes(raw)
    return path


def complete_current_admissions(root,manifest):
    """Normalize only temporary metadata, regardless of refresh outcomes."""
    current=decode((root/(DIRECTORY+"receipt.json")).read_bytes())
    baseline=monitoring._snapshot(root,"lineage")["items"]
    payload=decode((root/(DIRECTORY+"lineage.json")).read_bytes())
    admissions={a["id"]:a for a in current["admissions"]}
    versions={s["source_version_id"]:s for s in current["source_versions"]}
    history=[decode(path.read_bytes())
             for path in (root/DIRECTORY).glob("receipt-*.json")]
    for row in payload["items"]:
        if row in baseline or row["admission_id"] in admissions:
            continue
        assert versions.get(row["source_version_id"])==row["source"]
        proofs=[]
        for prior in history:
            if clock(prior["as_of"])>=clock(current["as_of"]):
                continue
            admission=next(
                (a for a in prior["admissions"]
                 if a["id"]==row["admission_id"]
                 and (a["seal"],a["source_version_id"])==
                     (row["admission_seal"],row["source_version_id"])),
                None,
            )
            if admission is None or row["source"] not in prior["source_versions"]:
                continue
            value=decode(
                (root/("frontend-v2/public"+
                       prior["entries"]["lineage"]["url"])).read_bytes()
            )
            if row in value["payload"]["items"]:
                proofs.append(admission)
        assert proofs and all(proof==proofs[0] for proof in proofs)
        admissions[row["admission_id"]]=deepcopy(proofs[0])
    current["admissions"]=list(admissions.values())
    sealed(root,current,current=True)
    return current


def carried_factory(root,manifest,*,targets=1,tag="fixture-target"):
    """Create unique older witnesses and later carried rows in tmp_path."""
    current=complete_current_admissions(root,manifest)
    versions={s["source_version_id"]:s for s in current["source_versions"]}
    template=next(
        a for a in current["admissions"]
        if a["source_version_id"] in versions
    )
    source=versions[template["source_version_id"]]
    rows=[]
    admissions=[]
    for index in range(targets):
        identity=["SYNTHETIC_TEST_ONLY",tag,current["input_hash"],index]
        admission=dict(
            deepcopy(template),
            id=digest([identity,"admission"]),
            seal=digest([identity,"seal"]),
        )
        row=dict(
            status="VERIFIED",
            signal_id=digest([identity,"signal"]),
            signal_sha256=digest([identity,"signal-payload"]),
            admission_id=admission["id"],
            admission_seal=admission["seal"],
            source_version_id=source["source_version_id"],
            capture_sha256=source["capture_sha256"],
            schema_hash=source["schema_hash"],
            licence_resolution_hash=digest(source["licence"]),
            source=deepcopy(source),
            source_bytes="LOCAL_ONLY",
        )
        rows.append(row)
        admissions.append(admission)

    prior=reseal(
        root,manifest,kind="lineage",
        mutate=lambda payload:payload["items"].extend(deepcopy(rows)),
    )
    provisional=root/(
        DIRECTORY+"receipt-"+
        sha256((root/(DIRECTORY+"receipt.json")).read_bytes()).hexdigest()+
        ".json"
    )
    prior["admissions"].extend(admissions)
    path=sealed(root,prior,replace=provisional,current=True)

    current=reseal(root,manifest)
    provisional=root/(
        DIRECTORY+"receipt-"+
        sha256((root/(DIRECTORY+"receipt.json")).read_bytes()).hexdigest()+
        ".json"
    )
    target_ids={a["id"] for a in admissions}
    current["admissions"]=[
        a for a in current["admissions"] if a["id"] not in target_ids
    ]
    sealed(root,current,replace=provisional,current=True)
    return root,manifest,current,rows,path,prior


@pytest.fixture
def carried(retained):
    root,manifest=retained
    root,manifest,current,rows,path,prior=carried_factory(root,manifest)
    return root,manifest,current,rows[0],path,prior


def check(root,manifest):
    with monitoring.monitoring_operation(),forbidden_calls():
        return monitoring.current_receipt(root,manifest)


def rejects(root,manifest):
    with pytest.raises((ValueError,KeyError,FileNotFoundError)):
        check(root,manifest)


def test_carried_row_uses_exact_older_seal_and_keeps_current_aliases(carried):
    root,manifest,current,row,_,prior=carried
    prior_value=monitoring.read_data(root,manifest,prior["entries"]["lineage"]["artifact_id"])
    assert row in prior_value["payload"]["items"]
    assert any(a["id"]==row["admission_id"] and a["seal"]==row["admission_seal"] for a in prior["admissions"])
    before=deepcopy(manifest)
    assert check(root,manifest)==current
    assert manifest==before
    assert all(manifest["routes"]["/data/"+kind]==current["entries"][kind]["artifact_id"] for kind in monitoring.ALL_KINDS)


@pytest.mark.parametrize("existing_carried",[0,2])
def test_factory_is_independent_of_actual_refresh_admission_outcomes(
    retained,existing_carried,
):
    root,manifest=retained
    current=complete_current_admissions(root,manifest)
    baseline=monitoring._snapshot(root,"lineage")["items"]
    payload=decode((root/(DIRECTORY+"lineage.json")).read_bytes())
    assert all(
        row in baseline or any(
            a["id"]==row["admission_id"] for a in current["admissions"]
        )
        for row in payload["items"]
    )
    if existing_carried:
        carried_factory(
            root,manifest,targets=existing_carried,tag="preexisting-carried",
        )
    root,manifest,current,rows,_,_=carried_factory(root,manifest)
    payload=decode((root/(DIRECTORY+"lineage.json")).read_bytes())
    missing=[
        row for row in payload["items"]
        if row not in baseline
        and not any(
            a["id"]==row["admission_id"] for a in current["admissions"]
        )
    ]
    assert missing==rows
    assert check(root,manifest)==current


def test_future_carried_metadata_needs_no_source_or_epoch_pin(carried):
    root,manifest,_,row,_,_=carried
    future=reseal(root,manifest)
    assert check(root,manifest)==future
    assert row in decode((root/(DIRECTORY+"lineage.json")).read_bytes())["items"]


@pytest.mark.parametrize("fault",["admission_absent","wrong_id","wrong_seal","wrong_version","source_absent","source_changed","source_future","duplicate_admission","duplicate_version","schema","code","dirty","science","grant"])
def test_self_sealed_prior_receipt_cannot_authorize_changed_proof(carried,fault):
    root,manifest,_,row,path,prior=carried
    admission=next(a for a in prior["admissions"] if a["id"]==row["admission_id"])
    source=next(s for s in prior["source_versions"] if s["source_version_id"]==row["source_version_id"])
    if fault=="admission_absent":prior["admissions"].remove(admission)
    elif fault=="wrong_id":admission["id"]="a"*64
    elif fault=="wrong_seal":admission["seal"]="a"*64
    elif fault=="wrong_version":admission["source_version_id"]=next(s["source_version_id"] for s in prior["source_versions"] if s["source_version_id"]!=row["source_version_id"])
    elif fault=="source_absent":prior["source_versions"].remove(source)
    elif fault=="source_changed":source["captured_at"]=(clock(source["captured_at"])-timedelta(seconds=1)).isoformat().replace("+00:00","Z")
    elif fault=="source_future":source["captured_at"]="2099-01-01T00:00:00Z"
    elif fault=="duplicate_admission":prior["admissions"].append(deepcopy(admission))
    elif fault=="duplicate_version":prior["source_versions"].append(deepcopy(source))
    elif fault=="schema":prior["unexpected"]={"raw_prices":[1,2]}
    elif fault=="code":prior["computation_sources"]["src/data_organ/lineage.py"]="a"*64
    elif fault=="dirty":prior["execution"]["dirty_computation"]=True
    elif fault=="science":prior["model_runs"]=1
    elif fault=="grant":source["licence"]["permitted_uses"]=[]
    sealed(root,prior,replace=path)
    rejects(root,manifest)


@pytest.mark.parametrize("field",["admission_id","admission_seal","source_version_id","capture_sha256","schema_hash","licence_resolution_hash","signal_id","signal_sha256","status","source_bytes","nested_source"])
def test_resealed_current_row_requires_exact_historical_equality(carried,field):
    root,manifest,_,target,_,_=carried
    def mutate(payload):
        row=next(r for r in payload["items"] if r["signal_id"]==target["signal_id"])
        if field=="status":row[field]="UNAVAILABLE"
        elif field=="source_bytes":row[field]="PUBLIC"
        elif field=="nested_source":row["source"]["captured_at"]=(clock(row["source"]["captured_at"])-timedelta(seconds=1)).isoformat().replace("+00:00","Z")
        else:
            row[field]="a"*64
            if field in {"source_version_id","capture_sha256","schema_hash"}:
                row["source"][field]=row[field]
    reseal(root,manifest,kind="lineage",mutate=mutate)
    rejects(root,manifest)


@pytest.mark.parametrize("fault",["missing_receipt","corrupt_receipt","duplicate_json","unbound_lineage","artifact_bytes","cutoff","input_hash","future","same_epoch"])
def test_history_witness_must_be_retained_bound_and_strictly_older(carried,fault):
    root,manifest,current,_,path,prior=carried
    if fault=="missing_receipt":path.unlink()
    elif fault=="corrupt_receipt":path.write_bytes(path.read_bytes()+b" ")
    elif fault=="duplicate_json":
        raw=canonical(prior)
        raw=b'{"schema_version":"data-organ-receipt/1",'+raw[1:]+b"\n"
        sealed(root,prior,replace=path,raw=raw)
    elif fault=="unbound_lineage":del manifest["artifacts"][prior["entries"]["lineage"]["artifact_id"]]
    elif fault=="artifact_bytes":(root/("frontend-v2/public"+prior["entries"]["lineage"]["url"])).write_bytes(b"{}")
    else:
        if fault=="cutoff":prior["as_of"]=(clock(prior["as_of"])+timedelta(seconds=1)).isoformat().replace("+00:00","Z")
        elif fault=="input_hash":prior["input_hash"]="a"*64
        elif fault=="future":prior["as_of"]="2099-01-01T00:00:00Z"
        elif fault=="same_epoch":prior["as_of"]=current["as_of"]
        sealed(root,prior,replace=path)
    rejects(root,manifest)


@pytest.mark.parametrize("fault",["admission","source","lineage"])
def test_conflicting_history_fails_even_when_the_original_witness_remains(carried,fault):
    root,manifest,_,row,_,prior=carried
    if fault=="admission":
        next(a for a in prior["admissions"] if a["id"]==row["admission_id"])["admitted_rows"]+=1
    elif fault=="source":
        source=next(s for s in prior["source_versions"] if s["source_version_id"]==row["source_version_id"])
        source["captured_at"]=(clock(source["captured_at"])-timedelta(seconds=1)).isoformat().replace("+00:00","Z")
    else:
        old=prior["entries"]["lineage"]
        value=decode((root/("frontend-v2/public"+old["url"])).read_bytes())
        next(r for r in value["payload"]["items"] if r["signal_id"]==row["signal_id"])["signal_sha256"]="a"*64
        raw=canonical(value)+b"\n"
        hashed=sha256(raw).hexdigest()
        identity="data-organ:lineage:"+hashed
        entry={k:v for k,v in old.items() if k!="artifact_id"}
        entry.update(sha256=hashed,bytes=len(raw),url="/artifacts/replay/"+identity.replace(":","-")+".json")
        (root/("frontend-v2/public"+entry["url"])).write_bytes(raw)
        manifest["artifacts"][identity]=entry
        prior["entries"]["lineage"]=dict(artifact_id=identity,**entry)
    sealed(root,prior)
    rejects(root,manifest)


def test_wrong_present_current_admission_cannot_fall_back_to_history(carried,monkeypatch):
    root,manifest,current,row,_,prior=carried
    admission=deepcopy(next(a for a in prior["admissions"] if a["id"]==row["admission_id"]))
    admission["seal"]="a"*64
    current["admissions"].append(admission)
    sealed(root,current,current=True)
    def forbidden(*args):
        pytest.fail("A present inconsistent admission reached historical fallback")
    monkeypatch.setattr(monitoring,"_retained_lineage",forbidden)
    rejects(root,manifest)


def test_source_must_match_current_receipt_even_with_valid_historical_proof(carried):
    root,manifest,current,row,_,_=carried
    source=next(s for s in current["source_versions"] if s["source_version_id"]==row["source_version_id"])
    source["captured_at"]=(clock(source["captured_at"])-timedelta(seconds=1)).isoformat().replace("+00:00","Z")
    sealed(root,current,current=True)
    rejects(root,manifest)


def test_history_cannot_redirect_a_current_data_alias(carried):
    root,manifest,_,_,_,prior=carried
    manifest["routes"]["/data/lineage"]=prior["entries"]["lineage"]["artifact_id"]
    rejects(root,manifest)


@pytest.mark.parametrize("bound",["_HISTORY_RECEIPTS","_HISTORY_RECEIPT_BYTES","_HISTORY_TOTAL_BYTES"])
def test_history_reads_are_bounded(carried,monkeypatch,bound):
    root,manifest,_,_,_,_=carried
    monkeypatch.setattr(monitoring,bound,1)
    rejects(root,manifest)


def test_unreviewed_receipt_name_is_rejected(carried):
    root,manifest,_,_,_,_=carried
    (root/(DIRECTORY+"receipt-unreviewed.json")).write_bytes(b"{}")
    rejects(root,manifest)
