import json

from src.eval.canonical import canonical_json_bytes
from src.sandbox import (
    ExecutionStatus,
    SandboxManifest,
    SandboxRunner,
    hash_input_files,
)


def _manifest(inputs, *, timeout=2.0, memory_mb=128):
    return SandboxManifest.build(
        task_id="sandbox-test",
        as_of="2020-01-01T00:00:00Z",
        seed=42,
        dataset_hash=hash_input_files(inputs),
        timeout_seconds=timeout,
        memory_mb=memory_mb,
    )


def test_sandbox_returns_attested_artifacts_and_replay_identity(tmp_path):
    inputs = {"input.json": canonical_json_bytes({"value": 21})}
    code = """
import json
value = json.loads((INPUT_DIR / "input.json").read_text())["value"]
(ARTIFACT_DIR / "result.json").write_text(json.dumps({"value": value * 2}, sort_keys=True))
"""
    runner = SandboxRunner(tmp_path / "runs")
    first = runner.execute(code, manifest=_manifest(inputs), inputs=inputs)
    second = runner.execute(code, manifest=_manifest(inputs), inputs=inputs)

    assert first.status is ExecutionStatus.SUCCEEDED
    assert first.integrity_ok
    assert first.manifest_hash == second.manifest_hash
    assert first.reproducibility_hash == second.reproducibility_hash
    assert json.loads(runner.read_artifact(first.execution_id, "result.json")) == {
        "value": 42
    }


def test_sandbox_blocks_network_outside_reads_and_outside_writes(tmp_path):
    inputs = {"input.json": b"{}"}
    manifest = _manifest(inputs)
    secret = tmp_path / "secret.txt"
    secret.write_text("secret", encoding="utf-8")
    outside = tmp_path / "outside.txt"
    attacks = (
        "import socket\nsocket.create_connection(('example.com', 80))",
        f"open({str(secret)!r}, 'r').read()",
        f"open({str(outside)!r}, 'w').write('escape')",
    )
    for index, code in enumerate(attacks):
        result = SandboxRunner(tmp_path / f"attack-{index}").execute(
            code, manifest=manifest, inputs=inputs
        )
        assert result.status is ExecutionStatus.POLICY_VIOLATION
    assert not outside.exists()


def test_sandbox_times_out_and_terminates_memory_bomb(tmp_path):
    inputs = {"input.json": b"{}"}
    timeout = SandboxRunner(tmp_path / "timeout").execute(
        "while True:\n    pass",
        manifest=_manifest(inputs, timeout=0.15),
        inputs=inputs,
    )
    memory = SandboxRunner(tmp_path / "memory").execute(
        "payload = bytearray(256 * 1024 * 1024)\nwhile True:\n    pass",
        manifest=_manifest(inputs, timeout=3.0, memory_mb=64),
        inputs=inputs,
    )
    assert timeout.status is ExecutionStatus.TIMEOUT
    assert memory.status is ExecutionStatus.MEMORY_LIMIT


def test_sandbox_detects_seed_input_and_dependency_sabotage(tmp_path):
    inputs = {"input.json": b"{}"}
    manifest = _manifest(inputs)
    cases = (
        (
            "import random\nrandom.seed(SANDBOX_SEED + 1)",
            ExecutionStatus.SEED_MISMATCH,
        ),
        (
            "(INPUT_DIR / 'input.json').write_text('tampered')",
            ExecutionStatus.INTEGRITY_FAILURE,
        ),
        ("import sklearn", ExecutionStatus.POLICY_VIOLATION),
    )
    for index, (code, expected) in enumerate(cases):
        result = SandboxRunner(tmp_path / f"sabotage-{index}").execute(
            code, manifest=manifest, inputs=inputs
        )
        assert result.status is expected
