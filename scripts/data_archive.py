"""Narrow Phase 3 append boundary, with byte-for-byte Phase 0-2 preservation."""

import ast
import json
import re
import subprocess
from hashlib import sha256
from pathlib import Path

BASE = "94eb4f5d4898ed96c35304be29e4a09835bba8e6"
PUBLIC = "frontend-v2/public"
KINDS = {
    "health",
    "revisions",
    "disagreement",
    "coverage",
    "lineage",
    "issues",
    "costs",
}


def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root)


def verify_policy(root, baseline=BASE):
    path = "src/data/license_policy.py"
    before = ast.parse(git(root, "show", baseline + ":" + path))
    after = ast.parse((root / path).read_bytes())

    def strip(tree):
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "PUBLIC_RESEARCH_SOURCES"
                for t in node.targets
            ):
                return node
        raise ValueError("Missing registered policy")

    old, new = strip(before), strip(after)
    old_entries = {k.value: v for k, v in zip(old.value.keys, old.value.values)}
    new_entries = {k.value: v for k, v in zip(new.value.keys, new.value.values)}
    if set(new_entries) - set(old_entries) != {
        "alfred:UNRATE",
        "bls:LNS14000000",
    } or any(
        ast.dump(v) != ast.dump(new_entries.get(k)) for k, v in old_entries.items()
    ):
        raise ValueError("Original licence policy entries changed or unreviewed grant")
    new.value = old.value
    if ast.dump(before) != ast.dump(after):
        raise ValueError("Original licence resolution semantics changed")


def verify_addition(public, identity, entry):
    match = re.fullmatch(
        r"data-organ:(health|revisions|disagreement|coverage|lineage|issues|costs):([a-f0-9]{64})",
        identity,
    )
    if not match:
        raise ValueError("Unreviewed Phase 3 identity")
    name = "/artifacts/replay/" + identity.replace(":", "-") + ".json"
    raw = (public / name.lstrip("/")).read_bytes()
    value = json.loads(raw)
    from src.data_organ.publication import validate_public
    from src.replay.publication import assert_derived

    assert_derived(value)
    validate_public(match[1], value["payload"])
    from src.data_organ.publication import PUBLIC_NUMERICAL

    if (
        set(value.get("sources", [])) - PUBLIC_NUMERICAL
        or entry.get("sources")
        != (value.get("sources") or ["project:data-organ-diagnostics"])
        or entry.get("input_hash") != value.get("input_hash")
        or entry.get("as_of") != value.get("as_of")
        or entry.get("licence", {}).get("dataset_key")
        != "project:data-organ-diagnostics"
        or entry.get("licence", {}).get("status") != "FIRST_PARTY"
        or "publish_derived" not in entry.get("licence", {}).get("permitted_uses", [])
    ):
        raise ValueError("Data Organ source/permission/receipt binding changed")
    if (
        entry.get("url") != name
        or entry.get("kind") != "data-organ-" + match[1]
        or entry.get("scope") != "REAL_DERIVED_DIAGNOSTICS"
        or entry.get("status") != "AVAILABLE"
        or sha256(raw).hexdigest() != match[2]
        or sha256(raw).hexdigest() != entry.get("sha256")
        or len(raw) != entry.get("bytes")
        or value.get("schema_version") != "data-organ-replay/1"
        or value.get("kind") != match[1]
    ):
        raise ValueError("Data Organ artifact identity/bytes changed")
    if set(value.get("claims", {})) != {
        "inference_certified",
        "market_claim_eligible",
        "causal_claim_eligible",
        "validated_alpha",
    } or any(v is not False for v in value["claims"].values()):
        raise ValueError("Data Organ claim promotion")
    return PUBLIC + name


def verify(root):
    root = Path(root)
    verify_policy(root)
    original = json.loads(
        git(root, "show", BASE + ":" + PUBLIC + "/replay-manifest.json")
    )
    current = json.loads((root / PUBLIC / "replay-manifest.json").read_bytes())
    from scripts.research_archive import same_json

    if set(current) != set(original) or any(
        not same_json(current[k], original[k])
        for k in original
        if k not in {"as_of", "artifacts", "routes"}
    ):
        raise ValueError("Historical manifest contract changed")
    from finsight.plugins.contracts import utc

    if utc(current["as_of"]) < utc(original["as_of"]):
        raise ValueError("Manifest cutoff regressed")
    for section in ("artifacts", "routes"):
        if any(
            not same_json(current[section].get(k), v)
            for k, v in original[section].items()
        ):
            raise ValueError("Pre-Phase-3 manifest entry changed")
    additions = set(current["artifacts"]) - set(original["artifacts"])
    allowed = {PUBLIC + "/replay-manifest.json"}
    for identity in additions:
        allowed.add(
            verify_addition(root / PUBLIC, identity, current["artifacts"][identity])
        )
    for route in set(current["routes"]) - set(original["routes"]):
        if (
            route not in {"/data/" + kind for kind in KINDS}
            or current["routes"][route] not in additions
        ):
            raise ValueError("Unreviewed Phase 3 route")
    old_files = (
        git(
            root,
            "ls-tree",
            "-r",
            "--name-only",
            BASE,
            "--",
            PUBLIC,
            "data/exports/nervous_system_v0_1",
            "data/exports/research_os_v0_1",
            "data/exports/research_os_v0_1_1",
        )
        .decode()
        .splitlines()
    )
    for path in old_files:
        if path != PUBLIC + "/replay-manifest.json" and (
            root / path
        ).read_bytes() != git(root, "cat-file", "--filters", BASE + ":" + path):
            raise ValueError("Immutable Phase 0-2 bytes changed: " + path)
    changes = set(
        git(root, "diff", "--name-only", BASE, "--", PUBLIC).decode().splitlines()
    ) | set(
        git(root, "ls-files", "--others", "--exclude-standard", "--", PUBLIC)
        .decode()
        .splitlines()
    )
    if changes - allowed:
        raise ValueError("Unreviewed public addition or historical change")
    return True
