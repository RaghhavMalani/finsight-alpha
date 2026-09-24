"""Fail closed when release authorship or repository attribution is ambiguous."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_NAME = "Raghhav Malani"
EXPECTED_EMAIL = "96712854+RaghhavMalani@users.noreply.github.com"
TEXT_SUFFIXES = {
    ".md",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".toml",
    ".yaml",
    ".yml",
    ".txt",
    ".sh",
    ".ps1",
}
ATTRIBUTION_PATTERNS = (
    re.compile(r"(?im)^Co-Authored-By:\s*.*(?:Claude|Codex|ChatGPT|OpenAI|Anthropic)"),
    re.compile(r"(?i)Generated\s+(?:by|with)\s+(?:Claude|Codex|ChatGPT)"),
    re.compile(r"(?i)(?:Claude|Codex|ChatGPT)\s+(?:generated|authored)"),
)


def _git(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "git command failed")
    return completed.stdout


def _repository_text_files() -> list[Path]:
    output = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    ).stdout
    paths: list[Path] = []
    for raw in output.split(b"\0"):
        if not raw:
            continue
        relative = Path(raw.decode("utf-8", errors="surrogateescape"))
        if relative.suffix.lower() in TEXT_SUFFIXES:
            paths.append(ROOT / relative)
    return paths


def audit_release_authorship() -> dict[str, Any]:
    """Audit local commit identity and accidental AI authorship declarations."""

    errors: list[str] = []
    local_name = _git("config", "--local", "--get", "user.name").strip()
    local_email = _git("config", "--local", "--get", "user.email").strip()
    if local_name != EXPECTED_NAME:
        errors.append(f"repository user.name must be {EXPECTED_NAME!r}")
    if local_email != EXPECTED_EMAIL:
        errors.append(f"repository user.email must be {EXPECTED_EMAIL!r}")

    accidental_attribution: list[dict[str, Any]] = []
    for path in _repository_text_files():
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for line_number, line in enumerate(content.splitlines(), start=1):
            if any(pattern.search(line) for pattern in ATTRIBUTION_PATTERNS):
                accidental_attribution.append(
                    {
                        "path": str(path.relative_to(ROOT)),
                        "line": line_number,
                    }
                )

    head_body = _git("show", "-s", "--format=%B", "HEAD")
    if any(pattern.search(head_body) for pattern in ATTRIBUTION_PATTERNS):
        accidental_attribution.append({"path": "HEAD commit message", "line": 1})
    if accidental_attribution:
        errors.append("accidental AI authorship attribution detected")

    head_identity = _git(
        "show", "-s", "--format=%an <%ae> | %cn <%ce>", "HEAD"
    ).strip()
    return {
        "valid": not errors,
        "expected_identity": f"{EXPECTED_NAME} <{EXPECTED_EMAIL}>",
        "repository_identity": f"{local_name} <{local_email}>",
        "head_identity_audit": head_identity,
        "accidental_attribution": accidental_attribution,
        "legal_attribution_policy": (
            "Preserve third-party copyright, license, NOTICE, and dependency attribution; "
            "this gate removes no legal attribution."
        ),
        "errors": errors,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.parse_args()
    report = audit_release_authorship()
    print(json.dumps(report, indent=2, sort_keys=True))
    raise SystemExit(0 if report["valid"] else 1)


if __name__ == "__main__":
    main()
