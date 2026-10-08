"""Add genuine public research evidence to an existing SHA-checked Replay freeze.

No raw factor files or OMM elements enter public/. Failures replace affected
entries with unavailable states, and finish removes their old payloads.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

from src.data.license_policy import derived_publication_license
from src.replay.factors import (SOURCE_URLS, checked_capture, load_factor_series,
                               factor_hmm, factor_signal)
from src.replay.publication import ReplayPublisher, canonical_bytes, assert_derived, utc

SAT_URLS = {f"celestrak-{group}.json": f"https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=json"
            for group in ("stations", "visual")}


def capture(root: Path):
    import requests
    root.mkdir(parents=True, exist_ok=True)
    for name, url in {**SOURCE_URLS, **SAT_URLS}.items():
        path = root / name
        if path.exists() and path.with_suffix(path.suffix + ".meta.json").exists():
            # Reproduction uses the same capture; never redownload GP within 2h.
            continue
        response = requests.get(url, timeout=(5, 60))
        if response.status_code != 200:
            raise RuntimeError(f"Capture stopped at {name}: HTTP {response.status_code}; no retry.")
        raw = response.content
        if len(raw) > 16_000_000:
            raise ValueError("Source exceeds capture bound")
        path.write_bytes(raw)
        path.with_suffix(path.suffix + ".meta.json").write_text(json.dumps({
            "source_url": url, "captured_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "sha256": hashlib.sha256(raw).hexdigest()}, indent=2))


def extend_checked_manifest(output: Path, as_of: str):
    manifest = json.loads((output / "replay-manifest.json").read_bytes())
    assert_derived(manifest)
    if manifest["schema_version"] != "terminal-replay/1" or utc(manifest["as_of"]) > utc(as_of):
        raise ValueError("Cannot move the Replay manifest backwards")
    if manifest["claims"] != {"market_claim_eligible": False, "causal_claim_eligible": False, "validated_alpha": False}:
        raise ValueError("Retained Replay cannot grant research claims")
    for entry in manifest["artifacts"].values():
        if entry["status"] != "AVAILABLE":
            if entry["status"] != "UNAVAILABLE" or entry["url"] is not None or entry["sha256"] is not None or entry["bytes"] != 0:
                raise ValueError("Invalid retained unavailable artifact")
            continue
        licence = entry["licence"]
        if licence["status"] not in {"FIRST_PARTY", "PUBLIC_DOMAIN", "ACTIVE"} or "publish_derived" not in licence["permitted_uses"]:
            raise PermissionError("Retained artifact publication is not licensed")
        if licence.get("valid_through") and utc(licence["valid_through"]) <= max(utc(as_of), datetime.now(timezone.utc)):
            raise PermissionError("Retained artifact publication has expired")
        if not utc(entry["observed_at"]) <= utc(entry["available_at"]) <= utc(entry["as_of"]) <= utc(manifest["as_of"]):
            raise ValueError("Retained artifact crosses its availability cutoff")
        url = entry["url"]
        if not url.startswith("/artifacts/") or ".." in url:
            raise ValueError("Unsafe retained artifact path")
        raw = (output / url.lstrip("/")).read_bytes()
        if len(raw) != entry["bytes"] or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise ValueError("Retained Replay artifact hash mismatch")
        assert_derived(json.loads(raw))
    publisher = ReplayPublisher(output, as_of)
    publisher.manifest = manifest
    publisher.manifest["as_of"] = as_of
    return publisher


def export(root: Path, output: Path, as_of: str):
    publisher = extend_checked_manifest(output, as_of)
    errors = []
    for country, identity, source, key in [
        ("US", "US-MKT", "KENNETH_FRENCH", "ken-french:daily-factors"),
        ("INDIA", "IN-MKT", "IIMA", "iima:daily-factors"),
    ]:
        licence = derived_publication_license(key, None)
        common = dict(sources=[source], licence=licence, scope="FACTOR_RESEARCH")
        try:
            series = load_factor_series(root, country, as_of)
            print(f"Fitting {identity}: {len(series.frame)} real daily returns, {series.provenance['market_start']} to {series.provenance['market_end']}", flush=True)
            hmm, market, regime = factor_hmm(series)
            signal = factor_signal(series)
            for artifact, kind, value in [
                (f"observatory:{identity}:hmm", "hmm", hmm),
                (f"observatory:{identity}:signal", "signal", signal),
                (f"market:{identity}", "market-series", market),
                (f"regime:{identity}", "factor-regime", regime),
            ]:
                publisher.publish(artifact, value, kind=kind, **common,
                    observed_at=series.provenance["latest_observation"],
                    available_at=series.provenance["latest_availability"], input_hash=series.provenance["input_hash"])
            print(f"Published {identity}: HMM {len(hmm['frames'])} EM iterations; signal {signal['verdict']}", flush=True)
        except Exception as error:
            errors.append(f"{identity}: {error}")
            for artifact, kind in [(f"observatory:{identity}:hmm", "hmm"),
                (f"observatory:{identity}:signal", "signal"), (f"market:{identity}", "market-series"),
                (f"regime:{identity}", "factor-regime")]:
                publisher.unavailable(artifact, kind=kind, reason=str(error), **common)
        publisher.unavailable(f"observatory:{identity}:neural", kind="neural", **common,
            reason="No validated factor-return neural adapter is published; use the checked HMM or signal research scenes.")
    licence = derived_publication_license("celestrak:gp", None)
    try:
        captures = [checked_capture(root, name, url, as_of)[1] for name, url in SAT_URLS.items()]
        projection = root / "satellites-derived.json"
        subprocess.run(["node", "frontend-v2/scripts/project-satellites.mjs", str(root), as_of, str(projection)], check=True)
        value = json.loads(projection.read_text())
        if value["captures"] != captures:
            raise ValueError("Satellite projection capture mismatch")
        publisher.publish("world:satellites", value, kind="satellite-projection", sources=["CelesTrak", "USSPACECOM / Space-Track.org"],
            licence=licence, observed_at=max(s["epoch"] for s in value["satellites"]),
            available_at=max(c["captured_at"] for c in captures), input_hash=hashlib.sha256(canonical_bytes(captures)).hexdigest())
    except Exception as error:
        errors.append(f"CelesTrak: {error}")
        publisher.unavailable("world:satellites", kind="satellite-projection", sources=["CelesTrak"], licence=licence, reason=str(error))
    publisher.finish()
    if errors:
        raise RuntimeError("Affected public entries unavailable: " + "; ".join(errors))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("data/exports/replay-source"))
    parser.add_argument("--output", type=Path, default=Path("frontend-v2/public"))
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--capture", action="store_true")
    args = parser.parse_args()
    if args.capture:
        capture(args.source)
    export(args.source, args.output, args.as_of)
