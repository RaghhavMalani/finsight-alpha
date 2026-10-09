"""Validate the historical frozen declaration before exposing any world."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import subprocess

FREEZE_COMMIT = "3c16fe0f216d959988230aa0c156dd64b914a704"
PROTOCOL_SHA = "59c69a7807fb757ace22fca4f20b7c883ea43f48dad30a6eb608c936e35b248e"
BASE_COMMIT = "3b3fa50c8e53dc929395d56c6609c8f2f82f23fe"
METHODS = ("HAC_NORMAL", "HAC_T", "NULL_MBB_T", "STATIONARY_PAIRS_T")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)+"\n").encode()


def load(root: Path):
    folder = root/"data/exports/research_os_v0_1_1"
    raw = (folder/"preregistration.json").read_bytes()
    old = subprocess.check_output(["git", "show", FREEZE_COMMIT+":data/exports/research_os_v0_1_1/preregistration.json"], cwd=root)
    if digest(raw) != PROTOCOL_SHA or old != raw:
        raise ValueError("Frozen tournament protocol substitution")
    receipt = json.loads((folder/"freeze-receipt.json").read_bytes())
    historical = subprocess.check_output(["git", "show", FREEZE_COMMIT+":data/exports/research_os_v0_1_1/freeze-receipt.json"], cwd=root)
    if historical != (folder/"freeze-receipt.json").read_bytes() or receipt["protocol_sha256"] != PROTOCOL_SHA:
        raise ValueError("Freeze receipt substitution")
    p = json.loads(raw)
    if tuple(p["candidates"]) != METHODS or len(p["settings"]) != 30:
        raise ValueError("Candidate/setting family changed")
    return p


def seed(p, phase, setting, world, stream):
    if phase not in p["seed"]["phases"] or stream not in p["seed"]["streams"]:
        raise ValueError("Undeclared random domain")
    if not isinstance(world, int) or world < 0:
        raise ValueError("Invalid world identity")
    key = f"{p['seed']['namespace']}/{phase}/{setting}/{world}/{stream}"
    return (1 << 256) | int.from_bytes(hashlib.sha256(key.encode()).digest(), "big")


def assert_disjoint(p):
    seen = set()
    for phase, count in (("discovery",p["discovery_worlds"]),("confirmation",p["confirmation_worlds"]),("canary",p["execution"]["canary_worlds"])):
        for setting in p["settings"]:
            for world in range(count):
                for stream in p["seed"]["streams"]:
                    value = seed(p, phase, setting["id"], world, stream)
                    if value < 2**256 or value in seen:
                        raise ValueError("Seed collision or old-domain contamination")
                    seen.add(value)
    return digest("\n".join(str(v) for v in sorted(seen)).encode()), len(seen)
