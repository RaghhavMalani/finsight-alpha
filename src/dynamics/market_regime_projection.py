"""Read-only evidence loading with bounded, content-addressed server caching."""

from __future__ import annotations

import copy
from functools import lru_cache
import hashlib
import json
from pathlib import Path

from src import config
from src.dynamics.market_regime import CLAIMS, POLICY, clean, compile_world
from src.dynamics.market_regime_inputs import RegimeInputError, RegimeWorld, digest, utc

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "eval/dynamics/d0_4_2/market_regime_lab.json"
SOURCES = (
    "src/dynamics/market_regime_inputs.py",
    "src/dynamics/market_regime_fixture.py",
    "src/dynamics/market_regime.py",
    "src/dynamics/market_regime_projection.py",
    "src/dynamics/hawkes_identifiability.py",
    "src/dynamics/hawkes_certification.py",
    "src/data/as_of.py",
)

# Projection addresses depend on input + analytics, NOT this loader's source.
# This avoids a circular seal while rejecting resealed fabricated projections.
REFERENCE_HASHES = {
    "demo-full": "64d4aae186b77b35205dd2b911377e75d710042d5153b7c42fb02d8ce8435d44",
    "demo-sparse": "7330a0d8284049da6756c6a8174028b4ecc88912e550135030ef38a56e68fbc5",
}


class RegimeEvidenceError(ValueError):
    pass


def source_hashes() -> dict:
    return {
        name: hashlib.sha256(
            (ROOT / name).read_text(encoding="utf-8").replace("\r\n", "\n").encode()
        ).hexdigest()
        for name in SOURCES
    }


def local_path() -> Path:
    return config.DATA_DIR / "regime_intelligence/world.json"


def parent_files(bundle: dict) -> list[tuple[str, Path, str]]:
    root = (ROOT / "eval/dynamics").resolve()
    result = []
    for name, expected in bundle["frozen_parent_bytes"].items():
        if not isinstance(name, str) or not name.startswith("eval/dynamics/"):
            raise RegimeEvidenceError("Invalid frozen-parent scope")
        target = (ROOT / name).resolve()
        if not target.is_relative_to(root) or "d0_4_2" in target.parts:
            raise RegimeEvidenceError("Invalid frozen-parent path")
        result.append((name, target, expected))
    return result


def _verify_bundle(bundle: dict, *, check_parents: bool = True) -> None:
    if bundle.get("schema_version") != "market-regime-bundle/0.4.2":
        raise RegimeEvidenceError("Unknown integrated lab evidence schema")
    if bundle.get("artifact_hash") != digest(
        {k: v for k, v in bundle.items() if k != "artifact_hash"}
    ):
        raise RegimeEvidenceError("Integrated lab content address changed")
    if bundle.get("source_hashes") != source_hashes():
        raise RegimeEvidenceError("Integrated lab implementation source changed")
    if check_parents:
        for name, target, expected in parent_files(bundle):
            if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
                raise RegimeEvidenceError(
                    "Historical Dynamics artifact changed: " + name
                )
    if set(bundle["worlds"]) != {"demo-full", "demo-sparse"}:
        raise RegimeEvidenceError("Reference world registry mismatch")
    for name, record in bundle["worlds"].items():
        world = RegimeWorld.model_validate(record["input"])
        if world.id != name or world.evidence_scope != "SYNTHETIC_DEMO":
            raise RegimeEvidenceError("Demo provenance mismatch")
        projection = record["projection"]
        if projection["artifact_hash"] != REFERENCE_HASHES[name]:
            raise RegimeEvidenceError("Reference projection release identity changed")
        if projection["claims"] != CLAIMS or projection["policy"] != clean(POLICY):
            raise RegimeEvidenceError("Claim or policy boundary changed")
        if projection["artifact_hash"] != digest(
            {k: v for k, v in projection.items() if k != "artifact_hash"}
        ):
            raise RegimeEvidenceError("Demo projection content address changed")
        for cell in projection["landscape"]["cells"]:
            if abs(sum(cell["contributions"].values()) - cell["objective"]) > 2e-9:
                raise RegimeEvidenceError("Objective lacks component support")
        if projection["current"]["fracture"]["status"] == "COMPLETE":
            f = projection["current"]["fracture"]
            if abs(sum(f["contributions"].values()) - f["score"]) > 2e-9:
                raise RegimeEvidenceError("Fracture lacks component support")


