"""Narrow two-kind risk extension; old manifest subsets remain frozen."""
from collections import Counter
from pathlib import Path
import re
from urllib.parse import urlsplit, parse_qs, urlencode
from src.risk_manager.contracts import decode, digest, clock
from src.risk_manager.evidence import freeze_inventory
from src.risk_manager.reducer import lifecycle_history,checked_lifecycle_ids
from src.risk_manager.publication import read_artifact,source_observation,validate_observation_sources

IDENTITY = re.compile(r"risk:(state|sweep):[a-f0-9]{64}")
CATEGORIES = {"DATA", "MODEL", "RESEARCH_HYGIENE", "PORTFOLIO", "SIMULATOR", "SYSTEM"}


def verify_addition(public, identity, value):
    public = Path(public)
    root = public.parents[1]
    if not IDENTITY.fullmatch(identity):
        raise ValueError("Unreviewed risk kind")
    read_artifact(root, {"artifacts": {identity: value}}, identity)
    return "frontend-v2/public" + value["url"]


def verify_route(route, identity, artifacts, root=None):
    parts = urlsplit(route)
    if parts.scheme or parts.netloc or parts.fragment or parts.path not in {"/risk-manager/state", "/risk-manager/sweep"}:
        raise ValueError("Unknown risk route")
    query = parse_qs(parts.query, strict_parsing=True, keep_blank_values=True)
    if query and (set(query) != {"sweep_id"} or any(len(v) != 1 for v in query.values())
                  or not re.fullmatch("[a-f0-9]{64}", query["sweep_id"][0])):
        raise ValueError("Invalid sweep selector")
    canonical_route = parts.path + ("?" + urlencode(sorted((k, v[0]) for k, v in query.items())) if query else "")
    if route != canonical_route:
        raise ValueError("Noncanonical risk route")
    kind = parts.path.rsplit("/", 1)[1]
    if identity not in artifacts or not identity.startswith("risk:" + kind + ":"):
        raise ValueError("Risk route kind substituted")
    if root is not None and query:
        manifest = decode((Path(root) / "frontend-v2/public/replay-manifest.json").read_bytes())
        payload = read_artifact(root, manifest, identity)["payload"]
        if kind == "sweep" and payload["sweep_id"] != query["sweep_id"][0]:
            raise ValueError("Risk sweep selector substituted")
        if kind == "state":
            receipt_ref = manifest["routes"].get("/risk-manager/sweep?sweep_id=" + query["sweep_id"][0])
            if not receipt_ref or read_artifact(root, manifest, receipt_ref)["payload"]["state_ref"] != identity:
                raise ValueError("Risk state/sweep selector substituted")
    return True


