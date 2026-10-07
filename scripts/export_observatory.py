"""Add licensed, locally computed traces to the single public Replay manifest."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from src.data.license_policy import derived_publication_license
from src.replay.publication import ReplayPublisher


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--assets", nargs="+", default=["SPY", "QQQ", "IWM"])
    parser.add_argument("--output", type=Path, default=Path("frontend-v2/public"))
    parser.add_argument("--organization-id", type=int)
    parser.add_argument("--neural", action="store_true")
    parser.add_argument("--neural-geo", action="store_true")
    args = parser.parse_args()
    publisher = ReplayPublisher(args.output, args.as_of)
    manifest_path = args.output / "replay-manifest.json"
    if manifest_path.exists():
        current = json.loads(manifest_path.read_bytes())
        if current.get("schema_version") != "terminal-replay/1" or current.get("as_of") != args.as_of:
            raise ValueError("Use the shared manifest cutoff, or export a new complete Replay first.")
        publisher.manifest = current
    licence = derived_publication_license("alpaca:iex", args.organization_id)
    kinds = ("hmm", "signal", "neural") if args.neural or args.neural_geo else ("hmm", "signal")
    if "publish_derived" not in licence["permitted_uses"]:
        for ticker in args.assets:
            for kind in kinds:
                publisher.unavailable(f"observatory:{ticker}:{kind}", kind="observatory-trace",
                                      sources=["ALPACA_IEX"], licence=licence,
                                      reason="ALPACA_IEX: public model series require an active publish_derived grant.")
        publisher.finish()
        print("Unavailable source: ALPACA_IEX. No model fit or vendor payload was published.")
        return

    from src.geo import usgs
    from src.observatory.neural import NEURAL_FAMILIES, neural_trace
    from src.observatory.traces import hmm_trace, signal_trace
    from src.regime_intelligence.service import load_dataset

    benchmark = load_dataset("SPY")
    catalog = usgs.load_catalog() if args.neural_geo else None
    for ticker in args.assets:
        dataset = benchmark if ticker == "SPY" else load_dataset(ticker)
        for kind in kinds:
            if kind == "hmm":
                trace = hmm_trace(ticker, args.as_of, 4, "real", dataset=dataset)
            elif kind == "signal":
                trace = signal_trace(ticker, args.as_of, "real", dataset=dataset, benchmark_dataset=benchmark)
            else:
                trace = neural_trace(ticker, args.as_of, "real", None,
                                     families=list(NEURAL_FAMILIES) if catalog else None,
                                     dataset=dataset, benchmark_dataset=benchmark,
                                     catalog=catalog, evaluate_holdout=True)
            sources = trace["provenance"]["source"]
            if sources != ["ALPACA_IEX"]:
                raise PermissionError("This exporter is authorized only for the declared ALPACA_IEX dataset.")
            if any(trace["claims"].values()):
                raise ValueError("A Replay export cannot grant an alpha or causal claim.")
            publisher.publish(f"observatory:{ticker}:{kind}", trace, kind="observatory-trace",
                              sources=sources + (["USGS ComCat"] if catalog else []), licence=licence,
                              observed_at=trace["provenance"]["latest_observation"],
                              available_at=trace["provenance"]["latest_availability"],
                              input_hash=trace["provenance"]["input_hash"])
            print(ticker, kind, "publication-licensed trace exported", flush=True)
    publisher.finish()


if __name__ == "__main__":
    main()
