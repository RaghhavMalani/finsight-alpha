"""Supervise isolated Python experiments and emit attested results."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

from src.eval.canonical import canonical_sha256, sha256_bytes
from src.sandbox.artifacts import artifact_hashes, hash_tree, write_frozen_inputs
from src.sandbox.cleanup import remove_runner_tree
from src.sandbox.exceptions import SandboxIntegrityError, SandboxManifestError
from src.sandbox.manifest import SandboxManifest, hash_input_files
from src.sandbox.policy import SandboxPolicy


class ExecutionStatus(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    POLICY_VIOLATION = "policy_violation"
    TIMEOUT = "timeout"
    MEMORY_LIMIT = "memory_limit"
    INTEGRITY_FAILURE = "integrity_failure"
    SEED_MISMATCH = "seed_mismatch"
    OUTPUT_LIMIT = "output_limit"


@dataclass(frozen=True)
class ExecutionResult:
    execution_id: str
    status: ExecutionStatus
    exit_code: int | None
    stdout_hash: str
    stderr_hash: str
    artifact_hashes: dict[str, str]
    runtime_ms: int
    peak_memory_mb: float
    manifest_hash: str
    integrity_ok: bool
    termination_reason: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.status is ExecutionStatus.SUCCEEDED

    @property
    def reproducibility_hash(self) -> str:
        """Identity of deterministic outputs, excluding metering noise."""

        return canonical_sha256(
            {
                "status": self.status.value,
                "exit_code": self.exit_code,
                "stdout_hash": self.stdout_hash,
                "stderr_hash": self.stderr_hash,
                "artifact_hashes": self.artifact_hashes,
                "manifest_hash": self.manifest_hash,
                "integrity_ok": self.integrity_ok,
            }
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "status": self.status.value,
            "exit_code": self.exit_code,
            "stdout_hash": self.stdout_hash,
            "stderr_hash": self.stderr_hash,
            "artifact_hashes": dict(sorted(self.artifact_hashes.items())),
            "runtime_ms": self.runtime_ms,
            "peak_memory_mb": self.peak_memory_mb,
            "manifest_hash": self.manifest_hash,
            "integrity_ok": self.integrity_ok,
            "termination_reason": self.termination_reason,
            "reproducibility_hash": self.reproducibility_hash,
        }


def _resident_memory_mb(pid: int) -> float:
    try:
        import psutil  # type: ignore

        return psutil.Process(pid).memory_info().rss / (1024 * 1024)
    except Exception:
        pass
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes

            class Counters(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD),
                    ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t),
                ]

            handle = ctypes.windll.kernel32.OpenProcess(0x0410, False, pid)
            if not handle:
                return 0.0
            counters = Counters()
            counters.cb = ctypes.sizeof(counters)
            ok = ctypes.windll.psapi.GetProcessMemoryInfo(
                handle, ctypes.byref(counters), counters.cb
            )
            ctypes.windll.kernel32.CloseHandle(handle)
            return counters.WorkingSetSize / (1024 * 1024) if ok else 0.0
        except Exception:
            return 0.0
    try:
        status = Path(f"/proc/{pid}/status").read_text(encoding="utf-8")
        for line in status.splitlines():
            if line.startswith("VmRSS:"):
                return float(line.split()[1]) / 1024
    except Exception:
        pass
    return 0.0


def _limit_cpu_affinity(pid: int, cpu_limit: int) -> None:
    available = max(1, os.cpu_count() or 1)
    count = min(cpu_limit, available)
    try:
        import psutil  # type: ignore

        process = psutil.Process(pid)
        eligible = process.cpu_affinity()
        process.cpu_affinity(eligible[: min(count, len(eligible))])
        return
    except Exception:
        pass
    if os.name == "nt":
        try:
            import ctypes

            handle = ctypes.windll.kernel32.OpenProcess(0x0200, False, pid)
            if handle:
                ctypes.windll.kernel32.SetProcessAffinityMask(handle, (1 << count) - 1)
                ctypes.windll.kernel32.CloseHandle(handle)
        except Exception:
            pass
    elif hasattr(os, "sched_setaffinity"):
        try:
            os.sched_setaffinity(pid, set(range(count)))
        except OSError:
            pass


class SandboxRunner:
    """Run one program per fresh directory under a monitored child process."""

    def __init__(self, root: str | Path, policy: SandboxPolicy | None = None) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.policy = policy or SandboxPolicy()
        self._counter = 0
        self._artifact_roots: dict[str, Path] = {}

    def execute(
        self,
        code: str,
        *,
        manifest: SandboxManifest,
        inputs: dict[str, bytes] | None = None,
    ) -> ExecutionResult:
        files = dict(inputs or {})
        if manifest.network:
            raise SandboxManifestError("Forge v0.2 requires network=False")
        if hash_input_files(files) != manifest.dataset_hash:
            raise SandboxIntegrityError("manifest dataset_hash does not match frozen inputs")
        resolved_manifest = manifest.bind_program(code)
        self._counter += 1
        execution_id = f"execution-{self._counter:04d}"
        run_root = self.root / execution_id
        while run_root.exists():
            self._counter += 1
            execution_id = f"execution-{self._counter:04d}"
            run_root = self.root / execution_id
        workspace = run_root / "workspace"
        artifacts = run_root / "artifacts"
        control = run_root / "control"
        run_root.mkdir(parents=True)
        artifacts.mkdir()
        control.mkdir()
        write_frozen_inputs(workspace, files)
        before_hash = hash_tree(workspace)
        program_path = control / "program.py"
        config_path = control / "config.json"
        result_path = control / "worker-result.json"
        stdout_path = control / "stdout.bin"
        stderr_path = control / "stderr.bin"
        program_path.write_text(code, encoding="utf-8")
        config = {
            "workspace": str(workspace),
            "artifacts": str(artifacts),
            "control": str(control),
            "program": str(program_path),
            "result": str(result_path),
            "manifest": resolved_manifest.to_dict(),
        }
        config_path.write_text(json.dumps(config, sort_keys=True), encoding="utf-8")
        worker_path = Path(__file__).with_name("_worker.py")
        command = [sys.executable, "-I", str(worker_path), str(config_path)]
        started = time.perf_counter()
        peak_memory = 0.0
        forced_status: ExecutionStatus | None = None
        forced_reason: str | None = None
        with stdout_path.open("wb") as stdout_handle, stderr_path.open("wb") as stderr_handle:
            process = subprocess.Popen(
                command,
                cwd=str(artifacts),
                stdin=subprocess.DEVNULL,
                stdout=stdout_handle,
                stderr=stderr_handle,
                env={
                    "PATH": os.environ.get("PATH", ""),
                    "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),
                    "WINDIR": os.environ.get("WINDIR", ""),
                    "PYTHONHASHSEED": str(resolved_manifest.seed),
                    "PYTHONDONTWRITEBYTECODE": "1",
                },
            )
            _limit_cpu_affinity(process.pid, resolved_manifest.cpu_limit)
            while process.poll() is None:
                elapsed = time.perf_counter() - started
                peak_memory = max(peak_memory, _resident_memory_mb(process.pid))
                if elapsed > resolved_manifest.timeout_seconds:
                    forced_status = ExecutionStatus.TIMEOUT
                    forced_reason = "wall-clock timeout exceeded"
                elif peak_memory > resolved_manifest.memory_mb:
                    forced_status = ExecutionStatus.MEMORY_LIMIT
                    forced_reason = "resident memory limit exceeded"
                elif (
                    stdout_path.stat().st_size + stderr_path.stat().st_size
                    > self.policy.max_output_bytes
                ):
                    forced_status = ExecutionStatus.OUTPUT_LIMIT
                    forced_reason = "combined output limit exceeded"
                if forced_status is not None:
                    process.kill()
                    break
                time.sleep(self.policy.poll_interval_seconds)
            process.wait()
        runtime_ms = max(0, round((time.perf_counter() - started) * 1000))
        peak_memory = max(peak_memory, _resident_memory_mb(process.pid))
        stdout_hash = sha256_bytes(stdout_path.read_bytes())
        stderr_hash = sha256_bytes(stderr_path.read_bytes())
        worker_result: dict[str, Any] = {}
        if result_path.exists():
            try:
                worker_result = json.loads(result_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                worker_result = {}
        status = forced_status or ExecutionStatus(
            worker_result.get(
                "status",
                ExecutionStatus.SUCCEEDED.value
                if process.returncode == 0
                else ExecutionStatus.FAILED.value,
            )
        )
        reason = forced_reason or worker_result.get("reason")
        after_hash = hash_tree(workspace)
        integrity_ok = before_hash == after_hash and status is not ExecutionStatus.INTEGRITY_FAILURE
        if not integrity_ok:
            status = ExecutionStatus.INTEGRITY_FAILURE
            reason = reason or "frozen input tree changed"
        try:
            hashes = artifact_hashes(
                artifacts,
                max_files=self.policy.max_artifacts,
                max_bytes=self.policy.max_artifact_bytes,
            )
        except Exception as exc:
            hashes = {}
            if status is ExecutionStatus.SUCCEEDED:
                status = ExecutionStatus.POLICY_VIOLATION
                reason = str(exc)
        self._artifact_roots[execution_id] = artifacts
        return ExecutionResult(
            execution_id=execution_id,
            status=status,
            exit_code=process.returncode,
            stdout_hash=stdout_hash,
            stderr_hash=stderr_hash,
            artifact_hashes=hashes,
            runtime_ms=runtime_ms,
            peak_memory_mb=round(peak_memory, 3),
            manifest_hash=resolved_manifest.manifest_hash,
            integrity_ok=integrity_ok,
            termination_reason=reason,
        )

    def read_artifact(self, execution_id: str, name: str) -> bytes:
        root = self._artifact_roots.get(execution_id)
        if root is None:
            raise KeyError(f"unknown execution {execution_id!r}")
        target = (root / name).resolve()
        if root != target and root not in target.parents:
            raise SandboxIntegrityError("artifact path escapes execution root")
        return target.read_bytes()

    def clean(self) -> None:
        """Remove only this runner's explicitly configured execution root."""

        if self.root.exists():
            remove_runner_tree(self.root)
