"""Certify real engines with independent tapes, exact replay, and host attacks."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from hashlib import sha256
from itertools import combinations
import json
import os
from pathlib import Path
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.eval.canonical import canonical_json_bytes, canonical_sha256
from src.execution.certification import (
    CertificationBenchmarkArtifact, CertificationCheck, CertificationLevel, EngineCertificationArtifact,
)
from src.execution.comparison import ComparisonContract, ComparisonStatus
from src.execution.fingerprints import EngineFingerprint
from src.execution.semantic_tapes import (
    ACCOUNT_FIELDS, ENGINE_SUPPORTED_TAPES, SEMANTIC_TAPES,
    evaluate_semantic_result, independent_semantic_oracle, semantic_request,
)
from src.execution.worker_process import WorkerResourceError, run_bounded

OUTPUT = ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"
HISTORICAL_ARTIFACT = ROOT / "eval/certification/forge_v0_2_4/history/engine_probe_artifact.global-gate.4eb935391746fa7ee7c26d451ae38e2f890fd4e7aeeafb3435c11300228e0401.json"
SUPERSEDED_ARTIFACT_HASH = "4eb935391746fa7ee7c26d451ae38e2f890fd4e7aeeafb3435c11300228e0401"
SUPERSEDED_FILE_SHA256 = "e0b7057093553cbc8b2c4b8e463bc8aa5fdb6e25223e052e22f67250914bc61f"

EXPECTED_ENGINE_RESULTS = {
    "vectorbt": {"certification_level": "C4", "status": "CERTIFIED", "blocking_tapes": []},
    "nautilus": {"certification_level": "C4", "status": "CERTIFIED", "blocking_tapes": []},
    "hftbacktest": {"certification_level": "C0", "status": "FAILED_CERTIFICATION", "blocking_tapes": ["T03", "T04", "T12"]},
    "legacy-hft": {"certification_level": "C0", "status": "FAILED_CERTIFICATION", "blocking_tapes": ["T12"]},
}

ENGINE_FINDINGS = {
    "hftbacktest": {
        "upstream_evidence": {
            "observed_on": "2026-09-06",
            "issue": {"number": 316, "state": "OPEN", "url": "https://github.com/nkaz001/hftbacktest/issues/316"},
            "candidate_pr": {"number": 323, "state": "OPEN", "merged": False, "mergeable": True,
                             "head_commit": "22856574ca1d877594ecd8fb0f5ef33e1e702cbb",
                             "url": "https://github.com/nkaz001/hftbacktest/pull/323"},
            "certified_package_patched": False,
        }
    },
    "legacy-hft": {
        "capability_analysis": {
            "T12": {
                "classification": "IMPLEMENTATION_DEFECT",
                "declared_capability": "SUPPORTED",
                "adapter_normalization": "VALIDATED",
                "evidence": [
                    "native matcher emits PARTIAL and FINISHED for the requested passive queue sequence",
                    "matcher and Strategy share one mutable OrderRequest and both increment volume_filled on PARTIAL",
                    "native final accounting records 2 of 3 filled base units while the native status stream proves both fills",
                ],
            }
        }
    },
}


@dataclass(frozen=True)
class ProbeSpec:
    engine: str
    distribution: str
    version: str
    commit: str
    script: str
    rust_version: str


SPECS = (
    ProbeSpec("vectorbt", "vectorbt", "1.1.0", "259d2d89fe2e7638baf3ca76c394937cd32b656d", "vectorbt_semantic.py", "UNSUPPORTED"),
    ProbeSpec("nautilus", "nautilus_trader", "1.231.0", "d3e1685e979925d7b0ffacd1b3f442547686e18f", "nautilus_semantic.py", "1.97.1"),
    ProbeSpec("hftbacktest", "hftbacktest", "2.4.4", "a244a14250b42d97fc305569c93c4117cd5e1dff", "hftbacktest_semantic.py", "wheel-build-toolchain-not-exposed"),
    ProbeSpec("legacy-hft", "backtesting-hft", "0.5.0", "737ce7bda4a31b839dd8179eab5f3aae22040c3e", "legacy_hft_semantic.py", "UNSUPPORTED"),
)


def source_manifest() -> dict[str, str]:
    paths = {path for folder in ("src", "forge", "tests", "scripts")
             for path in (ROOT / folder).rglob("*.py")}
    paths.update((ROOT / "scripts/engine_certification/locks").glob("*.txt"))
    paths.update(ROOT / name for name in ("pyproject.toml", "requirements.txt", "conftest.py", ".gitattributes"))
    return {path.relative_to(ROOT).as_posix(): sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
            for path in sorted(paths) if path.is_file()}


def _env() -> dict[str, str]:
    env = {key: value for key, value in os.environ.items()
           if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"}}
    env.update(PYTHONUTF8="1", PYTHONHASHSEED="0", MPLBACKEND="Agg",
               MPLCONFIGDIR=str(ROOT / ".engine-envs/.matplotlib"))
    return env


def _run(command: list[str], payload: bytes = b"", timeout: float = 180):
    completed = run_bounded(command, input=payload, timeout_seconds=timeout,
                            max_output_bytes=8_000_000, cwd=ROOT, env=_env())
    if completed.returncode:
        raise WorkerResourceError(f"worker exited {completed.returncode}: {completed.stderr[-1000:].decode('utf-8', errors='replace')}")
    return completed


def _json(command: list[str], payload: bytes = b"") -> dict:
    raw = _run(command, payload).stdout
    value = json.loads(raw.decode("utf-8"), parse_constant=lambda item: (_ for _ in ()).throw(ValueError("nonfinite JSON")))
    if not isinstance(value, dict):
        raise ValueError("worker response must be a single JSON object")
    return value


def _locked_lines(spec: ProbeSpec) -> tuple[str, ...]:
    path = ROOT / "scripts/engine_certification/locks" / (spec.engine + ".txt")
    return tuple(sorted(line.strip() for line in path.read_text().splitlines() if line.strip()))


def grade_response(spec: ProbeSpec, response: dict, request: dict) -> tuple[list[str], list[dict]]:
    protocol = []
    if set(response) != {"engine", "version", "request_hash", "runtime", "results"}:
        protocol.append("SCHEMA_INVALID")
    if response.get("engine") != spec.engine or response.get("version") != spec.version:
        protocol.append("ENGINE_DRIFT")
    if response.get("request_hash") != request["request_hash"]:
        protocol.append("REPLAY_MISMATCH")
    if not isinstance(response.get("runtime"), dict) or not response["runtime"]:
        protocol.append("PROVENANCE_MISSING")
    results = response.get("results")
    if not isinstance(results, list):
        return protocol + ["SCHEMA_INVALID"], []
    ids = [item.get("tape_id") if isinstance(item, dict) else None for item in results]
    if ids != [tape.tape_id for tape in SEMANTIC_TAPES]:
        protocol.append("SCHEMA_INVALID")
    grades = []
    for tape in SEMANTIC_TAPES:
        matches = [item for item in results if isinstance(item, dict) and item.get("tape_id") == tape.tape_id]
        item = matches[0] if len(matches) == 1 else {}
        try:
            errors = evaluate_semantic_result(tape, item, engine=spec.engine)
        except (ValueError, TypeError, KeyError, OverflowError, ZeroDivisionError):
            errors = ["SCHEMA_INVALID"]
        grades.append({"tape_id": tape.tape_id, "tape_hash": tape.tape_hash,
                       "state": "FAIL" if errors else ("UNSUPPORTED" if item.get("state") == "UNSUPPORTED" else "PASS"),
                       "failures": errors, "result_hash": canonical_sha256(item),
                       "oracle_hash": canonical_sha256(independent_semantic_oracle(tape))})
    return list(dict.fromkeys(protocol)), grades


def differential_evidence(records: list[dict]) -> tuple[list[dict], tuple]:
    evidence, results = [], []
    for left, right in combinations(records, 2):
        left_results = {item["tape_id"]: item for item in left["response"].get("results", []) if isinstance(item, dict) and "tape_id" in item}
        right_results = {item["tape_id"]: item for item in right["response"].get("results", []) if isinstance(item, dict) and "tape_id" in item}
        left_pass = {item["tape_id"] for item in left["semantic_grades"] if item["state"] == "PASS"}
        right_pass = {item["tape_id"] for item in right["semantic_grades"] if item["state"] == "PASS"}
        for tape in SEMANTIC_TAPES:
            if tape.tape_id not in left_pass & right_pass:
                continue
            a, b = left_results[tape.tape_id], right_results[tape.tape_id]
            # Same fixed input, strategy, fees, timing, and mark. Only this exact
            # declared semantic intersection is comparable.
            capability = "semantic_" + tape.tape_id
            semantics = {"tape_hash": tape.tape_hash, "latency_ns": tape.latency_ns,
                         "fee_bps": tape.fee_bps, "sizing": "absolute_quantity"}
            contract = ComparisonContract(left["engine"], right["engine"],
                frozenset({capability}), frozenset({capability}),
                tolerances={field: 1e-7 for field in ACCOUNT_FIELDS},
                left_semantics=semantics, right_semantics=semantics)
            comparison = contract.compare(a["account"], b["account"], required_capability=capability)
            evidence.append({"left_engine": left["engine"], "right_engine": right["engine"],
                             "tape_id": tape.tape_id, "expected_status": "PASS",
                             "input_hash": tape.tape_hash, "semantics": semantics, **comparison.to_dict()})
            results.append(comparison)
    queue_contract = ComparisonContract("vectorbt", "hftbacktest",
        frozenset({"immediate_limit"}), frozenset({"immediate_limit", "queue"}),
        tolerances={"equity": 1e-7})
    rejection = queue_contract.compare({}, {}, required_capability="queue")
    evidence.append({"left_engine": "vectorbt", "right_engine": "hftbacktest",
                     "tape_id": "T11", "expected_status": "NOT_COMPARABLE", **rejection.to_dict()})
    results.append(rejection)
    return evidence, tuple(results)


def _core_suite(skip: bool) -> dict:
    if skip:
        return {"passed": False, "reason": "core suite skipped; diagnostic run is not release evidence"}
    with tempfile.TemporaryDirectory(prefix="core-certification-", dir=ROOT / ".engine-envs") as directory:
        report = Path(directory) / "pytest.xml"
        completed = run_bounded([sys.executable, "-m", "pytest", "-q",
            "--basetemp=" + str(Path(directory) / "tmp"), "--junitxml=" + str(report)],
            input=b"", timeout_seconds=600, max_output_bytes=8_000_000, cwd=ROOT, env=_env())
        print(completed.stdout.decode("utf-8", errors="replace")[-2000:], flush=True)
        suites = ET.parse(report).getroot().findall("testsuite") if report.exists() else []
        counts = {name: sum(int(item.get(name, "0")) for item in suites)
                  for name in ("tests", "failures", "errors", "skipped")}
        return {"passed": completed.returncode == 0 and counts["tests"] > 0 and not counts["failures"] and not counts["errors"],
                "exit_code": completed.returncode, **counts, "command": "python -m pytest -q",
                "python_version": sys.version.split()[0]}


def _system_check(passed: bool, evidence: object, detail: str) -> dict[str, object]:
    return {"status": "PASS" if passed else "FAIL", "evidence_hash": canonical_sha256(evidence), "detail": detail}


def historical_artifact_is_preserved() -> bool:
    if not HISTORICAL_ARTIFACT.is_file():
        return False
    raw = HISTORICAL_ARTIFACT.read_bytes()
    try:
        document = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return False
    return sha256(raw).hexdigest() == SUPERSEDED_FILE_SHA256 and document.get("artifact_hash") == SUPERSEDED_ARTIFACT_HASH


def build_system_assessment(
    records: list[dict], engine_records: list[dict], artifacts: list[EngineCertificationArtifact],
    benchmark: CertificationBenchmarkArtifact, suite: dict, *, receipt_valid: bool, source_stable: bool,
) -> dict[str, object]:
    """Grade Forge's release evidence without promoting failed engines."""
    from src.execution.adversarial import MUTATION_EXPECTATIONS

    expected_tape_ids = [tape.tape_id for tape in SEMANTIC_TAPES]
    harness_blockers = [item for item in benchmark.system_blocking_gates if item["gate"] == "CERTIFICATION_HARNESS"]
    harness_valid = not harness_blockers and all(
        [grade["tape_id"] for grade in record["semantic_grades"]] == expected_tape_ids
        for record in records
    )
    oracle_valid = all(
        len(record["semantic_grades"]) == len(SEMANTIC_TAPES)
        and all(grade["state"] in {"PASS", "FAIL", "UNSUPPORTED"} for grade in record["semantic_grades"])
        and all(bool(grade["failures"]) == (grade["state"] == "FAIL") for grade in record["semantic_grades"])
        for record in records
    )
    artifact_consistent = all(
        record["response_hash"] == canonical_sha256(record["response"])
        and record["replay_hash"] == canonical_sha256(record["replay_response"])
        and engine_record["certification_hash"] == artifact.artifact_hash
        and record["stress"]["report_hash"] == canonical_sha256(
            {key: value for key, value in record["stress"].items() if key != "report_hash"}
        )
        and all(
            case["evidence_hash"] == canonical_sha256({key: value for key, value in case.items() if key != "evidence_hash"})
            for case in record["stress"]["cases"]
        )
        and record["installed_identity"] == record["replay_identity"]
        for record, engine_record, artifact in zip(records, engine_records, artifacts)
    )
    replay_valid = all(
        next(check for check in artifact.checks if check.code == "canonical-byte-replay").passed
        and record["response_hash"] == record["replay_hash"]
        for record, artifact in zip(records, artifacts)
    )
    c3_valid = not any(item["gate"] == "C3_COMPARISON_RULES" for item in benchmark.system_blocking_gates)
    host_mutations_valid = all(
        {case["mutation"] for case in record["stress"]["cases"]} == set(MUTATION_EXPECTATIONS)
        and all(case["passed"] for case in record["stress"]["cases"])
        for record in records
    )
    observed_results = {
        record["engine"]: {
            "certification_level": record["certification"]["certification_level"],
            "status": record["status"],
            "blocking_tapes": record["blocking_tapes"],
        }
        for record in engine_records
    }
    failures_preserved = observed_results == EXPECTED_ENGINE_RESULTS
    clean = receipt_valid and all(
        record["fresh_environment"]
        and next(check for check in artifact.checks if check.code == "installed-version-lock-and-files").passed
        for record, artifact in zip(records, artifacts)
    )
    checks = {
        "forge_owned_oracle_suite": _system_check(oracle_valid, [record["semantic_grades"] for record in records],
            "all Forge-owned tapes must be independently graded with positive and negative engine verdicts visible"),
        "certification_harness": _system_check(harness_valid, benchmark.to_dict(),
            "all four declared engines must have complete C0-C4 verdict evidence"),
        "artifact_consistency": _system_check(artifact_consistent, engine_records,
            "embedded response, replay, certification, mutation, and identity evidence must be internally bound"),
        "replay_verification": _system_check(replay_valid, [record["replay_hash"] for record in records],
            "every engine response must reproduce byte-for-byte in a fresh worker process"),
        "c3_comparison_rules": _system_check(c3_valid, [item.to_dict() for item in benchmark.comparisons],
            "comparable semantics must converge and incompatible queue semantics must be explicitly rejected"),
        "c4_host_boundary_mutation_suite": _system_check(host_mutations_valid,
            [[case["evidence_hash"] for case in record["stress"]["cases"]] for record in records],
            "every required production host-boundary attack must be rejected for every engine fingerprint"),
        "engine_failures_honestly_preserved": _system_check(failures_preserved, observed_results,
            "engine statuses, cumulative levels, and blocking tapes must exactly match the independently graded observations"),
        "full_test_suite": _system_check(bool(suite["passed"]), suite,
            "the complete Forge test suite must pass in the certification run"),
        "clean_environment": _system_check(clean, {"receipt_valid": receipt_valid,
            "fresh": [record["fresh_environment"] for record in records]},
            "all official packages must be tested unpatched in fresh isolated locked environments"),
        "source_stability": _system_check(source_stable, source_manifest(),
            "certified source must remain unchanged during the run"),
        "historical_artifact_preserved": _system_check(historical_artifact_is_preserved(),
            {"artifact_hash": SUPERSEDED_ARTIFACT_HASH, "file_sha256": SUPERSEDED_FILE_SHA256},
            "the original global-gate artifact must remain byte-identical and content-addressed"),
    }
    blockers = [{"gate": code.upper(), "reason": check["detail"]}
                for code, check in checks.items() if check["status"] != "PASS"]
    return {"checks": checks, "blocking_gates": blockers, "release_eligible": not blockers}
