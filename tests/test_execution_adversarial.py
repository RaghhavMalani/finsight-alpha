from __future__ import annotations

import base64
from copy import deepcopy
from dataclasses import replace
import sys

import pytest

from src.eval.canonical import canonical_json_bytes, canonical_sha256
from src.execution.adversarial import (
    MUTATION_EXPECTATIONS, conformance_fixture, reseal_result,
    run_adversarial_suite, run_semantic_mutations,
)
from src.execution.contracts import ContractError, MeasurementState, SimulationResult
from src.execution.engines import RPC_VERSION, WorkerEngine
from src.execution.events import CanonicalExecutionEvent
from src.execution.failures import FailureCode
from src.execution.fingerprints import EngineFingerprint
from src.execution.normalization import normalize_worker_outcome
from src.execution.replay_manifest import ExecutionReplayManifest
from src.execution.worker_process import WorkerResourceError, run_bounded


@pytest.fixture(scope="module")
def fingerprint():
    return EngineFingerprint(
        engine="fixture", engine_version="1.0", upstream_commit="abcdef0",
        python_version="3.12", rust_version="UNSUPPORTED",
        dependency_lock_hash=canonical_sha256("lock"), worker_image_hash=canonical_sha256("worker"),
        platform="host-test",
    )


@pytest.fixture(scope="module")
def mutation_report(fingerprint):
    return run_adversarial_suite(fingerprint)


@pytest.mark.parametrize("mutation,expected", MUTATION_EXPECTATIONS.items())
def test_every_requested_mutation_hits_its_production_guard(mutation_report, mutation, expected):
    case = next(case for case in mutation_report["cases"] if case["mutation"] == mutation)
    assert case["passed"], case
    assert expected in case["detected_codes"]
    assert case["evidence_hash"] == canonical_sha256({key: value for key, value in case.items() if key != "evidence_hash"})


def test_mutation_report_is_complete_and_deterministic(fingerprint, mutation_report):
    assert mutation_report["complete"]
    assert mutation_report["report_hash"] == run_adversarial_suite(fingerprint)["report_hash"]
    assert mutation_report["scope"].endswith("synthetic positive control")


def _command(outcome):
    data = base64.b64encode(canonical_json_bytes({"protocol_version": RPC_VERSION, "outcome": outcome})).decode()
    return (sys.executable, "-I", "-c", f"import base64,sys; sys.stdout.buffer.write(base64.b64decode('{data}'))")


def test_actual_worker_replay_detects_resealed_engine_drift(fingerprint):
    descriptor, request, baseline = conformance_fixture(fingerprint)
    engine = WorkerEngine(descriptor, _command(baseline.to_dict()))
    first = engine.run(request)
    assert first.state is MeasurementState.MEASURED
    changed = replace(baseline.result, provenance=replace(baseline.result.provenance, engine_version="2.0"))
    engine._command = _command(replace(baseline, result=changed).to_dict())
    replay = engine.replay(first.result.result_hash)
    assert replay.state is MeasurementState.ERROR
    assert replay.reason.startswith("ENGINE_DRIFT:")


def test_actual_worker_replay_detects_valid_schema_nondeterminism(fingerprint):
    descriptor, request, baseline = conformance_fixture(fingerprint)
    engine = WorkerEngine(descriptor, _command(baseline.to_dict()))
    first = engine.run(request)
    altered = baseline.to_dict()
    altered["result"]["metrics"]["sharpe"] = {"state": "MEASURED", "value": 7.0, "unit": "ratio"}
    reseal_result(altered["result"])
    engine._command = _command(altered)
    replay = engine.replay(first.result.result_hash)
    assert replay.state is MeasurementState.ERROR
    assert replay.reason.startswith("REPLAY_MISMATCH:")


def test_missing_and_null_integrity_hashes_cannot_disable_verification(fingerprint):
    _, _, baseline = conformance_fixture(fingerprint)
    for key in ("result_hash", "replay_hash", "engine_fingerprint_hash"):
        raw = baseline.result.to_dict()
        raw[key] = None
        with pytest.raises(ContractError):
            SimulationResult.from_dict(raw)
        del raw[key]
        with pytest.raises(ContractError):
            SimulationResult.from_dict(raw)


def _retime_cancel(payload, ns, *, cancel_before_fill):
    result = payload["result"]
    cancel = next(event for event in result["canonical_events"] if event["event_id"] == "cancel")
    source = next(event for event in result["native_events"] if event["native_type"] == "fixture.cancel")
    source["event_ns"] = cancel["event_ns"] = ns
    source["native_event_hash"] = canonical_sha256({key: value for key, value in source.items() if key != "native_event_hash"})
    cancel["native_event_hash"] = source["native_event_hash"]
    result["native_events"].sort(key=lambda event: event["event_ns"])
    result["canonical_events"].sort(key=lambda event: (event["event_ns"], (event["event_id"] != "cancel") if cancel_before_fill else (event["event_id"] == "cancel")))
    reseal_result(result)


