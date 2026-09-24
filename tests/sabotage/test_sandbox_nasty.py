import os
from pathlib import Path

import pytest

from src.sandbox import ExecutionStatus, SandboxManifest, SandboxPolicy, SandboxRunner, hash_input_files


def _run(tmp_path: Path, code: str, *, output_limit: int = 1024 * 1024):
    inputs = {"input.json": b"{}"}
    manifest = SandboxManifest.build(
        task_id="nasty-sabotage",
        as_of="2020-01-01T00:00:00Z",
        seed=42,
        dataset_hash=hash_input_files(inputs),
        timeout_seconds=0.5,
        memory_mb=128,
    )
    runner = SandboxRunner(
        tmp_path,
        policy=SandboxPolicy(max_output_bytes=output_limit),
    )
    return runner.execute(code, manifest=manifest, inputs=inputs)


@pytest.mark.parametrize(
    "code",
    [
        "import subprocess",
        "import os\nos.system('echo escaped')",
        "import socket\nsocket.getaddrinfo('example.com', 443)",
        "import urllib.request\nurllib.request.urlopen('https://example.com')",
        "import requests",
        "__import__('subprocess')",
        "eval(\"__import__('socket')\")",
        "import importlib",
        "import threading",
        "import time\ntime.sleep(10)",
        "import datetime\ndatetime.datetime.now()",
        "import os\nos.urandom(16)",
        "import src.verifiers",
    ],
)
def test_escape_dynamic_network_thread_clock_and_entropy_attacks_are_blocked(
    tmp_path, code
):
    result = _run(tmp_path, code)
    assert result.status in {
        ExecutionStatus.POLICY_VIOLATION,
        ExecutionStatus.SEED_MISMATCH,
    }


def test_path_tmp_and_symlink_traversal_are_blocked(tmp_path):
    outside = tmp_path.parent / "outside-secret.txt"
    outside.write_text("secret", encoding="utf-8")
    attacks = (
        "(INPUT_DIR / '..' / 'control' / 'program.py').read_text()",
        f"open({str(outside)!r}, 'r').read()",
        f"import os\nos.symlink({str(outside)!r}, ARTIFACT_DIR / 'escape-link')",
    )
    for index, code in enumerate(attacks):
        result = _run(tmp_path / str(index), code)
        assert result.status is ExecutionStatus.POLICY_VIOLATION


def test_environment_secret_is_not_inherited(tmp_path, monkeypatch):
    monkeypatch.setenv("FORGE_TEST_SECRET", "must-not-cross-boundary")
    result = _run(
        tmp_path,
        "import os\nassert 'FORGE_TEST_SECRET' not in os.environ\n"
        "(ARTIFACT_DIR / 'ok.txt').write_text('isolated')",
    )
    assert result.status is ExecutionStatus.SUCCEEDED


def test_fork_pickle_process_and_huge_stdout_attacks_are_terminated(tmp_path):
    process_attacks = (
        "import os\ngetattr(os, 'fork', lambda: os.system('echo no'))()",
        "import pickle, os\n"
        "class Payload:\n"
        "    def __reduce__(self):\n"
        "        return (os.system, ('echo escaped',))\n"
        "pickle.loads(pickle.dumps(Payload()))",
    )
    for index, code in enumerate(process_attacks):
        result = _run(tmp_path / f"process-{index}", code)
        assert result.status is ExecutionStatus.POLICY_VIOLATION
    output = _run(tmp_path / "stdout", "while True:\n    print('x' * 4096)", output_limit=8192)
    assert output.status is ExecutionStatus.OUTPUT_LIMIT
