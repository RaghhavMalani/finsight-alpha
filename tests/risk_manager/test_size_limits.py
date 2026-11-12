"""Admission and compact selection are separate guards; each must bite on its own."""
from copy import deepcopy
from hashlib import sha256
from pathlib import Path

import pytest

from src.risk_manager import publication
from src.risk_manager.monitoring import monitoring_operation
from src.risk_manager.contracts import canonical, decode, digest, hydrate_sweep, identity as issue_identity
from src.risk_manager.publication import (
    ADMISSION_LIMIT, COMPACT_THRESHOLD, entry, prepare_public, read_artifact, validate_public)
from test_publication import fixture_root

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend-v2/public"
REPLAY = PUBLIC / "artifacts/replay"


def retained():
    manifest = decode((PUBLIC / "replay-manifest.json").read_bytes())
    return manifest, {i: e for i, e in manifest["artifacts"].items() if e["kind"] in ("risk-state", "risk-sweep")}


def wire_bytes(value):
    return len(canonical(value)) + 1


def padded(value, size):
    """A carrier of exactly `size` wire bytes; only its length is under test."""
    value = dict(value, pad="")
    value["pad"] = "x" * (size - wire_bytes(value))
    assert wire_bytes(value) == size
    return value


def resized_receipt(size):
    """A semantically valid logical receipt of exactly `size` bytes.

    Only free-text observation reasons change; every dependent hash is re-derived.
    """
    manifest, risk = retained()
    receipts = [decode((PUBLIC / e["url"].lstrip("/")).read_bytes()) for e in risk.values() if e["kind"] == "risk-sweep"]
    receipts = [hydrate_sweep(r) if r["schema_version"] == "risk-sweep/2" else r for r in receipts]
    receipt = deepcopy(min((r for r in receipts if r["payload"]["status"] != "FAILED"),
                           key=lambda r: abs(wire_bytes(r) - size)))
    payload = receipt["payload"]
    remaining = size - wire_bytes(receipt)
    for observation in payload["observations"]:
        if not remaining:
            break
        reason = observation["reason"]
        length = min(600, max(1, len(reason) + remaining))
        if length == len(reason) or not reason.isascii():
            continue
        old = observation["observation_id"]
        observation["reason"] = (reason + " resized" * 100)[:length].rstrip().ljust(length, ".")
        remaining -= length - len(reason)
        assert observation["issue_id"] == issue_identity(observation)
        relevant = {k: v for k, v in observation.items()
                    if k not in {"observation_id", "fingerprint", "witnessed_at", "previous_observation_id"}}
        observation["fingerprint"] = digest(relevant)
        observation["observation_id"] = digest(["risk-observation/1", observation["issue_id"], observation["fingerprint"]])
        for transition in payload["transitions"]:
            if transition["observation_id"] == old:
                transition["observation_id"] = observation["observation_id"]
    assert wire_bytes(receipt) == size
    return receipt


def test_limits_are_two_named_constants():
    assert ADMISSION_LIMIT == 1024 * 1024
    assert COMPACT_THRESHOLD == 128 * 1024
    assert not hasattr(publication, "LIMIT")


def test_every_retained_risk_artifact_reads_and_rederives_its_own_wire():
    manifest, risk = retained()
    assert {path.name for path in REPLAY.glob("risk-*.json")} == {e["url"].rsplit("/", 1)[-1] for e in risk.values()}
    assert len(risk) >= 27 and max(e["bytes"] for e in risk.values()) <= ADMISSION_LIMIT
    schemas = set()
    # One bounded operation, as the archive verifier does: the frozen catalog is checked once.
    with monitoring_operation():
        for identity, listed in risk.items():
            raw = (PUBLIC / listed["url"].lstrip("/")).read_bytes()
            wire = read_artifact(ROOT, manifest, identity, wire=True)
            assert canonical(wire) + b"\n" == raw
            if listed["kind"] != "risk-sweep":
                continue
            logical, rederived, prepared = prepare_public(wire, ROOT)
            selected = "risk-sweep/1" if wire_bytes(logical) <= COMPACT_THRESHOLD else "risk-sweep/2"
            assert wire["schema_version"] == rederived["schema_version"] == selected
            assert prepared == raw
            schemas.add(selected)
    assert schemas


