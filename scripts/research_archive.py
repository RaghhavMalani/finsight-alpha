"""Audit an immutable execution guard against its recorded historical Git view.

The original numerical code and guard are not changed or executed as a study.
Only the original guard function is evaluated with HEAD bound to confirmation's
recorded commit. Later unrelated platform code cannot rewrite that history.
"""

import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
from types import SimpleNamespace

BASELINE = "651df088052628ad59f4dbe12c499dcb8437e30a"
CONFIRMATION = "39a30ac783f1cbc6990aab236c504f231bfaf29a"
SHARED_BASELINE = "2f2abb731851f44ba1189491b95d7c17f16464b2"
SHARED_PATHS = [
    "src/dynamics",
    "eval/dynamics",
    "src/findings",
    "src/verifiers",
    "src/data/license_policy.py",
    "src/replay",
    "src/regime_intelligence",
    "frontend-v2/src/forge",
    "frontend-v2/src/agents",
    "docs/forge-reference.html",
]
PUBLIC = "frontend-v2/public"


def same_json(left, right):
    # Python equality aliases False with 0; frozen JSON evidence must not do so.
    return json.dumps(left, sort_keys=True, allow_nan=False) == json.dumps(
        right, sort_keys=True, allow_nan=False
    )


def verify_shared_history(root: Path):
    """Keep finished evidence immutable while admitting the Phase 2 publication.

    Audit the original phase boundary at its closed commit. At today's boundary,
    old public files and manifest entries stay frozen; only the reviewed plugin
    fixture route and content-addressed synthetic run artifacts may be appended.
    This audit reads evidence and never executes a model or opens a holdout.
    """
    historical = subprocess.check_output(
        [
            "git",
            "diff",
            "--name-only",
            SHARED_BASELINE,
            BASELINE,
            "--",
            *SHARED_PATHS,
            PUBLIC,
        ],
        cwd=root,
        text=True,
    )
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", BASELINE, "--", *SHARED_PATHS],
        cwd=root,
        text=True,
    )
    if historical.strip() or changed.strip():
        raise ValueError("Protected phase evidence changed: " + historical + changed)
    original = json.loads(
        subprocess.check_output(
            ["git", "show", BASELINE + ":" + PUBLIC + "/replay-manifest.json"], cwd=root
        )
    )
    public = root / PUBLIC
    current = json.loads((public / "replay-manifest.json").read_bytes())
    if set(current) != set(original) or any(
        not same_json(current[k], v)
        for k, v in original.items()
        if k not in {"artifacts", "routes"}
    ):
        raise ValueError("Historical manifest metadata changed")
    for section in ("artifacts", "routes"):
        if any(
            not same_json(current[section].get(k), v)
            for k, v in original[section].items()
        ):
            raise ValueError("Historical manifest " + section + " changed")
    additions = set(current["artifacts"]) - set(original["artifacts"])
    allowed_files = {PUBLIC + "/replay-manifest.json"}
    for identity in additions:
        if not re.fullmatch(r"plugins:run:[0-9a-f]{64}", identity):
            raise ValueError("Unreviewed public artifact addition")
        run_id = identity.rsplit(":", 1)[1]
        entry = current["artifacts"][identity]
        url = "/artifacts/replay/plugins-run-" + run_id + ".json"
        licence = entry.get("licence", {})
        if (
            entry.get("url") != url
            or entry.get("kind") != "plugin-run"
            or entry.get("scope") != "SYNTHETIC_REFERENCE"
            or entry.get("status") != "AVAILABLE"
            or entry.get("sources") != ["project:nervous-fixture"]
            or licence.get("dataset_key") != "project:nervous-fixture"
            or licence.get("status") != "FIRST_PARTY"
            or licence.get("permitted_uses") != ["publish_derived"]
        ):
            raise ValueError("Plugin publication scope/source changed")
        raw = (public / url.lstrip("/")).read_bytes()
        value = json.loads(raw)
        if hashlib.sha256(raw).hexdigest() != entry.get("sha256") or len(
            raw
        ) != entry.get("bytes"):
            raise ValueError("Plugin publication bytes changed")
        if (
            value.get("run_id") != run_id
            or value.get("scope") != "SYNTHETIC_REFERENCE"
            or value.get("tenant_id") != "public-fixture"
            or not same_json(
                value.get("claims"),
                {
                    "causal_claim_eligible": False,
                    "inference_certified": False,
                    "market_claim_eligible": False,
                    "validated_alpha": False,
                },
            )
        ):
            raise ValueError("Plugin publication claim boundary changed")
        allowed_files.add(PUBLIC + url)
    for route in set(current["routes"]) - set(original["routes"]):
        if (
            route != "/plugins/momentum-fixture"
            or current["routes"][route] not in additions
        ):
            raise ValueError("Unreviewed public route addition")
    old_files = set(
        subprocess.check_output(
            ["git", "ls-tree", "-r", "--name-only", BASELINE, "--", PUBLIC],
            cwd=root,
            text=True,
        ).splitlines()
    )
    changes = set(
        subprocess.check_output(
            ["git", "diff", "--name-only", BASELINE, "--", PUBLIC], cwd=root, text=True
        ).splitlines()
    )
    changes.update(
        subprocess.check_output(
            ["git", "ls-files", "--others", "--exclude-standard", "--", PUBLIC],
            cwd=root,
            text=True,
        ).splitlines()
    )
    if changes - allowed_files or (changes & old_files) - {
        PUBLIC + "/replay-manifest.json"
    }:
        raise ValueError("Historical public bytes or unreviewed addition changed")


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