def verify_graph(values, expected_origins):
    """Check immutable cross joins; no current evaluator hash is imposed on history."""
    states = {key: value for key, value in values.items() if value["kind"] == "risk-state"}
    receipts = {key: value for key, value in values.items() if value["kind"] == "risk-sweep"}
    validate_observation_sources(receipts.values())
    observations = {}
    observations_by_id = {}
    for identity, value in receipts.items():
        payload = value["payload"]
        for observation in payload["observations"]:
            pair = (payload["fingerprint"], observation["observation_id"])
            # Operational recovery can publish the same evaluator fingerprint.
            # Observation content excludes witness clocks, so retain every actual witness.
            observations.setdefault(pair, []).append(observation)
            observations_by_id.setdefault(observation["observation_id"], []).append(observation)

    def observation_ref(ref, issue_id, witness):
        candidates = observations.get((ref["sweep_fingerprint"], ref["observation_id"]), [])
        observation = next((o for o in candidates if o["issue_id"] == issue_id and o["witnessed_at"] == witness), None)
        if not observation:
            raise ValueError("Issue observation reference or witness substituted")
        return observation

    def verify_observation_refs(refs, subject=None):
        for ref in refs:
            if ref["type"] != "RISK_OBSERVATION":
                continue
            candidates = observations.get((ref["sweep_fingerprint"], ref["observation_id"]), [])
            if not candidates:
                raise ValueError("Orphan risk evidence reference")
            if subject and subject["outcome"] == "CLEAR" and subject["category"] == "SYSTEM":
                if not any(o["issue_id"] == subject["issue_id"] and o["outcome"] == "FINDING"
                           and o["observation_id"] == subject["previous_observation_id"]
                           and clock(o["witnessed_at"]) < clock(subject["witnessed_at"]) for o in candidates):
                    raise ValueError("System repair evidence is incompatible with its failed predecessor")

    for state_value in states.values():
        state = state_value["payload"]
        verify_observation_refs(state["evidence_index"])
        for issue in state["issues"]:
            verify_observation_refs(issue["evidence_refs"])
        for row in state["coverage"]:
            verify_observation_refs(row["evidence_refs"])
    for receipt_value in receipts.values():
        receipt = receipt_value["payload"]
        for observation in receipt["observations"]:
            verify_observation_refs(observation["evidence_refs"], observation)
        if receipt["failure"]:
            verify_observation_refs(receipt["failure"]["issue"]["evidence_refs"])

    def lifecycle(issue):
        first = observation_ref(issue["first_seen_ref"], issue["issue_id"], issue["first_seen_at"])
        if issue["first_seen_at"] != first["witnessed_at"]:
            raise ValueError("First seen fabricated")
        for observation_id in issue["observation_ids"]:
            candidates = observations_by_id.get(observation_id, [])
            if not any(o["issue_id"] == issue["issue_id"] for o in candidates):
                raise ValueError("Orphan Issue observation")
        if issue["resolution_ref"]:
            clear = observation_ref(issue["resolution_ref"], issue["issue_id"], issue["resolved_at"])
            if (clear["outcome"], clear["availability"], clear["currency"]) != ("CLEAR", "AVAILABLE", "CURRENT"):
                raise ValueError("Resolution lacks positive complete evidence")
            if issue["resolved_at"] != clear["witnessed_at"] or issue["policy_sha256"] != clear["policy_sha256"]:
                raise ValueError("Resolution clock/policy substituted")
            prior = [o for candidates in observations_by_id.values() for o in candidates
                     if o["issue_id"] == issue["issue_id"] and o["outcome"] != "CLEAR"
                     and o["policy_sha256"] == clear["policy_sha256"]
                     and clock(o["witnessed_at"]) < clock(clear["witnessed_at"])]
            if not any(digest(o["evidence_refs"]) != digest(clear["evidence_refs"]) for o in prior):
                raise ValueError("Resolution lacks changed compatible evidence")

    used_states = set()
    for identity, value in receipts.items():
        payload = value["payload"]
        cursor = identity
        visited = set()
        chain = []
        while cursor:
            if cursor in visited:
                raise ValueError("Risk history cycle")
            visited.add(cursor)
            parent = receipts.get(cursor)
            if not parent:
                raise ValueError("Orphan prior sweep")
            chain.append(parent)
            cursor = parent["payload"]["prior_sweep_ref"]
        full_history = lifecycle_history(chain)
        if len({h["sweep_ref"] for h in payload["history_index"]}) != len(payload["history_index"]):
            raise ValueError("Duplicate history entry")
        for index, history in enumerate(payload["history_index"]):
            parent = receipts.get(history["sweep_ref"])
            if not parent:
                raise ValueError("Orphan history entry")
            parent_payload = parent["payload"]
            expected = dict(sweep_id=parent_payload["sweep_id"], sweep_ref=history["sweep_ref"],
                            state_ref=parent_payload["state_ref"], published_at=parent_payload["published_at"],
                            status=parent_payload["status"])
            if history != expected:
                raise ValueError("History entry substituted")
            if index == 0 and history["sweep_ref"] != payload["prior_sweep_ref"]:
                raise ValueError("History first parent substituted")
            if index and receipts[payload["history_index"][index - 1]["sweep_ref"]]["payload"]["prior_sweep_ref"] != history["sweep_ref"]:
                raise ValueError("History chain substituted")
        if payload["prior_sweep_ref"]:
            prior = receipts[payload["prior_sweep_ref"]]["payload"]
            if clock(prior["published_at"]) > clock(payload["started_at"]):
                raise ValueError("Sweep predates its parent")
        if payload["status"] == "FAILED":
            if payload["failure"]["last_valid_state_ref"] != payload["state_ref"]:
                raise ValueError("Failure changed the last valid state")
            if payload["state_ref"] is not None and payload["state_ref"] not in states:
                raise ValueError("Failure lost the last valid state")
            if payload["state_ref"] is not None:
                used_states.add(payload["state_ref"])
            lifecycle(payload["failure"]["issue"])
            checked_lifecycle_ids(payload["failure"]["issue"],full_history)
            continue
        state_value = states.get(payload["state_ref"])
        if not state_value:
            raise ValueError("Orphan successful state")
        state = state_value["payload"]
        used_states.add(payload["state_ref"])
        if (state["sweep_fingerprint"], state["evaluation_cutoff"], state_value["published_at"]) != (
                payload["fingerprint"], payload["evaluation_cutoff"], payload["published_at"]):
            raise ValueError("State/receipt fingerprint or clocks mismatch")
        if payload["sweep_id"] != digest(["risk-sweep/1", payload["fingerprint"], payload["started_at"], state["state_id"]]):
            raise ValueError("Successful sweep identity substituted")
        expected_prior = receipts[payload["prior_sweep_ref"]]["payload"]["state_ref"] if payload["prior_sweep_ref"] else None
        if state["prior_state_ref"] != expected_prior:
            raise ValueError("State parent does not bind prior successful state")
        if state["coverage"] and (len(state["coverage"]) != 6 or {c["category"] for c in state["coverage"]} != CATEGORIES):
            raise ValueError("Primary category coverage missing or duplicated")
        pages = [ref for ref in state["evidence_index"] if ref.get("selector_id") == "risk_coverage"]
        if len(pages) != 1 or len(state["evidence_index"]) != 1:
            raise ValueError("Primary coverage leaf substituted")
        ref = pages[0]
        used_states.add(ref["artifact_id"])
        page = states.get(ref["artifact_id"])
        if not page or page["payload"]["sweep_fingerprint"] != payload["fingerprint"]:
            raise ValueError("Coverage leaf belongs to another sweep")
        if page["payload"]["issues"] or page["payload"]["prior_state_ref"] or page["payload"]["historical_origin_counts"]:
            raise ValueError("Coverage leaf is not bounded metadata")
        if {row["category"] for row in page["payload"]["coverage"]}!=CATEGORIES:
            raise ValueError("Sealed leaf category coverage missing")
        if len({row["check_id"] for row in page["payload"]["coverage"]}) != len(page["payload"]["coverage"]):
            raise ValueError("Duplicate coverage check")
        if any(c not in page["payload"]["coverage"] for c in state["coverage"]):
            raise ValueError("Primary summary substituted")
        for issue in state["issues"]:
            lifecycle(issue)
            checked_lifecycle_ids(issue,full_history)
            source_observation(issue,value)
        origins = [origin for issue in state["issues"] for origin in issue["origin_records"]
                   if origin["source"] != "phase2-fixture"]
        if Counter(digest(o) for o in origins) != Counter(digest(o) for o in (expected_origins[payload["fingerprint"]] if isinstance(expected_origins,dict) else expected_origins)):
            raise ValueError("Data origin evidence lost, duplicated or rewritten")
    if used_states != set(states):
        raise ValueError("Unreferenced risk state in public namespace")
    return True