def main() -> int:
    from src.execution.adversarial import run_adversarial_suite
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment-root", type=Path, default=ROOT / ".engine-envs")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--skip-core-tests", action="store_true", help="diagnostic only; prevents release")
    args = parser.parse_args()
    environment_root = args.environment_root.resolve()
    initial_source = source_manifest()
    request = semantic_request()
    records = []
    receipt_file = environment_root / "provisioning.json"
    receipt = json.loads(receipt_file.read_text()) if receipt_file.exists() else {}
    receipt_content = {key: value for key, value in receipt.items() if key != "receipt_hash"}
    receipt_valid = bool(receipt) and receipt.get("receipt_hash") == canonical_sha256(receipt_content)
    for spec in SPECS:
        print(f"Certifying {spec.engine}: C1 tapes -> C2 fresh-process replay -> C4 mutations", flush=True)
        python = environment_root / spec.engine / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        command = [str(python), str(ROOT / "scripts/engine_certification" / spec.script)]
        identity_command = [str(python), str(ROOT / "scripts/engine_certification/engine_identity.py"), spec.distribution]
        lock = _locked_lines(spec)
        lock_hash = canonical_sha256(lock)
        identity = _json(identity_command)
        observed_lock = tuple(sorted(_run([str(python), "-m", "pip", "freeze", "--all"]).stdout.decode().splitlines()))
        adapter_sources = {path.name: sha256(path.read_bytes()).hexdigest()
                           for path in sorted((ROOT / "scripts/engine_certification").glob("*.py"))}
        worker_hash = canonical_sha256({"sources": adapter_sources, "lock_hash": lock_hash,
                                       "distribution_content_hash": identity["distribution_content_hash"]})
        fingerprint = EngineFingerprint(spec.engine, identity["version"], spec.commit,
            identity["python_version"], spec.rust_version, lock_hash, worker_hash, identity["platform"])
        first = _json(command, canonical_json_bytes(request))
        protocol, grades = grade_response(spec, first, request)
        # Grade C1 before requesting any replay. C2 cannot promote an engine
        # whose preceding semantic checks failed, even if replay is exact.
        second = _json(command, canonical_json_bytes(request))
        replay_protocol, replay_grades = grade_response(spec, second, request)
        after_identity = _json(identity_command)
        provisioned = receipt.get("engines", {}).get(spec.engine, {})
        installed = identity["version"] == spec.version and observed_lock == lock and identity == after_identity
        for response in (first, second):
            runtime = response.get("runtime", {})
            installed = installed and runtime.get("python_version", runtime.get("python")) == identity["python_version"] and runtime.get("platform") == identity["platform"]
        if spec.engine == "legacy-hft":
            installed = installed and identity.get("direct_url", {}).get("vcs_info", {}).get("commit_id") == spec.commit
        fresh = receipt_valid and provisioned == {"dependency_lock_hash": lock_hash, "fresh_install": True} and identity["isolated"]
        first_hash, second_hash = canonical_sha256(first), canonical_sha256(second)
        stress = run_adversarial_suite(fingerprint, semantic_results=first["results"])
        checks = [
            CertificationCheck("installed-version-lock-and-files", CertificationLevel.C0_PROTOCOL_SCHEMA,
                installed, canonical_sha256(identity), "installed version, committed dependency lock, and engine files must match before and after replay"),
            CertificationCheck("strict-bound-semantic-protocol", CertificationLevel.C0_PROTOCOL_SCHEMA,
                not protocol and not replay_protocol, first_hash, "strict schema, request binding, engine identity, provenance: " + str(protocol + replay_protocol)),
            CertificationCheck("mandatory-oracle-backed-tapes", CertificationLevel.C1_ACCOUNTING_EVENTS,
                all(item["state"] != "FAIL" for item in grades) and any(item["state"] == "PASS" for item in grades),
                canonical_sha256(grades), "Forge oracle and independent accounting for every declared tape; failures: " + str([item for item in grades if item["state"] == "FAIL"])),
            CertificationCheck("canonical-byte-replay", CertificationLevel.C2_EXACT_REPLAY,
                first_hash == second_hash and grades == replay_grades, second_hash, "all canonical tape records reproduced in a second fresh process"),
            CertificationCheck("host-and-native-result-mutations", CertificationLevel.C4_STRESS_MUTATIONS,
                stress["complete"], stress["report_hash"],
                "production-boundary and actual native-result mutation suite; failed attacks: "
                + str([item["mutation"] for item in stress["cases"] if not item["passed"]])
                + "; invalid native positive controls: "
                + str(stress.get("semantic_mutations", {}).get("baseline_failures", []))),
        ]
        supported = tuple(item["tape_id"] for item in first["results"] if item.get("state") == "SUPPORTED")
        unsupported = {item["tape_id"]: item["reason"] for item in first["results"] if item.get("state") == "UNSUPPORTED"}
        records.append({"engine": spec.engine, "fingerprint": fingerprint, "checks": checks,
                        "supported": supported, "unsupported": unsupported, "response": first,
                        "response_hash": first_hash, "replay_hash": second_hash, "replay_response": second,
                        "semantic_grades": grades, "dependency_lock": list(lock),
                        "installed_identity": identity, "replay_identity": after_identity,
                        "observed_dependency_lock": list(observed_lock), "fresh_environment": fresh,
                        "stress": stress})
    comparisons, comparison_results = differential_evidence(records)
    artifacts, engine_records = [], []
    for record in records:
        scoped = [item for item in comparisons if record["engine"] in {item["left_engine"], item["right_engine"]}]
        convergent = any(item["expected_status"] == "PASS" and item["status"] == "PASS" for item in scoped)
        valid = all(item["status"] == item["expected_status"] for item in scoped)
        checks = record["checks"] + [CertificationCheck("scoped-semantic-comparisons", CertificationLevel.C3_SCOPED_AGREEMENT,
            convergent and valid, canonical_sha256(scoped), "common declared tapes converge; non-equivalent queue semantics are rejected")]
        artifact = EngineCertificationArtifact(record["fingerprint"], tuple(checks),
            record["supported"], record["unsupported"], mandatory_tapes=ENGINE_SUPPORTED_TAPES[record["engine"]])
        artifacts.append(artifact)
        blocking_tapes = sorted(item["tape_id"] for item in record["semantic_grades"] if item["state"] == "FAIL")
        engine_records.append({key: value for key, value in record.items() if key not in {"fingerprint", "checks", "supported", "unsupported"}} |
                              {"status": artifact.status, "blocking_tapes": blocking_tapes,
                               "findings": ENGINE_FINDINGS.get(record["engine"], {}),
                               "certification": artifact.to_dict(), "certification_hash": artifact.artifact_hash})
    benchmark = CertificationBenchmarkArtifact(tuple(artifacts), comparison_results)
    suite = _core_suite(args.skip_core_tests)
    source_stable = source_manifest() == initial_source
    system = build_system_assessment(records, engine_records, artifacts, benchmark, suite,
                                     receipt_valid=receipt_valid, source_stable=source_stable)
    benchmark_report = benchmark.to_dict()
    document = {
        "schema_version": "forge-engine-certification/0.2.4-system-release",
        "certification_summary": benchmark_report["certification_summary"],
        "minimum_engine_level": benchmark_report["minimum_engine_level"],
        "maximum_engine_level": benchmark_report["maximum_engine_level"],
        "engine_certification_target": "C4",
        "system_release_eligible": system["release_eligible"],
        "system": system,
        "supersedes_artifact": {
            "artifact_hash": SUPERSEDED_ARTIFACT_HASH,
            "file_sha256": SUPERSEDED_FILE_SHA256,
            "path": HISTORICAL_ARTIFACT.relative_to(ROOT).as_posix(),
            "reason": "the prior release gate incorrectly conflated certification-system validity with the minimum third-party engine level",
        },
        "source_hash_convention": "CRLF normalized to LF; all other source bytes preserved",
        "source_manifest": initial_source,
        "source_manifest_hash": canonical_sha256(initial_source),
        "request": request,
        "request_hash": request["request_hash"],
        "independent_oracles": {tape.tape_id: independent_semantic_oracle(tape) for tape in SEMANTIC_TAPES},
        "clean_environment_receipt": receipt,
        "core_suite": suite,
        "engines": engine_records,
        "comparisons": comparisons,
    }
    document["artifact_hash"] = canonical_sha256(document)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes((json.dumps(document, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8"))
    print(json.dumps({"artifact": str(args.output), "artifact_hash": document["artifact_hash"],
                      "system_release_eligible": document["system_release_eligible"],
                      "certification_summary": document["certification_summary"],
                      "levels": {item.fingerprint.engine: item.to_dict()["certification_level"] for item in artifacts},
                      "blocking_gates": system["blocking_gates"]}, sort_keys=True), flush=True)
    return 0 if document["system_release_eligible"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
