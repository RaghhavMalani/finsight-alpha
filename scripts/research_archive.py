"""Audit an immutable execution guard against its recorded historical Git view.

The original numerical code and guard are not changed or executed as a study.
Only the original guard function is evaluated with HEAD bound to confirmation's
recorded commit. Later unrelated platform code cannot rewrite that history.
"""

import ast
import hashlib
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace

BASELINE = "651df088052628ad59f4dbe12c499dcb8437e30a"
CONFIRMATION = "39a30ac783f1cbc6990aab236c504f231bfaf29a"


def historical_guard(root: Path, original: dict, confirmation: dict):
    commit = confirmation["code_commit"]
    if commit != CONFIRMATION:
        raise ValueError("Recorded confirmation execution identity changed")
    source = subprocess.check_output(
        ["git", "show", commit + ":src/research_os/calibration_v011/study.py"], cwd=root
    )
    node = next(
        n
        for n in ast.parse(source).body
        if isinstance(n, ast.FunctionDef) and n.name == "assert_inference_unchanged"
    )

    def read_git(args, **kwargs):
        fixed = [
            commit
            if arg == "HEAD"
            else commit + arg[4:]
            if isinstance(arg, str) and arg.startswith("HEAD:")
            else arg
            for arg in args
        ]
        return subprocess.check_output(fixed, **kwargs)

    digest = lambda raw: hashlib.sha256(raw).hexdigest()
    namespace = {
        "ast": ast,
        "json": json,
        "subprocess": SimpleNamespace(check_output=read_git),
        "digest": digest,
        "PROTOCOL_SHA": "59c69a7807fb757ace22fca4f20b7c883ea43f48dad30a6eb608c936e35b248e",
    }
    code = compile(
        ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[])),
        "<immutable historical guard>",
        "exec",
    )
    exec(code, namespace)
    seal = namespace["assert_inference_unchanged"](root, original)
    if seal != confirmation["pre_confirmation_guard_repair_hash"]:
        raise ValueError("Historical guard receipt mismatch")
    return seal


def verify_closed_history(root: Path):
    paths = [
        "data/exports/research_os_v0_1",
        "data/exports/research_os_v0_1_1",
        "src/research_os",
        "docs/findings/momentum-regimes.md",
        "docs/findings/momentum-regimes-forest.png",
        "docs/findings/inference-calibration-v0.1.1.md",
        "docs/findings/inference-calibration-v0.1.1.png",
    ]
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", BASELINE, "--", *paths], cwd=root, text=True
    )
    if changed.strip():
        raise ValueError("Closed research history changed: " + changed)
    folder = root / "data/exports/research_os_v0_1_1"
    discovery = json.loads((folder / "discovery.json").read_bytes())
    confirmation = json.loads((folder / "confirmation.json").read_bytes())
    if confirmation["status"] != "NOT_CONFIRMED":
        raise ValueError("Closed calibration badge changed")
    return historical_guard(root, discovery["execution"], confirmation["execution"])