def _verify(root):
    root = Path(root)
    inventory = freeze_inventory(root)
    manifest = decode((root / "frontend-v2/public/replay-manifest.json").read_bytes())
    risk = {identity: entry for identity, entry in manifest["artifacts"].items() if identity.startswith("risk:")}
    values = {}
    for identity, entry in risk.items():
        verify_addition(root / "frontend-v2/public", identity, entry)
        values[identity] = read_artifact(root, manifest, identity)
    for route, identity in manifest["routes"].items():
        if route.startswith("/risk-manager/"):
            verify_route(route, identity, manifest["artifacts"], root)
    for path in (root / "frontend-v2/public/artifacts/replay").glob("risk-*.json"):
        if not any(path.name == identity.replace(":", "-") + ".json" for identity in risk):
            raise ValueError("Orphan risk artifact")
    from src.risk_manager.monitoring import read_data
    expected = {}
    for value in values.values():
        if value["kind"]!="risk-sweep" or value["payload"]["status"]=="FAILED":
            continue
        receipt=value["payload"]
        origins=[item for item in receipt["inputs"] if item["input_id"].startswith("data-organ:issues:")]
        if len(origins)!=1:
            raise ValueError("Historical sweep lacks its exact Data issues input")
        expected[receipt["fingerprint"]]=read_data(root,manifest,origins[0]["input_id"],expected_kind="issues")["payload"]["items"]
    verify_graph(values, expected)
    latest = manifest["routes"].get("/risk-manager/sweep")
    latest_state = manifest["routes"].get("/risk-manager/state")
    if latest and values[latest]["payload"]["state_ref"] != latest_state:
        raise ValueError("Latest receipt/state route pair substituted")
    reachable = set()
    cursor = latest
    while cursor:
        if cursor in reachable:
            raise ValueError("Latest sweep history cycle")
        reachable.add(cursor)
        cursor = values[cursor]["payload"]["prior_sweep_ref"]
    if reachable != {key for key, value in values.items() if value["kind"] == "risk-sweep"}:
        raise ValueError("Unreferenced risk receipt in public namespace")
    return dict(status="VERIFIED", base="16db82c5f2f50b98253df9989c586cd45aa98f6b", frozen_files=930,
                prior_artifacts=221, prior_routes=126, withdrawals=6, risk_artifacts=len(risk),
                scientific_inventory_sha256=inventory, d6="DISABLED / DEFERRED")


def verify(root):
    from src.risk_manager.monitoring import monitoring_operation
    with monitoring_operation():
        return _verify(root)
