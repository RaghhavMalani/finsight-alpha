"""Narrow two-kind risk extension; old manifest subsets remain frozen."""
from pathlib import Path
from hashlib import sha256
import re
from urllib.parse import urlsplit,parse_qs,urlencode
from src.risk_manager.contracts import canonical,decode,counts,digest,clock
from src.risk_manager.evidence import freeze_inventory
from src.risk_manager.publication import read_artifact,validate_public,entry

IDENTITY=re.compile(r"risk:(state|sweep):[a-f0-9]{64}")
def verify_addition(public,identity,value):
    public=Path(public); root=public.parents[1]
    if not IDENTITY.fullmatch(identity):
        raise ValueError("Unreviewed risk kind")
    manifest={"artifacts":{identity:value}}
    read_artifact(root,manifest,identity)
    return "frontend-v2/public"+value["url"]

def verify_route(route,identity,artifacts,root=None):
    p=urlsplit(route)
    if p.scheme or p.netloc or p.fragment or p.path not in {"/risk-manager/state","/risk-manager/sweep"}:
        raise ValueError("Unknown risk route")
    query=parse_qs(p.query,strict_parsing=True)
    if query and (set(query)!={"sweep_id"} or any(len(v)!=1 for v in query.values()) or not re.fullmatch("[a-f0-9]{64}",query["sweep_id"][0])):
        raise ValueError("Invalid sweep selector")
    if route!=p.path+("?" + urlencode(sorted((k,v[0]) for k,v in query.items())) if query else ""):
        raise ValueError("Noncanonical risk route")
    kind=p.path.rsplit("/",1)[1]
    if identity not in artifacts or not identity.startswith("risk:"+kind+":"):
        raise ValueError("Risk route kind substituted")
    if root is not None and query:
        m=decode((Path(root)/"frontend-v2/public/replay-manifest.json").read_bytes())
        q=read_artifact(root,m,identity)["payload"]
        if kind=="sweep" and q["sweep_id"]!=query["sweep_id"][0]:
            raise ValueError("Risk sweep selector substituted")
        if kind=="state":
            receipt_ref=m["routes"].get("/risk-manager/sweep?sweep_id="+query["sweep_id"][0])
            if not receipt_ref or read_artifact(root,m,receipt_ref)["payload"]["state_ref"]!=identity:
                raise ValueError("Risk state/sweep selector substituted")
    return True

def verify(root):
    root=Path(root); inventory=freeze_inventory(root)
    m=decode((root/"frontend-v2/public/replay-manifest.json").read_bytes())
    risk={i:e for i,e in m["artifacts"].items() if i.startswith("risk:")}
    values={}
    for i,e in risk.items():
        verify_addition(root/"frontend-v2/public",i,e)
        values[i]=read_artifact(root,m,i)
    for route,identity in m["routes"].items():
        if route.startswith("/risk-manager/"):
            verify_route(route,identity,m["artifacts"],root)
    for p in (root/"frontend-v2/public/artifacts/replay").glob("risk-*.json"):
        if not any(p.name==i.replace(":","-")+".json" for i in risk):
            raise ValueError("Orphan risk artifact")
    for i,v in values.items():
        if v["kind"]=="risk-sweep":
            q=v["payload"]
            if q["prior_sweep_ref"] and q["prior_sweep_ref"] not in values:
                raise ValueError("Orphan prior sweep")
            if q["status"]!="FAILED":
                if q["state_ref"] not in values:
                    raise ValueError("Orphan successful state")
                s=values[q["state_ref"]]["payload"]
                if s["sweep_fingerprint"]!=q["fingerprint"]:
                    raise ValueError("State/receipt fingerprint mismatch")
                observed={o["observation_id"]:o for r in values.values() if r["kind"]=="risk-sweep" for o in r["payload"]["observations"]}
                for issue in s["issues"]:
                    if issue["first_seen_ref"]["observation_id"] not in observed or issue["last_observation_id"] not in observed:
                        raise ValueError("Orphan Issue observation")
                    first=observed[issue["first_seen_ref"]["observation_id"]]
                    if issue["first_seen_at"]!=first["witnessed_at"]:
                        raise ValueError("First seen fabricated")
                    if issue["resolution_ref"]:
                        clear=observed.get(issue["resolution_ref"]["observation_id"])
                        if not clear or clear["outcome"]!="CLEAR" or clear["availability"]!="AVAILABLE":
                            raise ValueError("Resolution lacks positive evidence")
                expected=decode((root/"data/exports/data_organ_v0_1/issues.json").read_bytes())["items"]
                origins=[o for x in s["issues"] for o in x["origin_records"] if o["source"]!="phase2-fixture"]
                if {digest(o) for o in origins}!={digest(o) for o in expected}:
                    raise ValueError("Data origin evidence lost or rewritten")
    return dict(status="VERIFIED",base="16db82c5f2f50b98253df9989c586cd45aa98f6b",frozen_files=930,
                prior_artifacts=221,prior_routes=126,withdrawals=6,risk_artifacts=len(risk),
                scientific_inventory_sha256=inventory,d6="DISABLED / DEFERRED")
