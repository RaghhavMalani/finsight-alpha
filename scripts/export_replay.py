"""Export verified derived projections; no anonymous price download or licence inference."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit
from urllib.request import urlopen

from src.data.license_policy import derived_publication_license
from src.replay.publication import ReplayPublisher, first_party_license, utc

ROOT = Path(__file__).resolve().parents[1]


def route_key(path: str) -> str:
    url = urlsplit(path)
    query = urlencode(sorted(parse_qsl(url.query)))
    return url.path + ("?" + query if query else "")


def export(output: Path, as_of: str, *, organization_id: int | None = None,
           market_input: Path | None = None, world_input: Path | None = None):
    publisher = ReplayPublisher(output, as_of)
    from backend.routes import forge, dynamics
    from src.regime_intelligence import service
    from src.dynamics.market_regime_projection import load_lab, world_catalog

    def frozen(identity, value, route, input_hash, *, scope="FROZEN_RESEARCH"):
        publisher.publish(identity, value, kind="projection", sources=["FinSight frozen research"],
                          licence=first_party_license("finsight:research"), observed_at=as_of,
                          available_at=as_of, input_hash=input_hash, scope=scope,
                          routes=(route_key(route),))

    manifest_path = ROOT / "data/exports/forge_v0_2_5_real_baseline/manifest.json"
    baseline_manifest = json.loads(manifest_path.read_text())
    baseline_hash = baseline_manifest["baseline_id"]
    frozen("forge:baselines", forge.list_baselines(), "/forge/baselines", baseline_hash)
    frozen("forge:baseline", forge.get_baseline("forge-v0.2.5"), "/forge/baselines/forge-v0.2.5", baseline_hash)
    runs = forge.list_runs(baseline_id="forge-v0.2.5", model=None, verdict=None, limit=100)
    frozen("forge:runs", runs, "/forge/runs?baseline_id=forge-v0.2.5", baseline_hash)
    for run in runs["items"]:
        identifier = run["run_id"]
        frozen("forge:run:" + identifier, forge.get_run(identifier), "/forge/runs/" + identifier, identifier)
    reality = forge.get_reality_ladder("forge-v0.2.4.1")
    frozen("forge:reality", reality, "/forge/reality-ladders/forge-v0.2.4.1", reality["artifact_hash"])
    frozen("forge:worlds", forge.list_worlds(), "/forge/worlds", baseline_hash)
    frozen("forge:artifacts", forge.list_artifacts(), "/forge/artifacts", baseline_hash)

    # These readers validate checked release files. Never call fitting/reference generators.
    readers = [
        ("nonlinear-identifiability", dynamics.nonlinear_identifiability_artifact),
        ("estimator-tournament", dynamics.estimator_tournament_artifact),
        ("failure-decomposition", dynamics.failure_decomposition_artifact),
        ("targeted-recovery", dynamics.targeted_recovery_artifact),
        ("generalization-autopsy", dynamics.generalization_autopsy_artifact),
        ("evidence-complete-replication", dynamics.evidence_complete_replication_artifact),
        ("hawkes-event-process", dynamics.hawkes_event_process_artifact),
        ("hawkes-identifiability", dynamics.hawkes_identifiability_artifact),
        ("hawkes-boundary-decomposition", dynamics.hawkes_boundary_artifact),
    ]
    for name, reader in readers:
        print("Checking frozen projection: " + name, flush=True)
        value = reader()
        digest = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
        frozen("dynamics:" + name, value, "/dynamics/certification/" + name, digest, scope="SYNTHETIC_REFERENCE")
    for world in ("demo-full", "demo-sparse"):
        value = load_lab(world)
        frozen("dynamics:" + world, value, "/dynamics/regime-intelligence?world=" + world,
               value["artifact_hash"], scope="SYNTHETIC_REFERENCE")
        product = service.snapshot("DEMO", None, world)
        frozen("product:" + world, product, "/dynamics/regime-product/snapshot?asset=DEMO&source=" + world,
               hashlib.sha256(json.dumps(product, sort_keys=True).encode()).hexdigest(), scope="SYNTHETIC_REFERENCE")
    lab_catalog = world_catalog()
    frozen("dynamics:catalog", lab_catalog, "/dynamics/regime-intelligence/worlds",
           hashlib.sha256(json.dumps(lab_catalog, sort_keys=True).encode()).hexdigest())
    product_catalog = service.catalog()
    # Public coverage is independent of what an operator may have installed locally.
    for asset in product_catalog["assets"]:
        if asset["source"] == "real":
            asset.update(available=False, cutoffs=[], reason="A publication-licensed real projection has not been installed.")
    frozen("product:catalog", product_catalog, "/dynamics/regime-product/assets",
           hashlib.sha256(json.dumps(product_catalog, sort_keys=True).encode()).hexdigest())

    for ticker in ("SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "RELIANCE.NS", "TCS.NS"):
        source = "ALPACA_IEX" if ticker in {"SPY", "QQQ", "IWM"} else "YFINANCE"
        dataset_key = "alpaca:iex" if source == "ALPACA_IEX" else "yfinance:daily"
        publisher.market(ticker, [], source=source, dataset_key=dataset_key,
                         organization_id=None, input_hash="0" * 64)
    for ticker in ("SPY", "QQQ", "IWM"):
        for kind in ("hmm", "signal", "neural"):
            licence = derived_publication_license("alpaca:iex", organization_id)
            publisher.unavailable(f"observatory:{ticker}:{kind}", kind="observatory-trace", sources=["ALPACA_IEX"],
                                  licence=licence, reason="ALPACA_IEX model series have no anonymous publish_derived grant; use local Live on installed evidence.")
    publisher.unavailable("market:india-vix", kind="volatility-summary", sources=["YFINANCE / NSE India VIX"],
                          licence=derived_publication_license("yfinance:indices", organization_id),
                          reason="India VIX: no publication-licensed derived snapshot; the sourced index level is local Live only.")
    if market_input:
        raw = market_input.read_bytes()
        data = json.loads(raw)
        if data.get("schema_version") != "local-market-export/1":
            raise ValueError("Local input must be local-market-export/1")
        publisher.market(data["ticker"], data["rows"], source=data["source"], dataset_key=data["dataset_key"],
                         organization_id=organization_id, input_hash=hashlib.sha256(raw).hexdigest())

    world_licence = derived_publication_license("usgs:comcat", None)
    if world_input:
        raw = world_input.read_bytes()
        data = json.loads(raw)
        cutoff_ms = int(utc(as_of).timestamp() * 1000)
        if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
            raise ValueError("World input must be the captured USGS GeoJSON feed")
        events = []
        for feature in data["features"]:
            p, c = feature["properties"], feature["geometry"]["coordinates"]
            if p["time"] > cutoff_ms or p.get("updated", p["time"]) > cutoff_ms:
                continue
            import math
            if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in (*c[:3], p["mag"], p["time"])) or abs(c[0]) > 180 or abs(c[1]) > 90 or p["mag"] < 4.5:
                raise ValueError("Invalid recorded USGS event")
            events.append({"stableId": feature["id"], "lon": c[0], "lat": c[1], "depthKm": c[2],
                           "mag": p["mag"], "place": p.get("place"), "time": p["time"]})
        events.sort(key=lambda r: r["time"], reverse=True)
        frozen_hash = hashlib.sha256(raw).hexdigest()
        publisher.publish("world:quakes", {"schema_version": "world-replay/1", "as_of": as_of,
                          "method": "USGS ComCat normalized M4.5+ events; both event and revision timestamps precede the capture cutoff. Map and hub aggregates are descriptive, not company exposures.", "events": events},
                          kind="world-events", sources=["USGS ComCat"], licence=world_licence,
                          observed_at=as_of, available_at=as_of, input_hash=frozen_hash)
    else:
        publisher.unavailable("world:quakes", kind="world-events", sources=["USGS ComCat"], licence=world_licence,
                              reason="No captured, checked world snapshot installed.")
    publisher.unavailable("world:satellites", kind="satellite-projection", sources=["CelesTrak"],
                          licence=derived_publication_license("celestrak:tle", None),
                          reason="No publication-licensed recorded satellite projection installed.")
    publisher.finish()
    denied = sorted({s for e in publisher.manifest["artifacts"].values() if e["status"] == "UNAVAILABLE" for s in e["sources"]})
    print(f"Published {sum(e['status'] == 'AVAILABLE' for e in publisher.manifest['artifacts'].values())} checked derived artifacts")
    print("Unavailable sources: " + ", ".join(denied))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "frontend-v2/public")
    parser.add_argument("--organization-id", type=int)
    parser.add_argument("--market-input", type=Path)
    parser.add_argument("--world-input", type=Path)
    parser.add_argument("--capture-world", action="store_true", help="Capture a genuine USGS feed locally, then publish its derived projection")
    args = parser.parse_args()
    world = args.world_input
    if args.capture_world:
        if world is not None:
            parser.error("Use --world-input or --capture-world")
        world = ROOT / "data/exports/replay-source/usgs-month.geojson"
        world.parent.mkdir(parents=True, exist_ok=True)
        with urlopen("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson", timeout=30) as response:
            world.write_bytes(response.read())
    export(args.output, args.as_of, organization_id=args.organization_id,
           market_input=args.market_input, world_input=world)


if __name__ == "__main__":
    main()
