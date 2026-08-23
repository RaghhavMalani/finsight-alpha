"""Content-addressing helpers for sandbox inputs and outputs."""

from __future__ import annotations

from pathlib import Path

from src.eval.canonical import canonical_sha256, sha256_bytes
from src.sandbox.exceptions import SandboxIntegrityError, SandboxPolicyError


def hash_file(path: Path) -> str:
    digest = __import__("hashlib").sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def hash_tree(root: Path) -> str:
    if not root.exists():
        return canonical_sha256({})
    values: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise SandboxIntegrityError("symlinks are forbidden in sandbox trees")
        if path.is_file():
            values[path.relative_to(root).as_posix()] = hash_file(path)
    return canonical_sha256(values)


def artifact_hashes(
    root: Path,
    *,
    max_files: int,
    max_bytes: int,
) -> dict[str, str]:
    files = [path for path in sorted(root.rglob("*")) if path.is_file()]
    if any(path.is_symlink() for path in root.rglob("*")):
        raise SandboxPolicyError("artifact symlinks are forbidden")
    if len(files) > max_files:
        raise SandboxPolicyError("artifact count exceeds sandbox policy")
    total = sum(path.stat().st_size for path in files)
    if total > max_bytes:
        raise SandboxPolicyError("artifact bytes exceed sandbox policy")
    return {path.relative_to(root).as_posix(): hash_file(path) for path in files}


def write_frozen_inputs(root: Path, files: dict[str, bytes]) -> None:
    root.mkdir(parents=True, exist_ok=False)
    resolved_root = root.resolve()
    for name, payload in sorted(files.items()):
        target = (root / name).resolve()
        if target == resolved_root or resolved_root not in target.parents:
            raise SandboxIntegrityError(f"input path escapes workspace: {name!r}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        try:
            target.chmod(0o444)
        except OSError:
            pass
