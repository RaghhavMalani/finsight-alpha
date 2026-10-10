"""Phase 5 boundary: every pre-Phase-5 byte stays frozen; only reviewed regimes additions.

Base is canonical main after the Phase 3 merge. Data Organ nightly additions keep
their Phase 3 checker; Phase 5 adds content-addressed `regimes:*` artifacts and
`/regimes/*` routes only. The licence policy is unchanged since the base.
"""

import ast
import json
import re
import subprocess
from hashlib import sha256
from pathlib import Path

BASE = "1a0d03d7dedb2e50e57a7c28149f2ed0351be275"
PUBLIC = "frontend-v2/public"
IDENTITY = re.compile(r"regimes:(snapshot|timeline|factors|lineage|history|matrix):([a-f0-9]{64})")
ROUTE = re.compile(r"/regimes/(?:(snapshot|timeline|factors|lineage|history)\?asset=(US-MKT|IN-MKT)|(matrix))")
SOURCES = {"ken-french:daily-factors", "iima:daily-factors"}
FROZEN_EXPORTS = (
    "data/exports/nervous_system_v0_1",
    "data/exports/research_os_v0_1",
    "data/exports/research_os_v0_1_1",
)


def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root)


def verify_addition(public, identity, entry):
    from src.regimes.contracts import CLAIMS
    from src.regimes.publication import SCHEMA, validate_public

    match = IDENTITY.fullmatch(identity)
    if not match:
        raise ValueError("Unreviewed Phase 5 identity")
    kind = match[1]
    url = "/artifacts/replay/" + identity.replace(":", "-") + ".json"
    raw = (Path(public) / url.lstrip("/")).read_bytes()
    value = json.loads(raw)
    licence = entry.get("licence", {})
    if (
        entry.get("url") != url
        or entry.get("kind") != "regimes-" + kind
        or entry.get("scope") != "REAL_DERIVED_REGIMES"
        or entry.get("status") != "AVAILABLE"
        or sha256(raw).hexdigest() != match[2]
        or entry.get("sha256") != match[2]
        or len(raw) != entry.get("bytes")
        or value.get("schema_version") != SCHEMA
        or value.get("kind") != kind
        or value.get("claims") != CLAIMS
        or not value.get("sources")
        or set(value["sources"]) - SOURCES
        or entry.get("sources") != value["sources"]
        or entry.get("input_hash") != value.get("input_hash")
        or entry.get("as_of") != value.get("as_of")
        or licence.get("status") != "ACTIVE"
        or "publish_derived" not in licence.get("permitted_uses", [])
    ):
        raise ValueError("Phase 5 artifact identity, source, licence or claim changed")
    validate_public(kind, value["payload"])
    return PUBLIC + url


def verify_route(route, identity, artifacts):
    match = ROUTE.fullmatch(route)
    if not match or identity not in artifacts:
        raise ValueError("Unreviewed Phase 5 route")
    kind = match[1] or match[3]
    if not identity.startswith("regimes:" + kind + ":"):
        raise ValueError("Phase 5 route points at another kind")
    return True


def verify_policy(root):
    path = "src/data/license_policy.py"
    if ast.dump(ast.parse(git(root, "show", BASE + ":" + path))) != ast.dump(
        ast.parse((Path(root) / path).read_bytes())
    ):
        raise ValueError("Licence policy changed during Phase 5")


def verify(root):
    from scripts.data_archive import verify_addition as data_addition
    from scripts.research_archive import same_json
    from finsight.plugins.contracts import utc

    root = Path(root)
    verify_policy(root)
    original = json.loads(git(root, "show", BASE + ":" + PUBLIC + "/replay-manifest.json"))
    current = json.loads((root / PUBLIC / "replay-manifest.json").read_bytes())
    if set(current) != set(original) or any(
        not same_json(current[k], original[k])
        for k in original
        if k not in {"as_of", "artifacts", "routes"}
    ):
        raise ValueError("Historical manifest contract changed")
    if utc(current["as_of"]) < utc(original["as_of"]):
        raise ValueError("Manifest cutoff regressed")
    for key, value in original["artifacts"].items():
        if not same_json(current["artifacts"].get(key), value):
            raise ValueError("Pre-Phase-5 artifact entry changed: " + key)
    additions = set(current["artifacts"]) - set(original["artifacts"])
    allowed = {PUBLIC + "/replay-manifest.json"}
    for identity in additions:
        entry = current["artifacts"][identity]
        if identity.startswith("data-organ:"):
            allowed.add(data_addition(root / PUBLIC, identity, entry))
        else:
            allowed.add(verify_addition(root / PUBLIC, identity, entry))
    for route, identity in current["routes"].items():
        if same_json(original["routes"].get(route), identity):
            continue
        if route.startswith("/data/") and identity in additions and identity.startswith("data-organ:"):
            continue
        if route not in original["routes"] and route.startswith("/regimes/"):
            verify_route(route, identity, current["artifacts"])
            continue
        raise ValueError("Unreviewed route change: " + route)
    old_files = git(root, "ls-tree", "-r", "--name-only", BASE, "--", PUBLIC, *FROZEN_EXPORTS).decode().splitlines()
    old_files += [
        p
        for p in git(root, "ls-tree", "-r", "--name-only", BASE, "--", "data/exports/data_organ_v0_1").decode().splitlines()
        if re.search(r"-[a-f0-9]{64}\.json$", p)
    ]
    for path in old_files:
        if path != PUBLIC + "/replay-manifest.json" and (root / path).read_bytes() != git(
            root, "cat-file", "--filters", BASE + ":" + path
        ):
            raise ValueError("Immutable pre-Phase-5 bytes changed: " + path)
    changes = set(git(root, "diff", "--name-only", BASE, "--", PUBLIC).decode().splitlines()) | set(
        git(root, "ls-files", "--others", "--exclude-standard", "--", PUBLIC).decode().splitlines()
    )
    if changes - allowed:
        raise ValueError("Unreviewed public addition: " + ", ".join(sorted(changes - allowed)))
    return True