def test_same_timestamp_prior_cancellation_rejected_but_fill_then_cancel_survives(fingerprint):
    descriptor, request, baseline = conformance_fixture(fingerprint)
    accepted = baseline.to_dict()
    _retime_cancel(accepted, 30, cancel_before_fill=False)
    assert normalize_worker_outcome(accepted, descriptor=descriptor, request=request).state is MeasurementState.MEASURED
    rejected = baseline.to_dict()
    _retime_cancel(rejected, 30, cancel_before_fill=True)
    with pytest.raises(ContractError) as failure:
        normalize_worker_outcome(rejected, descriptor=descriptor, request=request)
    assert failure.value.code is FailureCode.TIMESTAMP_CAUSALITY_FAILURE
    assert "cancel.stream_order" in str(failure.value)


@pytest.mark.parametrize("mutation,expected", [
    ("native_engine", FailureCode.ENGINE_DRIFT),
    ("native_time", FailureCode.TIMESTAMP_CAUSALITY_FAILURE),
])
def test_resealed_native_lineage_corruption_is_rejected(fingerprint, mutation, expected):
    descriptor, request, baseline = conformance_fixture(fingerprint)
    payload = baseline.to_dict()
    source = payload["result"]["native_events"][0]
    if mutation == "native_engine":
        source["engine"] = "other-engine"
    else:
        source["event_ns"] = 21
    source["native_event_hash"] = canonical_sha256({key: value for key, value in source.items() if key != "native_event_hash"})
    payload["result"]["canonical_events"][0]["native_event_hash"] = source["native_event_hash"]
    reseal_result(payload["result"])
    with pytest.raises(ContractError) as failure:
        normalize_worker_outcome(payload, descriptor=descriptor, request=request)
    assert failure.value.code is expected


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf"), True])
def test_canonical_event_numeric_fields_reject_nonfinite_and_boolean(fingerprint, value):
    _, _, baseline = conformance_fixture(fingerprint)
    raw = baseline.result.canonical_events[0].to_dict()
    raw["quantity"] = value
    with pytest.raises(ValueError):
        CanonicalExecutionEvent.from_dict(raw)


def test_replay_manifest_requires_hash_and_valid_schema(fingerprint):
    _, _, baseline = conformance_fixture(fingerprint)
    manifest = ExecutionReplayManifest.from_result(baseline.result)
    assert ExecutionReplayManifest.from_dict(manifest.to_dict()) == manifest
    for key, value in (("manifest_hash", None), ("schema_version", "future"), ("request_hash", "invalid")):
        raw = manifest.to_dict()
        raw[key] = value
        with pytest.raises(ValueError):
            ExecutionReplayManifest.from_dict(raw)


def test_worker_output_budget_includes_stderr_and_works_at_exact_limit():
    success = run_bounded((sys.executable, "-I", "-c", "import sys; sys.stdout.buffer.write(b'x'*2048); sys.stderr.buffer.write(b'y'*2048)"),
                          input=b"", timeout_seconds=5, max_output_bytes=4096)
    assert len(success.stdout) + len(success.stderr) == 4096
    with pytest.raises(WorkerResourceError, match="byte limit"):
        run_bounded((sys.executable, "-I", "-c", "import sys; sys.stderr.buffer.write(b'x'*1000000)"),
                    input=b"", timeout_seconds=5, max_output_bytes=4096)


def test_worker_timeout_includes_blocked_stdin_and_closed_stdout():
    with pytest.raises(WorkerResourceError, match="timeout"):
        run_bounded((sys.executable, "-I", "-c", "import sys,time; sys.stdout.close(); sys.stderr.close(); time.sleep(10)"),
                    input=b"x" * 1000000, timeout_seconds=0.15, max_output_bytes=4096)


def test_semantic_mutation_positive_control_failure_is_evidence_not_exception():
    from src.execution.semantic_tapes import SEMANTIC_TAPES
    tape = SEMANTIC_TAPES[0]
    observation = {"tape_id": tape.tape_id, "tape_hash": tape.tape_hash, "state": "SUPPORTED",
                   "fills": [{"fill_id": "bad"}], "account": {}, "native_evidence": {"source": "fixture"}}
    result = run_semantic_mutations("nautilus", [observation])
    assert not result["complete"]
    assert result["state"] == "UNAVAILABLE"
    assert result["baseline_failures"][0]["state"] == "INVALID_POSITIVE_CONTROL"


def test_host_mutations_cannot_certify_if_normalization_guard_is_disabled(monkeypatch, fingerprint):
    descriptor, request, baseline = conformance_fixture(fingerprint)
    monkeypatch.setattr("src.execution.adversarial.normalize_worker_outcome", lambda *args, **kwargs: baseline)
    report = run_adversarial_suite(fingerprint)
    assert not report["complete"]
    assert not next(case for case in report["cases"] if case["mutation"] == "position_mismatch")["passed"]
