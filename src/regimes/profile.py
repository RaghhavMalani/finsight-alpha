"""The frozen Phase 5 profile. Its byte hash is bound into every computation."""

import json
from functools import lru_cache
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "eval/regimes/v0.1/profile.json"


@lru_cache(maxsize=1)
def _load(raw: bytes):
    value = json.loads(raw)
    if value.get("schema_version") != "regimes-profile/1" or not value.get(
        "frozen_before_real_outputs"
    ):
        raise ValueError("Unknown or unfrozen regimes profile")
    if any(v is not False for v in value["claims"].values()):
        raise ValueError("Profile cannot elevate a claim")
    return value


def profile():
    raw = PATH.read_bytes().replace(b"\r\n", b"\n")
    return json.loads(json.dumps(_load(raw)))


def profile_sha256():
    return sha256(PATH.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def market(asset):
    value = profile()
    spec = value["markets"].get(asset) or value["local_assets"].get(asset)
    if spec is None:
        raise ValueError("Asset is outside the Phase 5 profile; no proxy substitution")
    return spec


def context(asset):
    spec = market(asset)
    return {
        "profile_sha256": profile_sha256(),
        "label": spec["label"],
        "calendar": spec["calendar"],
        "observation_unit": spec["observation_unit"],
        "annualization": spec["annualization"],
        "badges": spec["badges"],
        "tier": spec["tier"],
    }


def run_context(asset, session=None):
    """Identity-bound computation context: profile bytes, market semantics, calendar."""
    base = context(asset)
    unit = base["observation_unit"]
    if session is not None and session.get("unit") == "observation":
        unit = "observation"
    return {
        **base,
        "observation_unit": unit,
        "session_evidence": session,
        "settings": profile(),
    }
