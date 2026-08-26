"""Run real isolated-engine probes twice and freeze honest certification evidence."""

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.eval.canonical import canonical_sha256
from src.execution.certification import CertificationCheck, CertificationLevel, EngineCertificationArtifact
from src.execution.comparison import ComparisonContract
from src.execution.fingerprints import EngineFingerprint
from src.execution.tapes import SYNTHETIC_TAPES


OUTPUT = ROOT / "eval" / "certification" / "forge_v0_2_4" / "engine_probe_artifact.json"


@dataclass(frozen=True)
class ProbeSpec:
    engine: str
    distribution: str
    version: str
    commit: str
    environment: str
    script: str
    rust_version: str
    supported_tapes: tuple[str, ...]


SPECS = (
    ProbeSpec("vectorbt", "vectorbt", "1.1.0", "259d2d89fe2e7638baf3ca76c394937cd32b656d", "vectorbt", "vectorbt_probe.py", "UNSUPPORTED", ()),
    ProbeSpec("nautilus", "nautilus_trader", "1.231.0", "d3e1685e979925d7b0ffacd1b3f442547686e18f", "nautilus", "nautilus_probe.py", "1.97.1", ()),
    ProbeSpec("hftbacktest", "hftbacktest", "2.4.4", "a244a14250b42d97fc305569c93c4117cd5e1dff", "hftbacktest", "hftbacktest_probe.py", "wheel-build-toolchain-not-exposed", ()),
    ProbeSpec("legacy-hft", "backtesting-hft", "0.5.0", "737ce7bda4a31b839dd8179eab5f3aae22040c3e", "legacy-hft", "legacy_hft_probe.py", "UNSUPPORTED", ()),
)


def _python(spec: ProbeSpec) -> Path:
    return ROOT / ".engine-envs" / spec.environment / "Scripts" / "python.exe"


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    env = {key: value for key, value in os.environ.items() if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"}}
    env.update({"PYTHONUTF8": "1", "PYTHONHASHSEED": "0", "MPLBACKEND": "Agg", "MPLCONFIGDIR": str(ROOT / ".engine-envs" / ".matplotlib")})
    return subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120, check=False)


def _probe(spec: ProbeSpec) -> tuple[dict[str, object], str]:
    completed = _run([str(_python(spec)), str(ROOT / "scripts" / "engine_certification" / spec.script)])
    if completed.returncode != 0:
        raise RuntimeError(f"{spec.engine} probe failed: {completed.stderr[-2000:]}")
    candidates = [line for line in completed.stdout.splitlines() if line.startswith("{")]
    if not candidates:
        raise RuntimeError(f"{spec.engine} probe produced no canonical JSON")
    payload = json.loads(candidates[-1])
    return payload, canonical_sha256(payload)


def _lock(spec: ProbeSpec) -> tuple[tuple[str, ...], str]:
    completed = _run([str(_python(spec)), "-m", "pip", "freeze", "--all"])
    if completed.returncode != 0:
        raise RuntimeError(f"{spec.engine} dependency enumeration failed")
    lines = tuple(sorted(line.strip() for line in completed.stdout.splitlines() if line.strip()))
    return lines, canonical_sha256(lines)


def main() -> int:
    tapes = {tape.tape_id for tape in SYNTHETIC_TAPES}
    records: list[dict[str, object]] = []
    probe_values: dict[str, dict[str, object]] = {}
    artifacts: list[EngineCertificationArtifact] = []
    for spec in SPECS:
        first, first_hash = _probe(spec)
        second, second_hash = _probe(spec)
        lock, lock_hash = _lock(spec)
        probe_path = ROOT / "scripts" / "engine_certification" / spec.script
        worker_hash = sha256(probe_path.read_bytes() + json.dumps(lock, separators=(",", ":")).encode()).hexdigest()
        fingerprint = EngineFingerprint(
            engine=spec.engine, engine_version=spec.version, upstream_commit=spec.commit,
            python_version=platform.python_version(), rust_version=spec.rust_version,
            dependency_lock_hash=lock_hash, worker_image_hash=worker_hash,
            platform=platform.platform(),
        )
        version_ok = first.get("version") == spec.version
        domain_ok = {
            "vectorbt": first.get("order_count") == 2 and first.get("fees") == 1.01,
            "nautilus": first.get("iterations") == 2,
            "hftbacktest": first.get("best_bid") == 100.0 and first.get("best_ask") == 101.0,
            "legacy-hft": first.get("delay_us") == 250 and first.get("best_ask") == 101.0,
        }[spec.engine]
        checks = [
            CertificationCheck("installed-and-version-bound", CertificationLevel.C0_PROTOCOL_SCHEMA, version_ok, lock_hash, spec.version),
            CertificationCheck("native-simulator-invoked", CertificationLevel.C0_PROTOCOL_SCHEMA, first.get("engine") == spec.engine, first_hash, spec.script),
            CertificationCheck("oracle-backed-canonical-tape", CertificationLevel.C1_ACCOUNTING_EVENTS, domain_ok and bool(spec.supported_tapes), first_hash, "native observation is not C1 until the exact canonical tape is normalized"),
            CertificationCheck("canonical-byte-replay", CertificationLevel.C2_EXACT_REPLAY, first_hash == second_hash, second_hash, "two fresh worker processes"),
            CertificationCheck("scoped-comparison-contract", CertificationLevel.C3_SCOPED_AGREEMENT, spec.engine != "nautilus", first_hash, "raw probe overlap only; ladder remains gated by C1"),
            CertificationCheck("seven-tape-stress-and-mutations", CertificationLevel.C4_STRESS_MUTATIONS, False, canonical_sha256(spec.supported_tapes), "real adapter coverage is incomplete; release must not be tagged"),
        ]
        unsupported = {tape: "native certified adapter not yet implemented for this tape" for tape in sorted(tapes - set(spec.supported_tapes))}
        artifact = EngineCertificationArtifact(fingerprint, tuple(checks), spec.supported_tapes, unsupported)
        artifacts.append(artifact)
        probe_values[spec.engine] = first
        records.append({"engine": spec.engine, "probe": first, "probe_hash": first_hash, "replay_hash": second_hash, "dependency_lock": list(lock), "certification": artifact.to_dict(), "certification_hash": artifact.artifact_hash})

    book_contract = ComparisonContract("hftbacktest", "legacy-hft", frozenset({"l2_book"}), frozenset({"l2_book"}), tolerances={"best_bid": 0.0, "best_ask": 0.0})
    book_comparison = book_contract.compare(probe_values["hftbacktest"], probe_values["legacy-hft"], required_capability="l2_book")
    non_comparable = ComparisonContract("vectorbt", "hftbacktest", frozenset({"bars"}), frozenset({"l2_book"}), tolerances={"fees": 0.0}).compare(probe_values["vectorbt"], probe_values["hftbacktest"], required_capability="bars")
    document = {
        "schema_version": "forge-engine-probes/0.2.4",
        "release_eligible": False,
        "reason": "C1 oracle-backed canonical tapes and C4 stress/mutation coverage are incomplete",
        "engines": records,
        "comparisons": [
            {"status": book_comparison.status.value, "capability": book_comparison.capability, "metric_deltas": dict(book_comparison.metric_deltas), "reason": book_comparison.reason},
            {"status": non_comparable.status.value, "capability": non_comparable.capability, "metric_deltas": dict(non_comparable.metric_deltas), "reason": non_comparable.reason},
        ],
    }
    document["artifact_hash"] = canonical_sha256(document)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"artifact": str(OUTPUT), "artifact_hash": document["artifact_hash"], "release_eligible": False}, sort_keys=True))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
