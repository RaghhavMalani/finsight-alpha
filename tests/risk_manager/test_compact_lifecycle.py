"""ENGINEERING_QA lifecycle capacity; all later publications live in tmp_path."""
from copy import deepcopy
from datetime import timedelta
from hashlib import sha256
import json
from pathlib import Path
import shutil

import pytest

from scripts.risk_archive import verify_graph
from src.risk_manager import sweep
from src.risk_manager.contracts import canonical, clock, counts, decode, digest
from src.risk_manager.publication import validate_public
from src.risk_manager.reducer import (
    checked_lifecycle_ids, lifecycle_anchors, lifecycle_history, reduce,
)
from test_monitoring import reseal

ROOT = Path(__file__).resolve().parents[2]


def retained_values(root=ROOT):
    manifest = decode((root / "frontend-v2/public/replay-manifest.json").read_bytes())
    values = {identity: decode((root / "frontend-v2/public" / entry["url"].lstrip("/")).read_bytes())
              for identity, entry in manifest["artifacts"].items() if identity.startswith("risk:")}
    return manifest, values


def receipt_chain(manifest, values):
    chain, seen = [], set()
    cursor = manifest["routes"]["/risk-manager/sweep"]
    while cursor:
        assert cursor not in seen
        seen.add(cursor)
        receipt = values[cursor]
        chain.append(receipt)
        cursor = receipt["payload"]["prior_sweep_ref"]
    return chain


def exact_origins(root, values):
    manifest = decode((root / "frontend-v2/public/replay-manifest.json").read_bytes())
    origins = {}
    for value in values.values():
        if value["kind"] != "risk-sweep" or value["payload"]["status"] == "FAILED":
            continue
        payload = value["payload"]
        source = next(i["input_id"] for i in payload["inputs"] if i["input_id"].startswith("data-organ:issues:"))
        entry = manifest["artifacts"][source]
        origins[payload["fingerprint"]] = decode((root / "frontend-v2/public" / entry["url"].lstrip("/")).read_bytes())["payload"]["items"]
    return origins


def isolated_retained(root):
    """Copy only admitted reader inputs and sealed Risk history, never raw inputs."""
    manifest, _ = retained_values()
    evidence = decode((ROOT / "eval/risk_manager/v0.1/evidence-map.json").read_bytes())
    paths = {"frontend-v2/public/replay-manifest.json", *sweep.SOURCE_FILES}
    paths.update(spec["path"] for spec in evidence["files"].values())
    paths.update("frontend-v2/public" + entry["url"] for identity, entry in manifest["artifacts"].items()
                 if identity.startswith(("risk:", "data-organ:")))
    paths.update("frontend-v2/public" + spec["entry"]["url"] for spec in evidence["artifacts"].values())
    paths.add("scripts/export_data_organ_replay.py")
    paths.update("src/data_organ/" + name + ".py" for name in (
        "adapters", "calendars", "contracts", "costs", "diagnostics", "lineage", "publication", "revisions", "service"))
    for relative in paths:
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    for relative in ("eval/risk_manager/v0.1", "data/exports/data_organ_v0_1"):
        shutil.copytree(ROOT / relative, root / relative)
    return manifest


def snapshot(root):
    paths = [root / "frontend-v2/public/replay-manifest.json"]
    for relative in ("data/exports/risk_manager_v0_1", "frontend-v2/public/artifacts/replay"):
        paths.extend(path for path in (root / relative).glob("*.json"))
    return {str(path.relative_to(root)): sha256(path.read_bytes()).hexdigest() for path in paths}


