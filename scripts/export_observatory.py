"""Export only locally installed PIT evidence; no download or synthetic fallback."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path

from src.observatory.traces import hmm_trace, signal_trace
from src.regime_intelligence.service import load_dataset


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--assets", nargs="+", default=["SPY", "QQQ", "IWM"])
    parser.add_argument("--output", type=Path, default=Path("frontend-v2/public/artifacts/observatory"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = {"schema_version": "model-observatory-manifest/1", "as_of": args.as_of,
                "software": {name: importlib.metadata.version(name)
                             for name in ("scikit-learn", "hmmlearn", "numpy", "pandas")}, "artifacts": {}}
    for optional in ("xgboost", "lightgbm"):
        try:
            manifest["software"][optional] = importlib.metadata.version(optional)
        except importlib.metadata.PackageNotFoundError:
            manifest["software"][optional] = None
    benchmark = load_dataset("SPY")
    for ticker in args.assets:
        dataset = benchmark if ticker == "SPY" else load_dataset(ticker)
        for kind in ("hmm", "signal"):
            trace = hmm_trace(ticker, args.as_of, 4, "real", dataset=dataset) if kind == "hmm" else signal_trace(
                ticker, args.as_of, "real", dataset=dataset, benchmark_dataset=benchmark)
            raw = json.dumps(trace, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
            filename = f"{ticker.lower()}-{kind}.json"
            (args.output / filename).write_bytes(raw)
            manifest["artifacts"][f"{ticker}:{kind}"] = {
                "url": f"/artifacts/observatory/{filename}", "sha256": hashlib.sha256(raw).hexdigest(),
                "bytes": len(raw), "input_hash": trace["provenance"]["input_hash"]}
            print(ticker, kind, len(raw), "bytes", flush=True)
            if kind == "signal":
                ci = trace["holdout"]["auc_ci95"]
                print(f"  verdict {trace['verdict']} ({trace['verdict_reason']}); holdout AUC "
                      f"{trace['holdout']['auc']} CI {ci and (round(ci['low'], 4), round(ci['high'], 4))}; "
                      f"suppressed {trace['suppressed']}; rho {trace['rho']}", flush=True)
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
