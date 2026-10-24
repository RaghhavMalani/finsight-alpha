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
            # The internal list is hydrated from sealed receipts and can exceed
            # the public schema bound. Validate the exact bounded public index.
            checked_lifecycle_ids(old, {old["issue_id"]: old["observation_ids"]})
            Issue.model_validate(dict(old, observation_ids=lifecycle_anchors(old)))
            transitions.append(dict(issue_id=o["issue_id"],transition=transition,observation_id=o["observation_id"],
                previous_observation_id=last["observation_id"] if last else None,at=o["witnessed_at"]))
    return [issues[k] for k in sorted(issues)], transitions


def lifecycle_anchors(issue):
    """Canonical state index; complete ordered history belongs to sealed receipts."""
    refs = [issue["first_seen_ref"]["observation_id"], issue["last_observation_id"]]
    if issue["resolution_ref"]:
        refs.append(issue["resolution_ref"]["observation_id"])
    return list(dict.fromkeys(refs))


def lifecycle_history(receipts):
    """Rebuild applied lifecycle IDs from one reachable newest-first receipt chain.

    Unapplied CLEAR and UNCHANGED observations are deliberately excluded. A
    failed receipt adds its witnessed System incident without replacing a state.
    """
    history = {}
    for receipt in reversed(receipts):
        payload = receipt["payload"]
        observations = {o["observation_id"]: o for o in payload["observations"]}
        if len(observations) != len(payload["observations"]):
            raise ValueError("Duplicate lifecycle observation")
        if payload["failure"]:
            issue = payload["failure"]["issue"]
            observation = observations.get(issue["last_observation_id"])
            if not observation or observation["issue_id"] != issue["issue_id"] or observation["outcome"] != "FINDING":
                raise ValueError("Failure lifecycle witness missing or substituted")
            ids = history.setdefault(issue["issue_id"], [])
            if observation["observation_id"] not in ids:
                ids.append(observation["observation_id"])
            checked_lifecycle_ids(issue, history)
        for transition in payload["transitions"]:
            observation = observations.get(transition["observation_id"])
            if not observation or observation["issue_id"] != transition["issue_id"]:
                raise ValueError("Lifecycle transition witness missing or substituted")
            kind = transition["transition"]
            if kind == "UNCHANGED":
                continue
            issue_id = transition["issue_id"]
            if kind == "NEW":
                if issue_id in history or observation["outcome"] == "CLEAR":
                    raise ValueError("Lifecycle creation duplicated or cleared")
                history[issue_id] = []
            elif kind not in {"UPDATED", "RESOLVED"} or issue_id not in history:
                raise ValueError("Orphan lifecycle transition")
            if kind == "RESOLVED" and (observation["outcome"], observation["availability"], observation["currency"]) != ("CLEAR", "AVAILABLE", "CURRENT"):
                raise ValueError("Lifecycle resolution lacks positive complete evidence")
            if kind == "UPDATED" and observation["outcome"] == "CLEAR":
                raise ValueError("Lifecycle update substituted a clearing observation")
            ids = history[issue_id]
            if observation["observation_id"] not in ids:
                ids.append(observation["observation_id"])
    return history


def checked_lifecycle_ids(issue, history):
    """Accept exact legacy history or its exact anchors; never arbitrary subsets."""
    expected = history.get(issue["issue_id"])
    anchors = lifecycle_anchors(issue)
    if (not expected or len(set(expected)) != len(expected)
            or expected[0] != issue["first_seen_ref"]["observation_id"]
            or expected[-1] != issue["last_observation_id"]
            or any(value not in expected for value in anchors)
            or issue["observation_ids"] not in (expected, anchors)):
        raise ValueError("Issue lifecycle history omitted, reordered or substituted")
    return list(expected)
