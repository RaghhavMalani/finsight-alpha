"""Pure stable Issue reduction. Missing/failed evidence never resolves."""
from copy import deepcopy
from .contracts import CLAIMS, Issue, Observation, identity, digest

def observation_ref(observation, sweep_fingerprint):
    return {"type":"RISK_OBSERVATION","observation_id":observation["observation_id"],"sweep_fingerprint":sweep_fingerprint}

def reduce(previous, observations, sweep_fingerprint, previous_observations=()):
    issues = {i["issue_id"]:deepcopy(i) for i in previous}
    old_observations = {o["observation_id"]:o for o in previous_observations}
    transitions = []
    for incoming in sorted(observations, key=lambda o:o["issue_id"]):
        o = Observation.model_validate(incoming).model_dump(mode="json")
        if o["issue_id"] != identity(o):
            raise ValueError("Issue identity substitution")
        old = issues.get(o["issue_id"])
        last = old_observations.get(old["last_observation_id"]) if old else None
        transition = "UNCHANGED"
        if old is None and o["outcome"] != "CLEAR":
            fields = {k:o[k] for k in ("issue_id","rule_id","rule_version","category","severity","currency",
                "availability","evidence_class","scope","country","asset","model","title","reason_code","reason",
                "evidence_at","evidence_cutoff","evidence_refs","source_quality","remediation","origin_records","policy_sha256")}
            old = dict(schema_version="risk-issue/1",**fields,status="OPEN",first_seen_at=o["witnessed_at"],
                first_seen_ref=observation_ref(o,sweep_fingerprint),resolved_at=None,resolution_ref=None,
                occurrences=1,observation_ids=[o["observation_id"]],claim_flags=dict(CLAIMS),last_observation_id=o["observation_id"])
            issues[o["issue_id"]] = old
            transition = "NEW"
        elif old and last and last["fingerprint"] == o["fingerprint"]:
            pass
        elif old and o["outcome"] == "CLEAR":
            complete = o["availability"] == "AVAILABLE" and o["currency"] == "CURRENT"
            same_policy = old["policy_sha256"] == o["policy_sha256"]
            changed_evidence = last is not None and digest(last["evidence_refs"]) != digest(o["evidence_refs"])
            if complete and same_policy and changed_evidence and old["status"] == "OPEN":
                old.update(status="RESOLVED",resolved_at=o["witnessed_at"],resolution_ref=observation_ref(o,sweep_fingerprint),
                           last_observation_id=o["observation_id"],evidence_at=o["evidence_at"],evidence_cutoff=o["evidence_cutoff"])
                old["observation_ids"].append(o["observation_id"])
                transition = "RESOLVED"
        elif old and o["outcome"] != "CLEAR":
            # Availability loss must not replace a real incident by a different condition.
            if o["outcome"] == "FINDING" and o["currency"] != "UNCONFIRMED":
                old.update({k:o[k] for k in ("severity","currency","availability","reason_code","reason","evidence_at",
                    "evidence_cutoff","evidence_refs","source_quality","remediation","origin_records","policy_sha256")})
                old.update(status="OPEN",resolved_at=None,resolution_ref=None,last_observation_id=o["observation_id"])
                if o["observation_id"] not in old["observation_ids"]:
                    old["observation_ids"].append(o["observation_id"])
                    old["occurrences"] += 1
                transition = "UPDATED"
            elif old["evidence_class"] == "UNAVAILABLE" and (last is None or last["fingerprint"] != o["fingerprint"]):
                old.update(reason=o["reason"],evidence_at=o["evidence_at"],evidence_cutoff=o["evidence_cutoff"],evidence_refs=o["evidence_refs"],policy_sha256=o["policy_sha256"],
                           last_observation_id=o["observation_id"])
                old["observation_ids"].append(o["observation_id"])
                old["occurrences"] += 1
                transition = "UPDATED"
        if old:
            Issue.model_validate(old)
            transitions.append(dict(issue_id=o["issue_id"],transition=transition,observation_id=o["observation_id"],
                previous_observation_id=last["observation_id"] if last else None,at=o["witnessed_at"]))
    return [issues[k] for k in sorted(issues)], transitions
