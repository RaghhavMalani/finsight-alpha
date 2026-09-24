"""Bounded subprocess capture shared by production workers and certification."""

from __future__ import annotations

import queue
import subprocess
import threading
import time
from pathlib import Path
from typing import Mapping, Sequence

from src.execution.failures import FailureCode


class WorkerResourceError(RuntimeError):
    code = FailureCode.WORKER_RESOURCE_FAILURE


def run_bounded(
    command: Sequence[str], *, input: bytes, timeout_seconds: float,
    max_output_bytes: int, cwd: str | Path | None = None,
    env: Mapping[str, str] | None = None,
) -> subprocess.CompletedProcess[bytes]:
    """Bound total stdout/stderr memory, stdin writes, and wall time.

    The bounded reader queue limits in-flight memory, including stderr. A worker
    exceeding either budget is killed and reaped before control returns.
    """
    if timeout_seconds <= 0 or max_output_bytes <= 0:
        raise ValueError("worker limits must be positive")
    try:
        process = subprocess.Popen(
            tuple(command), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, shell=False, cwd=cwd, env=env,
        )
    except OSError as exc:
        raise WorkerResourceError(f"worker launch failed: {type(exc).__name__}") from exc
    messages: queue.Queue[tuple[str, bytes | None]] = queue.Queue(maxsize=8)
    stopped = threading.Event()

    def emit(kind: str, chunk: bytes | None) -> None:
        while not stopped.is_set():
            try:
                messages.put((kind, chunk), timeout=0.05)
                return
            except queue.Full:
                continue

    def read(kind: str, stream: object) -> None:
        try:
            while not stopped.is_set():
                chunk = stream.read1(4096)
                if not chunk:
                    break
                emit(kind, chunk)
        except (OSError, ValueError):
            pass
        finally:
            emit(kind, None)

    def write() -> None:
        try:
            process.stdin.write(input)
            process.stdin.close()
        except (OSError, ValueError):
            pass

    threads = [
        threading.Thread(target=read, args=("stdout", process.stdout), daemon=True),
        threading.Thread(target=read, args=("stderr", process.stderr), daemon=True),
        threading.Thread(target=write, daemon=True),
    ]
    for thread in threads:
        thread.start()
    deadline = time.monotonic() + timeout_seconds
    captured = {"stdout": bytearray(), "stderr": bytearray()}
    finished: set[str] = set()
    total = 0
    try:
        while len(finished) != 2:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise WorkerResourceError("worker timeout exceeded the configured wall-time limit")
            try:
                kind, chunk = messages.get(timeout=min(remaining, 0.05))
            except queue.Empty:
                continue
            if chunk is None:
                finished.add(kind)
                continue
            total += len(chunk)
            if total > max_output_bytes:
                raise WorkerResourceError("worker response exceeded the configured byte limit")
            captured[kind].extend(chunk)
        try:
            returncode = process.wait(timeout=max(0.001, deadline - time.monotonic()))
        except subprocess.TimeoutExpired as exc:
            raise WorkerResourceError("worker timeout exceeded the configured wall-time limit") from exc
        return subprocess.CompletedProcess(tuple(command), returncode, bytes(captured["stdout"]), bytes(captured["stderr"]))
    finally:
        stopped.set()
        if process.poll() is None:
            process.kill()
        process.wait()
        for thread in threads:
            thread.join(timeout=0.2)
        for stream in (process.stdin, process.stdout, process.stderr):
            # Descendants retaining a pipe must not block deadline cleanup.
            if stream is not None and not any(thread.is_alive() for thread in threads):
                stream.close()
