"""Independently inspect frozen certification evidence and optional Git binding."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.eval.canonical import canonical_sha256
from src.execution.adversarial import MUTATION_EXPECTATIONS
from src.execution.certification import (
    CertificationBenchmarkArtifact, CertificationCheck, CertificationLevel, EngineCertificationArtifact,
)
from src.execution.fingerprints import EngineFingerprint
from src.execution.semantic_tapes import ENGINE_SUPPORTED_TAPES, SEMANTIC_TAPES, independent_semantic_oracle, semantic_request
from scripts.certify_execution_engines import (
    ENGINE_FINDINGS, EXPECTED_ENGINE_RESULTS, HISTORICAL_ARTIFACT, OUTPUT, SPECS,
    SUPERSEDED_ARTIFACT_HASH, SUPERSEDED_FILE_SHA256, differential_evidence, grade_response, source_manifest,
)


def _system_check(passed: bool, evidence: object, detail: str) -> dict[str, object]:
    return {"status": "PASS" if passed else "FAIL", "evidence_hash": canonical_sha256(evidence), "detail": detail}


def _historical_artifact_is_preserved() -> bool:
    if not HISTORICAL_ARTIFACT.is_file():
        return False
    raw = HISTORICAL_ARTIFACT.read_bytes()
    try:
        historical = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return False
    return sha256(raw).hexdigest() == SUPERSEDED_FILE_SHA256 and historical.get("artifact_hash") == SUPERSEDED_ARTIFACT_HASH


def _expected_system_assessment(
    document: dict, artifacts: list[EngineCertificationArtifact], comparison_results: tuple,
    *, receipt_valid: bool, source_stable: bool,
) -> dict[str, object]:
    records = document["engines"]
    benchmark = CertificationBenchmarkArtifact(tuple(artifacts), comparison_results)
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
        and record["certification_hash"] == artifact.artifact_hash
        and record["stress"]["report_hash"] == canonical_sha256(
            {key: value for key, value in record["stress"].items() if key != "report_hash"}
        )
        and all(
            case["evidence_hash"] == canonical_sha256({key: value for key, value in case.items() if key != "evidence_hash"})
            for case in record["stress"]["cases"]
        )
        and record["installed_identity"] == record["replay_identity"]
        for record, artifact in zip(records, artifacts)
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
        for record in records
    }
    failures_preserved = observed_results == EXPECTED_ENGINE_RESULTS
    clean = receipt_valid and all(
        record["fresh_environment"]
        and next(check for check in artifact.checks if check.code == "installed-version-lock-and-files").passed
        for record, artifact in zip(records, artifacts)
    )
    suite = document["core_suite"]
    checks = {
        "forge_owned_oracle_suite": _system_check(oracle_valid, [record["semantic_grades"] for record in records],
            "all Forge-owned tapes must be independently graded with positive and negative engine verdicts visible"),
        "certification_harness": _system_check(harness_valid, benchmark.to_dict(),
            "all four declared engines must have complete C0-C4 verdict evidence"),
        "artifact_consistency": _system_check(artifact_consistent, records,
            "embedded response, replay, certification, mutation, and identity evidence must be internally bound"),
        "replay_verification": _system_check(replay_valid, [record["replay_hash"] for record in records],
            "every engine response must reproduce byte-for-byte in a fresh worker process"),
        "c3_comparison_rules": _system_check(c3_valid, [item.to_dict() for item in comparison_results],
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
        "source_stability": _system_check(source_stable, document["source_manifest"],
            "certified source must remain unchanged during the run"),
        "historical_artifact_preserved": _system_check(_historical_artifact_is_preserved(),
            {"artifact_hash": SUPERSEDED_ARTIFACT_HASH, "file_sha256": SUPERSEDED_FILE_SHA256},
            "the original global-gate artifact must remain byte-identical and content-addressed"),
    }
    blockers = [{"gate": code.upper(), "reason": check["detail"]}
                for code, check in checks.items() if check["status"] != "PASS"]
    return {"checks": checks, "blocking_gates": blockers, "release_eligible": not blockers}


def verify_document(document: dict, *, check_source: bool = True) -> list[str]:
    errors: list[str] = []
    expected_keys = {
        "schema_version", "certification_summary", "minimum_engine_level", "maximum_engine_level",
        "engine_certification_target", "system_release_eligible", "system", "supersedes_artifact",
        "source_hash_convention", "source_manifest", "source_manifest_hash", "request", "request_hash",
        "independent_oracles", "clean_environment_receipt", "core_suite", "engines", "comparisons", "artifact_hash",
    }
    if set(document) != expected_keys:
        errors.append("SCHEMA_KEYS_INVALID")
    content = {key: value for key, value in document.items() if key != "artifact_hash"}
    if document.get("artifact_hash") != canonical_sha256(content):
        errors.append("ARTIFACT_HASH_MISMATCH")
    if document.get("schema_version") != "forge-engine-certification/0.2.4-system-release":
        return errors + ["SCHEMA_INVALID"]
    if any(key in document for key in ("certification_level", "release_eligible", "required_levels", "blocking_gates")):
        errors.append("AMBIGUOUS_GLOBAL_ENGINE_GATE_PRESENT")
    if document.get("engine_certification_target") != "C4":
        errors.append("ENGINE_TARGET_MISMATCH")
    if document.get("source_manifest_hash") != canonical_sha256(document.get("source_manifest")):
        errors.append("SOURCE_HASH_MISMATCH")
    current_source = source_manifest()
    source_stable = document.get("source_manifest") == current_source
    if check_source and not source_stable:
        errors.append("SOURCE_DRIFT")
    if document.get("request") != semantic_request() or document.get("request_hash") != semantic_request()["request_hash"]:
        errors.append("INPUT_TAPE_MISMATCH")
    if document.get("independent_oracles") != {t.tape_id: independent_semantic_oracle(t) for t in SEMANTIC_TAPES}:
        errors.append("ORACLE_MISMATCH")
    expected_supersession = {
        "artifact_hash": SUPERSEDED_ARTIFACT_HASH,
        "file_sha256": SUPERSEDED_FILE_SHA256,
        "path": HISTORICAL_ARTIFACT.relative_to(ROOT).as_posix(),
        "reason": "the prior release gate incorrectly conflated certification-system validity with the minimum third-party engine level",
    }
    if document.get("supersedes_artifact") != expected_supersession or not _historical_artifact_is_preserved():
        errors.append("HISTORICAL_ARTIFACT_MISMATCH")

    specs = {spec.engine: spec for spec in SPECS}
    records = document.get("engines", [])
    if len(records) != 4 or {record.get("engine") for record in records} != set(specs):
        return errors + ["ENGINE_MEMBERSHIP_INVALID"]
    receipt = document.get("clean_environment_receipt", {})
    receipt_content = {key: value for key, value in receipt.items() if key != "receipt_hash"}
    receipt_valid = bool(receipt) and receipt.get("receipt_hash") == canonical_sha256(receipt_content)
    artifacts: list[EngineCertificationArtifact] = []
    for record in records:
        engine = record["engine"]
        spec = specs[engine]
        first, second = record["response"], record["replay_response"]
        if record["response_hash"] != canonical_sha256(first) or record["replay_hash"] != canonical_sha256(second):
            errors.append(engine + ":REPLAY_HASH_MISMATCH")
        protocol, grades = grade_response(spec, first, document["request"])
        replay_protocol, replay_grades = grade_response(spec, second, document["request"])
        if grades != record["semantic_grades"]:
            errors.append(engine + ":SEMANTIC_GRADES_MISMATCH")
        cert = record["certification"]
        checks = tuple(CertificationCheck(item["code"], CertificationLevel[item["level"]], item["passed"],
                       item["evidence_hash"], item["detail"]) for item in cert["checks"])
        artifact = EngineCertificationArtifact(EngineFingerprint.from_dict(cert["engine_fingerprint"]), checks,
                    tuple(cert["supported_tapes"]), cert["unsupported_tapes"],
                    mandatory_tapes=tuple(cert["mandatory_tapes"]))
        artifacts.append(artifact)
        if cert != artifact.to_dict() or record["certification_hash"] != artifact.artifact_hash:
            errors.append(engine + ":CERTIFICATION_HASH_MISMATCH")
        blocking_tapes = sorted(item["tape_id"] for item in grades if item["state"] == "FAIL")
        if record.get("status") != artifact.status or record.get("blocking_tapes") != blocking_tapes:
            errors.append(engine + ":ENGINE_STATUS_MISMATCH")
        if record.get("findings") != ENGINE_FINDINGS.get(engine, {}):
            errors.append(engine + ":FINDINGS_MISMATCH")
        if tuple(cert["mandatory_tapes"]) != ENGINE_SUPPORTED_TAPES[engine]:
            errors.append(engine + ":CAPABILITY_POLICY_MISMATCH")
        identity = record["installed_identity"]
        installed = (identity["version"] == spec.version
                     and record["dependency_lock"] == record["observed_dependency_lock"]
                     and identity == record["replay_identity"])
        for response in (first, second):
            runtime = response.get("runtime", {})
            installed = installed and runtime.get("python_version", runtime.get("python")) == identity["python_version"] and runtime.get("platform") == identity["platform"]
        if engine == "legacy-hft":
            installed = installed and identity.get("direct_url", {}).get("vcs_info", {}).get("commit_id") == spec.commit
        provisioned = receipt.get("engines", {}).get(engine, {})
        expected_fresh = receipt_valid and provisioned == {
            "dependency_lock_hash": canonical_sha256(record["dependency_lock"]), "fresh_install": True,
        } and identity["isolated"]
        if record["fresh_environment"] != expected_fresh:
            errors.append(engine + ":FRESH_ENVIRONMENT_MISMATCH")
        check_map = {item.code: item for item in checks}
        claims = {
            "installed-version-lock-and-files": installed,
            "strict-bound-semantic-protocol": not protocol and not replay_protocol,
            "mandatory-oracle-backed-tapes": all(item["state"] != "FAIL" for item in grades) and any(item["state"] == "PASS" for item in grades),
            "canonical-byte-replay": first == second and grades == replay_grades,
            "host-and-native-result-mutations": record["stress"]["complete"],
        }
        if any(code not in check_map or check_map[code].passed != passed for code, passed in claims.items()):
            errors.append(engine + ":GATE_CLAIM_MISMATCH")
        stress = record["stress"]
        stress_content = {key: value for key, value in stress.items() if key != "report_hash"}
        if stress["report_hash"] != canonical_sha256(stress_content):
            errors.append(engine + ":STRESS_HASH_MISMATCH")
        semantic_stress = stress.get("semantic_mutations")
        complete = (len(stress["cases"]) == len(MUTATION_EXPECTATIONS) and all(case["passed"] for case in stress["cases"])
                    and (semantic_stress is None or semantic_stress["complete"]))
        if {case["mutation"] for case in stress["cases"]} != set(MUTATION_EXPECTATIONS) or stress["complete"] != complete:
            errors.append(engine + ":STRESS_COVERAGE_INVALID")
        for case in stress["cases"]:
            case_content = {key: value for key, value in case.items() if key != "evidence_hash"}
            if case["evidence_hash"] != canonical_sha256(case_content):
                errors.append(engine + ":MUTATION_EVIDENCE_HASH_MISMATCH")
            if case["expected_code"] != MUTATION_EXPECTATIONS[case["mutation"]] or case["passed"] != (case["expected_code"] in case["detected_codes"]):
                errors.append(engine + ":MUTATION_CLAIM_MISMATCH")
        if record["dependency_lock"] != record["observed_dependency_lock"]:
            errors.append(engine + ":LOCK_MISMATCH")
        if canonical_sha256(record["dependency_lock"]) != artifact.fingerprint.dependency_lock_hash:
            errors.append(engine + ":LOCK_HASH_MISMATCH")
        if record["installed_identity"] != record["replay_identity"]:
            errors.append(engine + ":ENGINE_DRIFT")

    comparison_records, comparison_results = differential_evidence(records)
    if comparison_records != document["comparisons"]:
        errors.append("DIFFERENTIAL_EVIDENCE_MISMATCH")
    for record, artifact in zip(records, artifacts):
        scoped = [item for item in comparison_records if record["engine"] in {item["left_engine"], item["right_engine"]}]
        expected_c3 = (any(item["expected_status"] == "PASS" and item["status"] == "PASS" for item in scoped)
                       and all(item["status"] == item["expected_status"] for item in scoped))
        c3 = next((check for check in artifact.checks if check.code == "scoped-semantic-comparisons"), None)
        if c3 is None or c3.passed != expected_c3 or c3.evidence_hash != canonical_sha256(scoped):
            errors.append(record["engine"] + ":C3_CLAIM_MISMATCH")
    benchmark = CertificationBenchmarkArtifact(tuple(artifacts), comparison_results)
    benchmark_report = benchmark.to_dict()
    for key in ("certification_summary", "minimum_engine_level", "maximum_engine_level"):
        if document.get(key) != benchmark_report[key]:
            errors.append(key.upper() + "_MISMATCH")
    observed_results = {
        record["engine"]: {"certification_level": record["certification"]["certification_level"],
                           "status": record["status"], "blocking_tapes": record["blocking_tapes"]}
        for record in records
    }
    if observed_results != EXPECTED_ENGINE_RESULTS:
        errors.append("ENGINE_RESULTS_MISMATCH")
    expected_system = _expected_system_assessment(
        document, artifacts, comparison_results, receipt_valid=receipt_valid,
        source_stable=source_stable if check_source else True,
    )
    if document.get("system") != expected_system:
        errors.append("SYSTEM_ASSESSMENT_MISMATCH")
    if document.get("system_release_eligible") != expected_system["release_eligible"]:
        errors.append("SYSTEM_RELEASE_ELIGIBILITY_MISMATCH")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, default=OUTPUT)
    parser.add_argument("--source-commit", help="also verify every source digest against this Git commit")
    args = parser.parse_args()
    document = json.loads(args.artifact.read_text())
    try:
        errors = verify_document(document)
        if args.source_commit:
            for path, expected in document["source_manifest"].items():
                completed = subprocess.run(["git", "show", args.source_commit + ":" + path],
                    cwd=ROOT, capture_output=True, check=False)
                if completed.returncode or sha256(completed.stdout.replace(b"\r\n", b"\n")).hexdigest() != expected:
                    errors.append("SOURCE_COMMIT_MISMATCH:" + path)
    except (KeyError, StopIteration, TypeError, ValueError) as exc:
        errors = ["SCHEMA_INVALID:" + str(exc)]
    print(json.dumps({"internally_consistent": not errors,
                      "system_release_eligible": document.get("system_release_eligible"),
                      "artifact_hash": document.get("artifact_hash"), "errors": errors}, sort_keys=True))
    return 0 if not errors else 2


if __name__ == "__main__":
    raise SystemExit(main())