def test_exact_legacy_or_anchor_index_rejects_omission_injection_and_order():
    manifest, values = retained_values()
    state = values[manifest["routes"]["/risk-manager/state"]]
    history = lifecycle_history(receipt_chain(manifest, values))
    issue = next(i for i in state["payload"]["issues"] if len(i["observation_ids"]) >= 4)
    assert checked_lifecycle_ids(issue, history) == issue["observation_ids"]
    compact = dict(issue, observation_ids=lifecycle_anchors(issue))
    assert checked_lifecycle_ids(compact, history) == issue["observation_ids"]
    for ids in (issue["observation_ids"][:-1], list(reversed(issue["observation_ids"])),
                [*lifecycle_anchors(issue), "f" * 64], issue["observation_ids"][::2]):
        with pytest.raises(ValueError, match="lifecycle history"):
            checked_lifecycle_ids(dict(issue, observation_ids=ids), history)
    # The archive independently enforces the same full-or-exact-anchor contract.
    state["payload"]["issues"] = [dict(i, observation_ids=lifecycle_anchors(i)) for i in state["payload"]["issues"]]
    assert verify_graph(values, exact_origins(ROOT, values))
    target = next(i for i in state["payload"]["issues"] if i["issue_id"] == issue["issue_id"])
    target["observation_ids"] = issue["observation_ids"][:-1]
    with pytest.raises(ValueError, match="lifecycle history"):
        verify_graph(values, exact_origins(ROOT, values))


def test_hydrated_history_survives_repeat_resolution_and_reopen():
    manifest, values = retained_values()
    chain = receipt_chain(manifest, values)
    state = values[manifest["routes"]["/risk-manager/state"]]
    issue = deepcopy(next(i for i in state["payload"]["issues"] if i["rule_id"] == "R-MODEL-AGE" and i["asset"] == "IN-MKT"))
    all_observations = [o for receipt in chain for o in receipt["payload"]["observations"]]
    finding = deepcopy(next(o for o in all_observations if o["observation_id"] == issue["last_observation_id"]))
    issue["evidence_refs"] = deepcopy(finding["evidence_refs"])
    full = deepcopy(issue)
    issue["observation_ids"] = lifecycle_anchors(issue)
    issue["observation_ids"] = checked_lifecycle_ids(issue, lifecycle_history(chain))
    assert issue == full
    repeated, transitions = reduce([issue], [finding], "a" * 64, all_observations)
    assert repeated == [full] and transitions[0]["transition"] == "UNCHANGED"
    clear = deepcopy(finding)
    clear.update(outcome="CLEAR", reason_code=None, witnessed_at="2026-10-25T08:00:00Z")
    clear["evidence_refs"][0]["sha256"] = "b" * 64
    clear = sweep.seal_observation(clear)
    closed, transitions = reduce([full], [clear], "b" * 64, all_observations)
    assert closed[0]["status"] == "RESOLVED" and transitions[0]["transition"] == "RESOLVED"
    assert closed[0]["occurrences"] == full["occurrences"]
    repair = {"payload": {"observations": [clear], "transitions": transitions, "failure": None}}
    compact = dict(closed[0], observation_ids=lifecycle_anchors(closed[0]))
    compact["observation_ids"] = checked_lifecycle_ids(compact, lifecycle_history([repair, *chain]))
    assert compact == closed[0]
    reopen = deepcopy(finding)
    reopen.update(witnessed_at="2026-10-26T08:00:00Z")
    reopen["evidence_refs"][0]["sha256"] = "c" * 64
    reopen = sweep.seal_observation(reopen)
    opened, transitions = reduce([compact], [reopen], "c" * 64, [clear, *all_observations])
    assert transitions[0]["transition"] == "UPDATED" and opened[0]["status"] == "OPEN"
    assert opened[0]["first_seen_ref"] == full["first_seen_ref"]
    assert opened[0]["first_seen_at"] == full["first_seen_at"]
    assert opened[0]["occurrences"] == full["occurrences"] + 1
    assert opened[0]["observation_ids"] == [*full["observation_ids"], clear["observation_id"], reopen["observation_id"]]