def verify_bundle(bundle: dict, *, check_parents: bool = True) -> None:
    try:
        _verify_bundle(bundle, check_parents=check_parents)
    except (KeyError, TypeError, ValueError, OSError) as exc:
        raise RegimeEvidenceError(str(exc)) from exc


def _key() -> tuple:
    try:
        raw = ARTIFACT.read_bytes()
        envelope = json.loads(raw)
        parent_files(envelope)
    except (KeyError, TypeError, ValueError) as exc:
        raise RegimeEvidenceError("Malformed integrated evidence envelope") from exc
    parents = tuple(
        (name, hashlib.sha256(target.read_bytes()).hexdigest())
        for name, target, _ in parent_files(envelope)
    )
    return hashlib.sha256(raw).hexdigest(), tuple(source_hashes().items()), parents


@lru_cache(maxsize=2)
def _bundle(key: tuple) -> dict:
    bundle = json.loads(ARTIFACT.read_bytes())
    verify_bundle(bundle)
    if _key() != key:
        raise RegimeEvidenceError("Evidence changed during read")
    return bundle


@lru_cache(maxsize=12)
def _demo(key: tuple, name: str, as_of: str | None) -> dict:
    record = _bundle(key)["worlds"][name]
    if as_of is None or utc(as_of) == utc(record["projection"]["world"]["as_of"]):
        return record["projection"]
    return compile_world(RegimeWorld.model_validate(record["input"]), as_of=as_of)


@lru_cache(maxsize=4)
def _local(raw: bytes, as_of: str | None) -> dict:
    world = RegimeWorld.model_validate_json(raw)
    if world.evidence_scope != "PIT_LOCAL":
        raise RegimeInputError(
            "Local mode requires explicitly identified PIT_LOCAL data"
        )
    cutoff = (
        utc(as_of)
        if as_of
        else max((b.available_at for b in world.daily), default=None)
    )
    if cutoff is None:
        raise RegimeInputError("Local dataset has no daily observations")
    return compile_world(world, as_of=cutoff)


def load_lab(world: str = "demo-full", as_of: str | None = None) -> dict:
    if world not in ("demo-full", "demo-sparse", "pit-local"):
        raise RegimeInputError("Unknown world")
    if as_of:
        utc(as_of)
    if world == "pit-local":
        path = local_path()
        if not path.is_file():
            raise FileNotFoundError(
                "UNAVAILABLE: no versioned local dataset at " + str(path)
            )
        if path.stat().st_size > 64 * 1024 * 1024:
            raise RegimeInputError("Local input exceeds 64 MB")
        result = _local(path.read_bytes(), as_of)
    else:
        result = _demo(_key(), world, as_of)
    return copy.deepcopy(result)


def world_catalog() -> dict:
    local = local_path()
    return {
        "worlds": [
            {
                "id": "demo-full",
                "label": "Full synthetic integration demo",
                "available": True,
                "scope": "SYNTHETIC_DEMO",
            },
            {
                "id": "demo-sparse",
                "label": "Sparse demo / missing-data control",
                "available": True,
                "scope": "SYNTHETIC_DEMO",
            },
            {
                "id": "pit-local",
                "label": "Versioned local PIT dataset",
                "available": local.is_file(),
                "scope": "PIT_LOCAL",
                "reason": (
                    None
                    if local.is_file()
                    else "No explicitly timestamped dataset installed"
                ),
                "input_path": str(local),
            },
        ],
        "network_downloads": False,
        "read_only": True,
    }
