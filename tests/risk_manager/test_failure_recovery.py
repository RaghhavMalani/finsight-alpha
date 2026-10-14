"""Synthetic operational faults are exercised in memory or a temp namespace."""
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import pytest
from scripts.risk_archive import verify_graph
from src.risk_manager import sweep as s
from src.risk_manager.contracts import CLAIMS, canonical, decode
from src.risk_manager.publication import validate_public

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("fault", [FileNotFoundError, ValueError])
def test_untrusted_policy_never_authorizes_public_failure(monkeypatch, fault):
    before = (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes()
    def broken_policy(root):
        raise fault("SYNTHETIC_TEST_ONLY private error must never escape")
    monkeypatch.setattr(s, "load", broken_policy)
    attempts = []
    result = s.run(ROOT, publish_artifacts=False, failure_sink=attempts.append)
    assert result["status"] == "FAILED" and result["state_ref"] is None
    attempt = attempts[0]
    assert attempt["schema_version"] == "risk-local-failure/1"
    assert attempt["status"] == "FAILED" and attempt["public_publication"] == "UNAVAILABLE"
    assert attempt["claim_flags"] == CLAIMS
    assert "private error" not in canonical(attempt).decode()
    assert (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes() == before


def test_corrupt_manifest_retains_independent_sanitized_attempt(tmp_path):
    public = tmp_path / "frontend-v2/public"
    public.mkdir(parents=True)
    manifest = public / "replay-manifest.json"
    manifest.write_bytes(b'{"routes":')
    result = s.run(tmp_path, publish_artifacts=True)
    assert result["status"] == "FAILED"
    assert manifest.read_bytes() == b'{"routes":'
    attempts = list((tmp_path / "data/exports/risk_manager_v0_1/failures").glob("*.json"))
    assert len(attempts) == 1
    value = decode(attempts[0].read_bytes())
    assert value["schema_version"] == "risk-local-failure/1"
    assert value["public_publication"] == "UNAVAILABLE"
    assert not list(public.glob("artifacts/replay/risk-*.json"))


def test_system_failure_is_retained_until_positive_changed_repair(monkeypatch):
    before = (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes()
    monkeypatch.setattr(s, "previous", lambda root, manifest: (None, None, None, None, []))
    first = s.run(ROOT, publish_artifacts=False)
    assert first["status"] == "PARTIAL"
    first_receipt = first["receipt"]
    first_ref = "risk:sweep:" + sha256(canonical(first_receipt) + b"\n").hexdigest()
    initial_observations = first_receipt["payload"]["observations"]
    monkeypatch.setattr(s, "previous", lambda root, manifest: (
        first["state_ref"], first_ref, first["state"], first_receipt, initial_observations))
    actual_inventory = s.freeze_inventory
    def reader_failure(root):
        raise FileNotFoundError("SYNTHETIC_TEST_ONLY retained-reader fault")
    monkeypatch.setattr(s, "freeze_inventory", reader_failure)
    attempts = []
    failed = s.run(ROOT, publish_artifacts=False, failure_sink=attempts.append)
    failure_receipt = attempts[0]
    assert failed["status"] == "FAILED" and failed["state_ref"] == first["state_ref"]
    assert failure_receipt["payload"]["transition_counts"]["resolved"] == 0
    failure_issue = failure_receipt["payload"]["failure"]["issue"]
    failure_ref = "risk:sweep:" + sha256(canonical(failure_receipt) + b"\n").hexdigest()
    validate_public(failure_receipt, ROOT)
    # Availability loss cannot erase the earlier successful feed.
    old = deepcopy(first["state"])
    old["payload"]["issues"].append(failure_issue)
    old_observations = initial_observations + failure_receipt["payload"]["observations"]
    monkeypatch.setattr(s, "previous", lambda root, manifest: (
        first["state_ref"], failure_ref, old, failure_receipt, old_observations))
    original_read = s.read_artifact
    fixtures = {first_ref: first_receipt, failure_ref: failure_receipt}
    monkeypatch.setattr(s, "read_artifact", lambda root, manifest, identity:
                        fixtures[identity] if identity in fixtures else original_read(root, manifest, identity))
    monkeypatch.setattr(s, "freeze_inventory", actual_inventory)
    repaired = s.run(ROOT, publish_artifacts=False)
    assert repaired["status"] == "PARTIAL"
    issue = next(i for i in repaired["state"]["payload"]["issues"] if i["issue_id"] == failure_issue["issue_id"])
    assert issue["status"] == "RESOLVED"
    assert issue["first_seen_at"] == failure_issue["first_seen_at"]
    assert issue["first_seen_ref"] == failure_issue["first_seen_ref"]
    assert repaired["transitions"]["resolved"] == 1
    clear = next(o for o in repaired["receipt"]["payload"]["observations"] if o["issue_id"] == issue["issue_id"])
    assert clear["outcome"] == "CLEAR" and clear["availability"] == "AVAILABLE"
    assert clear["evidence_refs"] != failure_receipt["payload"]["observations"][0]["evidence_refs"]
    assert clear["evidence_refs"][0]["sweep_fingerprint"] == failure_receipt["payload"]["fingerprint"]
    values = {}
    for result in [first, repaired]:
        for value in [result["coverage_state"], result["state"], result["receipt"]]:
            kind = "state" if value["kind"] == "risk-state" else "sweep"
            identity = "risk:" + kind + ":" + sha256(canonical(value) + b"\n").hexdigest()
            values[identity] = value
    values[failure_ref] = failure_receipt
    origins = decode((ROOT / "data/exports/data_organ_v0_1/issues.json").read_bytes())["items"]
    assert verify_graph(values, origins)
    assert (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes() == before