def test_later_valid_epochs_keep_all_current_origins_and_repeat_with_zero_writes(tmp_path, monkeypatch):
    baseline = snapshot(ROOT)
    manifest = isolated_retained(tmp_path)
    # This fixture lacks the unrelated 930-file checkout. Check the actual frozen
    # inventory instead; no freeze rule is weakened in production.
    frozen = sweep.freeze_inventory(ROOT)
    monkeypatch.setattr(sweep, "freeze_inventory", lambda root: frozen)
    initial_state = decode((ROOT / "frontend-v2/public" /
                          manifest["artifacts"][manifest["routes"]["/risk-manager/state"]]["url"].lstrip("/")).read_bytes())
    initial_by_id = {i["issue_id"]: i for i in initial_state["payload"]["issues"]}
    current_data = decode((ROOT / "data/exports/data_organ_v0_1/issues.json").read_bytes())
    current_origins = current_data["items"]
    current_cutoff = manifest["artifacts"][manifest["routes"]["/data/issues"]]["as_of"]
    sizes = []
    for offset in (1, 2):
        epoch = (clock(current_cutoff) + timedelta(days=offset)).isoformat().replace("+00:00", "Z")
        witness = (clock(epoch) + timedelta(hours=2)).isoformat().replace("+00:00", "Z")
        origin_count = len(current_origins) + offset
        receipt = reseal(tmp_path, manifest, epoch=epoch, new_health=True)
        result = sweep.run(tmp_path, clock_fn=lambda: witness)
        assert result["status"] == "PARTIAL", result
        manifest, values = retained_values(tmp_path)
        state = values[manifest["routes"]["/risk-manager/state"]]
        origins = [o for i in state["payload"]["issues"] for o in i["origin_records"] if o["source"] != "phase2-fixture"]
        assert len(origins) == origin_count
        assert sorted(canonical(o) for o in origins) == sorted(canonical(o) for o in decode((tmp_path / "data/exports/data_organ_v0_1/issues.json").read_bytes())["items"])
        assert {i["issue_id"] for i in state["payload"]["issues"]} == set(initial_by_id)
        for issue in state["payload"]["issues"]:
            assert issue["observation_ids"] == lifecycle_anchors(issue)
            assert issue["first_seen_at"] == initial_by_id[issue["issue_id"]]["first_seen_at"]
            assert issue["first_seen_ref"] == initial_by_id[issue["issue_id"]]["first_seen_ref"]
        risk_sizes = [entry["bytes"] for identity, entry in manifest["artifacts"].items() if identity.startswith("risk:")]
        assert max(risk_sizes) <= 128 * 1024
        assert verify_graph(values, exact_origins(tmp_path, values))
        hydrated = sweep.previous(tmp_path, manifest)[2]
        history = lifecycle_history(receipt_chain(manifest, values))
        for issue in hydrated["payload"]["issues"]:
            assert issue["observation_ids"] == history[issue["issue_id"]]
            assert len(issue["observation_ids"]) > len(lifecycle_anchors(issue))
        before_repeat = snapshot(tmp_path)
        repeat_witness = (clock(witness) + timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        repeat = sweep.run(tmp_path, clock_fn=lambda: repeat_witness)
        assert repeat["status"] == "UNCHANGED" and repeat["writes"] == 0
        assert repeat["new_occurrences"] == 0 and repeat["manifest_rewrite"] is False
        assert set(repeat["transitions"].values()) == {0}
        assert snapshot(tmp_path) == before_repeat
        sizes.append({"origins": origin_count, "state_bytes": manifest["artifacts"][result["state_ref"]]["bytes"],
                      "sweep_bytes": manifest["artifacts"][result["sweep_ref"]]["bytes"], "repeat": "UNCHANGED / 0 writes"})
    assert snapshot(ROOT) == baseline
    print("ENGINEERING_QA " + json.dumps({"label": "temporary synthetic metadata only", "epochs": sizes}, sort_keys=True))


def sealed_value(value):
    raw = canonical(value) + b"\n"
    kind = "state" if value["kind"] == "risk-state" else "sweep"
    return "risk:" + kind + ":" + sha256(raw).hexdigest(), raw


def test_over_100_applied_observations_hydrate_reduce_archive_and_repeat_without_writes(monkeypatch):
    """A schema-valid sealed ENGINEERING_QA chain, with no publication or science."""
    baseline = snapshot(ROOT)
    manifest, retained = retained_values()
    original_state = retained[manifest["routes"]["/risk-manager/state"]]
    original_receipt = retained[manifest["routes"]["/risk-manager/sweep"]]
    leaf_ref = original_state["payload"]["evidence_index"][0]
    original_leaf = retained[leaf_ref["artifact_id"]]
    values, previous_issues, observations = {}, [], []
    prior_ref = prior_state_ref = None
    prior_receipt = None
    current_source_hash = sweep.evaluator_hash(ROOT)
    current_evidence = sweep.EvidenceReaders(ROOT).read()
    current_inputs = [current_evidence.inputs[key] for key in sorted(current_evidence.inputs)]
    cutoff = current_evidence.cutoff
    start = clock(cutoff) + timedelta(days=1)
    # Current Data can advance independently of the last sealed Risk state.
    # Derive fixture sources from this admitted epoch, as the public validator does.
    current_observations, current_coverage = sweep.evaluate(
        current_evidence, start.isoformat().replace("+00:00", "Z"))
    template = next(o for o in current_observations
                    if o["rule_id"] == "R-MODEL-AGE" and o["asset"] == "IN-MKT")
    original_leaf["payload"].update(
        coverage=[dict(row, evidence_refs=row["evidence_refs"][:1]) for row in current_coverage],
        evidence_index=list({digest(ref): ref for row in current_coverage for ref in row["evidence_refs"]}.values()))
    for index in range(103):
        witness = (start + timedelta(seconds=index)).isoformat().replace("+00:00", "Z")
        observation = deepcopy(template)
        observation.update(reason=f"ENGINEERING_QA lifecycle revision {index}.", witnessed_at=witness)
        observation = sweep.seal_observation(observation)
        source_hash = current_source_hash if index == 102 else digest(["ENGINEERING_QA", index])
        fingerprint = digest(dict(inputs=current_inputs,
                                  evaluation_cutoff=cutoff,
                                  policy_sha256=observation["policy_sha256"],
                                  evaluator_source_hash=source_hash, scope="RETAINED_RISK_EVIDENCE"))
        issues, transitions = reduce(previous_issues, [observation], fingerprint, observations)
        assert len(issues[0]["observation_ids"]) == index + 1
        if index:
            assert issues[0]["first_seen_ref"] == previous_issues[0]["first_seen_ref"]
        leaf = deepcopy(original_leaf)
        leaf.update(input_hash=fingerprint, evidence_cutoff=cutoff, published_at=witness)
        leaf["payload"].update(sweep_fingerprint=fingerprint, evaluation_cutoff=cutoff)
        for row in leaf["payload"]["coverage"]:
            row["evaluated_at"] = witness
        leaf["payload"]["state_id"] = digest({k: v for k, v in leaf["payload"].items() if k != "state_id"})
        leaf_id, leaf_raw = sealed_value(leaf)
        state = deepcopy(original_state)
        state.update(input_hash=fingerprint, evidence_cutoff=cutoff, published_at=witness)
        pointer = dict(type="RISK_OBSERVATION", observation_id=observation["observation_id"], sweep_fingerprint=fingerprint)
        public_issue = dict(issues[0], observation_ids=lifecycle_anchors(issues[0]), evidence_refs=[pointer])
        page = dict(leaf_ref, artifact_id=leaf_id, sha256=sha256(leaf_raw).hexdigest(), bytes=len(leaf_raw),
                    as_of=witness, available_at=witness)
        state["payload"].update(sweep_fingerprint=fingerprint, evaluation_cutoff=cutoff, issues=[public_issue], counts=counts(issues),
                                coverage=[], evidence_index=[page], historical_origin_counts=[], prior_state_ref=prior_state_ref)
        state["payload"]["state_id"] = digest({k: v for k, v in state["payload"].items() if k != "state_id"})
        state_id, state_raw = sealed_value(state)
        receipt = deepcopy(original_receipt)
        receipt.update(input_hash=fingerprint, evidence_cutoff=cutoff, published_at=witness)
        payload = receipt["payload"]
        history = [] if prior_receipt is None else [dict(sweep_id=prior_receipt["sweep_id"], sweep_ref=prior_ref,
            state_ref=prior_receipt["state_ref"], published_at=prior_receipt["published_at"], status=prior_receipt["status"]),
            *prior_receipt["history_index"][:19]]
        payload.update(sweep_id=digest(["risk-sweep/1", fingerprint, witness, state["payload"]["state_id"]]),
            fingerprint=fingerprint, prior_sweep_ref=prior_ref, state_ref=state_id, started_at=witness,
            completed_at=witness, published_at=witness, evaluator_source_hash=source_hash, inputs=current_inputs,
            evaluation_cutoff=cutoff,
            observations=[observation], transitions=transitions, history_index=history,
            transition_counts={k: sum(t["transition"] == k.upper() for t in transitions)
                               for k in ("new", "unchanged", "updated", "resolved")})
        receipt_id, receipt_raw = sealed_value(receipt)
        assert max(len(leaf_raw), len(state_raw), len(receipt_raw)) <= 128 * 1024
        values.update({leaf_id: leaf, state_id: state, receipt_id: receipt})
        previous_issues, observations = issues, [*observations, observation]
        prior_ref, prior_state_ref, prior_receipt = receipt_id, state_id, payload
    # Both bounded public schema and complete graph validation remain in force.
    validate_public(leaf, ROOT)
    validate_public(state, ROOT, staged={leaf_id: (leaf, leaf_raw)})
    validate_public(receipt, ROOT)
    assert verify_graph(values, [])
    synthetic_manifest = dict(routes={"/risk-manager/state": state_id, "/risk-manager/sweep": receipt_id})
    original_read = sweep.read_artifact
    monkeypatch.setattr(sweep, "read_artifact", lambda root, selected, identity:
                        values[identity] if identity in values else original_read(root, selected, identity))
    hydrated = sweep.previous(ROOT, synthetic_manifest)
    assert hydrated[2]["payload"]["issues"][0]["observation_ids"] == [o["observation_id"] for o in observations]
    assert hydrated[2]["payload"]["issues"][0]["occurrences"] == 103
    again, transitions = reduce(hydrated[2]["payload"]["issues"], [observations[-1]],
                                fingerprint, hydrated[4])
    assert again == previous_issues and transitions[0]["transition"] == "UNCHANGED"
    monkeypatch.setattr(sweep, "previous", lambda root, selected: deepcopy(hydrated))
    repeat_witness = (start + timedelta(hours=1)).isoformat().replace("+00:00", "Z")
    repeat = sweep.run(ROOT, clock_fn=lambda: repeat_witness, publish_artifacts=False)
    assert repeat["status"] == "UNCHANGED" and repeat["writes"] == 0
    assert repeat["new_occurrences"] == 0 and repeat["manifest_rewrite"] is False
    assert snapshot(ROOT) == baseline


def test_system_failure_recover_reopen_recover_and_consecutive_failure_chain(tmp_path, monkeypatch):
    baseline = snapshot(ROOT)
    manifest = isolated_retained(tmp_path)
    frozen = sweep.freeze_inventory(ROOT)
    monkeypatch.setattr(sweep, "freeze_inventory", lambda root: frozen)
    actual_read = sweep.EvidenceReaders.read
    attempts = []

    def fail(evidence):
        raise FileNotFoundError("ENGINEERING_QA retained reader fault")

    def run_at(witness, failure=False):
        monkeypatch.setattr(sweep.EvidenceReaders, "read", fail if failure else actual_read)
        result = sweep.run(tmp_path, clock_fn=lambda: witness, failure_sink=attempts.append)
        assert result["status"] == ("FAILED" if failure else "PARTIAL"), result
        selected, values = retained_values(tmp_path)
        assert selected["routes"]["/risk-manager/sweep"] in values
        assert verify_graph(values, exact_origins(tmp_path, values))
        return result, selected, values

    failed, manifest, values = run_at("2026-10-26T08:00:00Z", failure=True)
    first = deepcopy(attempts[-1]["payload"]["failure"]["issue"])
    identity = first["issue_id"]
    assert first["status"] == "OPEN" and first["occurrences"] == 1
    repaired, manifest, values = run_at("2026-10-26T08:01:00Z")
    resolved = next(i for i in values[repaired["state_ref"]]["payload"]["issues"] if i["issue_id"] == identity)
    assert resolved["status"] == "RESOLVED" and resolved["occurrences"] == 1
    # Old failed witnesses must not resurrect a successfully resolved incident.
    old = next(i for i in sweep.previous(tmp_path, manifest)[2]["payload"]["issues"] if i["issue_id"] == identity)
    assert old["status"] == "RESOLVED"
    reopened, manifest, values = run_at("2026-10-26T08:02:00Z", failure=True)
    reopened_issue = attempts[-1]["payload"]["failure"]["issue"]
    assert reopened["state_ref"] == repaired["state_ref"]
    assert reopened_issue["occurrences"] == 2 and reopened_issue["status"] == "OPEN"
    assert reopened_issue["first_seen_ref"] == first["first_seen_ref"]
    assert reopened_issue["first_seen_at"] == first["first_seen_at"]
    hydrated = next(i for i in sweep.previous(tmp_path, manifest)[2]["payload"]["issues"] if i["issue_id"] == identity)
    assert hydrated["status"] == "OPEN" and hydrated["last_observation_id"] == reopened_issue["last_observation_id"]
    assert len(hydrated["observation_ids"]) == 3
    # A second failed attempt keeps the entire ordered chain and newest witness.
    failed_again, manifest, values = run_at("2026-10-26T08:03:00Z", failure=True)
    latest = attempts[-1]["payload"]["failure"]["issue"]
    assert latest["occurrences"] == 3 and latest["observation_ids"] == lifecycle_anchors(latest)
    hydrated = next(i for i in sweep.previous(tmp_path, manifest)[2]["payload"]["issues"] if i["issue_id"] == identity)
    assert len(hydrated["observation_ids"]) == 4 and hydrated["last_observation_id"] == latest["last_observation_id"]
    final, manifest, values = run_at("2026-10-26T08:04:00Z")
    final_issue = next(i for i in values[final["state_ref"]]["payload"]["issues"] if i["issue_id"] == identity)
    assert final["transitions"]["resolved"] == 1 and final_issue["status"] == "RESOLVED"
    assert final_issue["occurrences"] == 3 and final_issue["first_seen_ref"] == first["first_seen_ref"]
    assert final_issue["first_seen_at"] == first["first_seen_at"]
    full_history = lifecycle_history(receipt_chain(manifest, values))
    assert len(checked_lifecycle_ids(final_issue, full_history)) == 5
    # Exact anchors with an older last witness are stale, including failures.
    stale = dict(latest, last_observation_id=first["last_observation_id"])
    stale["observation_ids"] = lifecycle_anchors(stale)
    with pytest.raises(ValueError, match="lifecycle history"):
        checked_lifecycle_ids(stale, full_history)
    failed_value = values[manifest["routes"]["/risk-manager/sweep"]]["payload"]["prior_sweep_ref"]
    failure = values[failed_value]["payload"]["failure"]
    failure["issue"]["last_observation_id"] = first["last_observation_id"]
    failure["issue"]["observation_ids"] = lifecycle_anchors(failure["issue"])
    with pytest.raises(ValueError, match="lifecycle history|Failure lifecycle witness"):
        verify_graph(values, exact_origins(tmp_path, values))
    assert snapshot(ROOT) == baseline