def test_validate_public_rejects_one_byte_over_admission():
    manifest, _ = retained()
    state = read_artifact(ROOT, manifest, manifest["routes"]["/risk-manager/state"], wire=True)
    with pytest.raises(ValueError, match="exceeds admission limit"):
        validate_public(padded(state, ADMISSION_LIMIT + 1), ROOT)
    # At the limit the carrier is refused for its content, not for its size.
    with pytest.raises(ValueError) as rejected:
        validate_public(padded(state, ADMISSION_LIMIT), ROOT)
    assert "admission limit" not in str(rejected.value)


def test_prepare_public_rejects_one_byte_over_admission(monkeypatch):
    manifest, _ = retained()
    state = read_artifact(ROOT, manifest, manifest["routes"]["/risk-manager/state"], wire=True)
    with pytest.raises(ValueError, match="exceeds admission limit"):
        prepare_public(padded(state, ADMISSION_LIMIT + 1), ROOT)
    # The receipt branch has its own guard on the selected wire, after packing.
    logical = resized_receipt(COMPACT_THRESHOLD + 1)
    pack = publication.pack_sweep
    size = ADMISSION_LIMIT + 1
    monkeypatch.setattr(publication, "pack_sweep", lambda value: padded(pack(value), size))
    with pytest.raises(ValueError, match="exceeds admission limit"):
        prepare_public(logical, ROOT)
    size = ADMISSION_LIMIT
    with pytest.raises(ValueError, match="transport is not smaller"):
        prepare_public(logical, ROOT)


def test_read_artifact_rejects_one_byte_over_admission(tmp_path):
    fixture_root(tmp_path)
    manifest, risk = retained()
    state = decode((PUBLIC / risk[manifest["routes"]["/risk-manager/state"]]["url"].lstrip("/")).read_bytes())
    leaf_id = next(r["artifact_id"] for r in state["payload"]["evidence_index"] if r["selector_id"] == "risk_coverage")
    leaf_raw = (PUBLIC / risk[leaf_id]["url"].lstrip("/")).read_bytes()
    leaf = decode(leaf_raw)

    def stored(size):
        raw = leaf_raw + b" " * (size - len(leaf_raw))
        identity = "risk:state:" + sha256(raw).hexdigest()
        path = tmp_path / "frontend-v2/public/artifacts/replay" / (identity.replace(":", "-") + ".json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        return identity, {"artifacts": {identity: entry(identity, leaf, raw)}}

    identity, listing = stored(ADMISSION_LIMIT)
    assert read_artifact(tmp_path, listing, identity) == leaf
    identity, listing = stored(ADMISSION_LIMIT + 1)
    with pytest.raises(ValueError, match="Risk bytes mismatch"):
        read_artifact(tmp_path, listing, identity)


def test_receipt_at_threshold_stays_legacy_and_one_byte_over_is_packed():
    under = resized_receipt(COMPACT_THRESHOLD)
    logical, wire, raw = prepare_public(under, ROOT)
    assert wire == logical == under and wire["schema_version"] == "risk-sweep/1"
    assert raw == canonical(under) + b"\n" and len(raw) == COMPACT_THRESHOLD
    assert validate_public(under, ROOT)[0] == under

    over = resized_receipt(COMPACT_THRESHOLD + 1)
    logical, wire, raw = prepare_public(over, ROOT)
    assert logical == over and wire["schema_version"] == "risk-sweep/2"
    assert hydrate_sweep(wire) == over and len(raw) < wire_bytes(over)
    assert validate_public(wire, ROOT)[0] == over
    # Ingress keeps the same rule: the unpacked form of that receipt is not a wire.
    with pytest.raises(ValueError, match="must use packed transport"):
        validate_public(over, ROOT)
