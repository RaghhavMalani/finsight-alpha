"""ENGINEERING_QA policy binding; only in-memory copies of retained metadata."""
from copy import deepcopy
from datetime import timedelta
from hashlib import sha256
from pathlib import Path

import pytest

from src.risk_manager.contracts import canonical, clock, decode, digest
from src.risk_manager.evidence import forbidden_calls
from src.risk_manager.publication import LIMIT, validate_public

ROOT=Path(__file__).resolve().parents[2]


def reseal(state):
    payload=state["payload"]
    payload["state_id"]=digest({key:value for key,value in payload.items() if key!="state_id"})
    return state


@pytest.fixture
def retained_policy():
    manifest_raw=(ROOT/"frontend-v2/public/replay-manifest.json").read_bytes()
    manifest=decode(manifest_raw)
    # Immutable legacy fixture stays full even after a future compact publication.
    identity="risk:state:70ac82fde3f0f115fa4eda0beda7451f1b4d17bbecf260fd1e5534f761a2be0f"
    state=decode((ROOT/("frontend-v2/public"+manifest["artifacts"][identity]["url"])).read_bytes())
    ref=state["payload"]["evidence_index"][0]
    page_raw=(ROOT/("frontend-v2/public"+manifest["artifacts"][ref["artifact_id"]]["url"])).read_bytes()
    page=decode(page_raw)
    compact=deepcopy(state)
    compact["payload"]["policy"]["rules"]=[]
    reseal(compact)
    staged={ref["artifact_id"]:(page,page_raw)}
    before={key:sha256((ROOT/("frontend-v2/public"+entry["url"])).read_bytes()).hexdigest()
            for key,entry in manifest["artifacts"].items() if key.startswith("risk:")}
    yield state,compact,page,staged
    assert (ROOT/"frontend-v2/public/replay-manifest.json").read_bytes()==manifest_raw
    assert before=={key:sha256((ROOT/("frontend-v2/public"+manifest["artifacts"][key]["url"])).read_bytes()).hexdigest()
                    for key in before}


def checked(value,staged=None):
    with forbidden_calls():
        return validate_public(value,ROOT,staged=staged)


def bind_page(state,page):
    """Rebind every hash/length after tampering, so semantic checks must reject."""
    reseal(page)
    raw=canonical(page)+b"\n"
    hashed=sha256(raw).hexdigest()
    identity="risk:state:"+hashed
    ref=state["payload"]["evidence_index"][0]
    ref.update(artifact_id=identity,sha256=hashed,bytes=len(raw))
    reseal(state)
    return {identity:(page,raw)}


def test_compact_primary_preserves_every_issue_origin_and_complete_bound_policy(retained_policy):
    state,compact,page,staged=retained_policy
    _,legacy_raw=checked(state,staged)
    checked_state,raw=checked(compact,staged)
    assert LIMIT==128*1024 and len(raw)<LIMIT
    assert len(legacy_raw)-len(raw)>16*1024
    assert compact["payload"]["policy"]["rules"]==[]
    assert page["payload"]["policy"]==state["payload"]["policy"]
    assert checked_state["payload"]["issues"]==state["payload"]["issues"]
    assert [origin for issue in checked_state["payload"]["issues"] for origin in issue["origin_records"]]==[
        origin for issue in state["payload"]["issues"] for origin in issue["origin_records"]]
    unchanged=deepcopy(compact["payload"])
    unchanged["policy"]=state["payload"]["policy"]
    unchanged["state_id"]=state["payload"]["state_id"]
    assert unchanged==state["payload"]


@pytest.mark.parametrize("fault",["hash","version","schema","partial_rules","modified_rule","extra_field"])
def test_primary_policy_accepts_only_exact_full_or_bound_empty_projection(retained_policy,fault):
    state,compact,_,staged=retained_policy
    policy=compact["payload"]["policy"]
    if fault=="hash":policy["sha256"]="a"*64
    elif fault=="version":policy["version"]="0.2"
    elif fault=="schema":policy["schema_version"]="risk-policy/2"
    elif fault=="partial_rules":policy["rules"]=deepcopy(state["payload"]["policy"]["rules"][:-1])
    elif fault=="modified_rule":
        policy["rules"]=deepcopy(state["payload"]["policy"]["rules"])
        policy["rules"][0]["predicate"]+=" Changed."
    else:policy["unreviewed"]="UNKNOWN"
    reseal(compact)
    with pytest.raises(ValueError):checked(compact,staged)


@pytest.mark.parametrize("fault",["empty_rules","partial_rules","modified_rule","hash","version"])
def test_resealed_leaf_cannot_omit_or_change_any_reviewed_policy_rule(retained_policy,fault):
    _,compact,page,_=retained_policy
    policy=page["payload"]["policy"]
    if fault=="empty_rules":policy["rules"]=[]
    elif fault=="partial_rules":policy["rules"].pop()
    elif fault=="modified_rule":policy["rules"][0]["predicate"]+=" Changed."
    elif fault=="hash":policy["sha256"]="a"*64
    else:policy["version"]="0.2"
    staged=bind_page(compact,page)
    with pytest.raises(ValueError):checked(compact,staged)
    with pytest.raises(ValueError):checked(page)


@pytest.mark.parametrize("fault",["missing","duplicate","extra_ref","sha","bytes","epoch","nested_primary"])
def test_compact_primary_needs_one_exact_verified_full_policy_leaf(retained_policy,fault):
    state,compact,page,staged=retained_policy
    ref=compact["payload"]["evidence_index"][0]
    if fault=="missing":compact["payload"]["evidence_index"]=[]
    elif fault=="duplicate":compact["payload"]["evidence_index"].append(deepcopy(ref))
    elif fault=="extra_ref":
        extra=deepcopy(ref);extra["selector_id"]="arbitrary"
        compact["payload"]["evidence_index"].append(extra)
    elif fault=="sha":ref["sha256"]="a"*64
    elif fault=="bytes":ref["bytes"]+=1
    elif fault=="epoch":
        page["evidence_cutoff"]=(clock(page["evidence_cutoff"])+timedelta(seconds=1)).isoformat().replace("+00:00","Z")
        page["payload"]["evaluation_cutoff"]=page["evidence_cutoff"]
        staged=bind_page(compact,page)
    else:staged=bind_page(compact,deepcopy(state))
    reseal(compact)
    with pytest.raises((ValueError,FileNotFoundError)):checked(compact,staged)
