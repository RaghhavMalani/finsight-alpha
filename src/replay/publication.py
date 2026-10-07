"""Small, deterministic public projections. Raw inputs are never exported."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
from typing import Any

from src.data.license_policy import derived_publication_license

CLAIMS = {"market_claim_eligible": False, "causal_claim_eligible": False, "validated_alpha": False}
RAW_FIELDS = {"price", "prices", "rawprices", "rawprice", "lastprice", "prevclose", "adjclose",
              "adjustedclose", "spot", "ohlc", "ohlcv", "candles", "bars", "open", "close",
              "volume", "mark", "entryprice", "last", "bid", "ask"}


def assert_derived(value: Any, path: str = "root") -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"Non-finite value: {path}")
    if isinstance(value, str) and re.search(r'[\"\']?(?:raw_prices|last_price|adj_close|ohlcv)[\"\']?\s*[:=]', value, re.I):
        raise ValueError(f"Raw price evidence: {path}")
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = re.sub(r"[_ -]", "", key.lower())
            # HIGH/LOW here are preregistered graph-condition counts, not bar extremes.
            interval = bool(re.search(r"(?:ci\d*|interval)(?:\.[^.]+)?$", path)) or path.endswith(".known_graph_condition_groups")
            if normalized in RAW_FIELDS or normalized in {"high", "low"} and not interval:
                raise ValueError(f"Raw price field: {path}.{key}")
            assert_derived(child, f"{path}.{key}")
    elif isinstance(value, list):
        for i, child in enumerate(value):
            assert_derived(child, f"{path}[{i}]")


def canonical_bytes(value: Any) -> bytes:
    assert_derived(value)
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()


def utc(value: str) -> datetime:
    d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise ValueError("Timestamp must carry a timezone")
    return d.astimezone(timezone.utc)


def weekly_market_series(ticker: str, rows: list[dict], as_of: str, regimes: dict[str, str] | None = None) -> dict:
    """Weekly last admitted session; 20-session sample log-return vol, annualized."""
    cutoff = utc(as_of)
    admitted = []
    for row in rows:
        observed, available = utc(row["observed_at"]), utc(row["available_at"])
        close = float(row["close"])
        if observed > available or not math.isfinite(close) or close <= 0:
            raise ValueError("Invalid local market input")
        if available <= cutoff:
            admitted.append((observed, available, close))
    if not admitted:
        raise ValueError("No observations available at the cutoff")
    if any(a[0] >= b[0] for a, b in zip(admitted, admitted[1:])):
        raise ValueError("Sessions must be strictly increasing, without duplicates")
    weekly = {}
    returns: list[float] = []
    peak = 0.0
    previous = None
    for observed, _, close in admitted:
        if previous is not None:
            returns.append(math.log(close / previous))
        previous = close
        peak = max(peak, close)
        vol = statistics.stdev(returns[-20:]) * math.sqrt(252) if len(returns) >= 20 else None
        iso = observed.date().isocalendar()
        weekly[(iso.year, iso.week)] = (observed.date().isoformat(), close, close / peak - 1, vol)
    base = next(iter(weekly.values()))[1]
    result = {
        "schema_version": "market-replay/1", "ticker": ticker, "as_of": as_of,
        "method": {"granularity": "weekly", "base": 100, "volatility_window_sessions": 20,
                   "annualization_sessions": 252,
                   "regime_semantics": "Recorded HMM fit posterior, not contemporaneously known historical regimes; absent where no checked fit is available."},
        "weeks": [{"week": day, "relative_performance": 100.0 if i == 0 else 100 * level / base,
                   "drawdown": drawdown, "realized_volatility": vol,
                   "regime": (regimes or {}).get(day)}
                  for i, (day, level, drawdown, vol) in enumerate(weekly.values())],
    }
    assert_derived(result)
    return result


def market_hmm(rows: list[dict], as_of: str) -> tuple[dict[str, str], dict]:
    """Reuse the existing bounded HMM; fit only admitted close-derived features."""
    import pandas as pd
    from src.regime.regime_features import (calculate_rolling_returns,
                                          calculate_rolling_volatility, calculate_drawdown_features)
    from src.regime.hmm_regime import trace_hmm_fit

    admitted = [r for r in rows if utc(r["available_at"]) <= utc(as_of)]
    frame = pd.DataFrame({"Date": [utc(r["observed_at"]) for r in admitted],
                          "Close": [float(r["close"]) for r in admitted]})
    returns = calculate_rolling_returns(frame)
    volatility = calculate_rolling_volatility(returns)
    drawdown = calculate_drawdown_features(frame)
    columns = ["log_return", "rolling_return_20", "realized_vol_20", "drawdown_from_252_high"]
    # Absolute SMA/rolling maxima computed by the reusable helper stay local.
    features = pd.concat([frame[["Date"]], returns[["log_return", "rolling_return_20"]],
                          volatility[["realized_vol_20"]], drawdown[["drawdown_from_252_high"]]], axis=1).dropna()
    if len(features) < 60:
        return {}, {"status": "UNAVAILABLE", "reason": "Fewer than 60 complete admitted HMM feature rows."}
    trace = trace_hmm_fit(features, columns, n_states=4, max_iter=100)
    regimes = {utc(day).date().isoformat(): trace["labels"][str(max(range(4), key=lambda i: posterior[i]))]
               for day, posterior in zip(trace["dates_tail"], trace["frames"][-1]["posterior_tail"])}
    return regimes, {"status": "AVAILABLE", "feature_names": columns, "fit_rows": len(features),
                     "seed": 42, "n_states": 4, "converged": trace["converged"],
                     "trace_sha256": hashlib.sha256(canonical_bytes(trace)).hexdigest(), "as_of": as_of}


class ReplayPublisher:
    def __init__(self, output: Path, as_of: str):
        utc(as_of)
        self.output = output
        self.manifest = {"schema_version": "terminal-replay/1", "as_of": as_of,
                         "artifacts": {}, "routes": {}, "claims": dict(CLAIMS)}

    def unavailable(self, identity: str, *, kind: str, sources: list[str], licence: dict,
                    reason: str, scope: str = "REAL", as_of: str | None = None, routes: tuple[str, ...] = ()):
        self.manifest["artifacts"][identity] = {
            "status": "UNAVAILABLE", "kind": kind, "url": None, "sha256": None, "bytes": 0,
            "sources": sources, "licence": licence, "reason": reason, "scope": scope,
            "as_of": as_of or self.manifest["as_of"], "observed_at": None,
            "available_at": None, "input_hash": None,
        }
        for route in routes:
            self.manifest["routes"][route] = identity

    def publish(self, identity: str, value: dict, *, kind: str, sources: list[str], licence: dict,
                observed_at: str, available_at: str, input_hash: str, scope: str = "REAL",
                routes: tuple[str, ...] = (), as_of: str | None = None):
        cutoff = as_of or self.manifest["as_of"]
        if not utc(observed_at) <= utc(available_at) <= utc(cutoff) <= utc(self.manifest["as_of"]):
            raise ValueError("Artifact crosses its availability cutoff")
        if licence.get("status") not in {"FIRST_PARTY", "PUBLIC_DOMAIN", "ACTIVE"} or "publish_derived" not in licence.get("permitted_uses", []):
            raise PermissionError("Anonymous derived publication is not licensed")
        if licence.get("valid_through") and utc(licence["valid_through"]) <= utc(cutoff):
            raise PermissionError("Publication licence expired")
        if licence.get("valid_through") and utc(licence["valid_through"]) <= datetime.now(timezone.utc):
            raise PermissionError("Publication licence is no longer active")
        if not re.fullmatch(r"[a-f0-9]{64}", input_hash):
            raise ValueError("Source hash missing")
        raw = canonical_bytes(value)
        name = re.sub(r"[^a-zA-Z0-9_.-]", "-", identity) + ".json"
        if any(e.get("url") == "/artifacts/replay/" + name and key != identity
               for key, e in self.manifest["artifacts"].items()):
            raise ValueError("Artifact filename collision")
        target = self.output / "artifacts/replay" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        self.manifest["artifacts"][identity] = {
            "status": "AVAILABLE", "kind": kind, "url": "/artifacts/replay/" + name,
            "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "sources": sources,
            "licence": licence, "reason": None, "scope": scope, "input_hash": input_hash,
            "as_of": cutoff, "observed_at": observed_at, "available_at": available_at,
        }
        for route in routes:
            self.manifest["routes"][route] = identity

    def market(self, ticker: str, rows: list[dict], *, source: str, dataset_key: str,
               organization_id: int | None, input_hash: str, regimes: dict[str, str] | None = None):
        licence = derived_publication_license(dataset_key, organization_id)
        if "publish_derived" not in licence["permitted_uses"]:
            self.unavailable("market:" + ticker, kind="market-series", sources=[source], licence=licence,
                             reason=f"{source}: public derived series require an active publish_derived grant ({licence['status']}).")
            return
        value = weekly_market_series(ticker, rows, self.manifest["as_of"], regimes)
        if regimes is None:
            labels, provenance = market_hmm(rows, self.manifest["as_of"])
            value = weekly_market_series(ticker, rows, self.manifest["as_of"], labels)
            value["method"]["hmm"] = {**provenance, "source_input_hash": input_hash}
        admitted = [r for r in rows if utc(r["available_at"]) <= utc(self.manifest["as_of"])]
        self.publish("market:" + ticker, value, kind="market-series", sources=[source], licence=licence,
                     observed_at=admitted[-1]["observed_at"], available_at=max(r["available_at"] for r in admitted),
                     input_hash=input_hash)

    def finish(self):
        self.output.mkdir(parents=True, exist_ok=True)
        target = self.output / "replay-manifest.json"
        staged = target.with_suffix(".json.tmp")
        staged.write_bytes(canonical_bytes(self.manifest))
        staged.replace(target)
        # Revoked/unlisted series cannot survive as accessible static payloads.
        directory = (self.output / "artifacts/replay").resolve()
        allowed = {e["url"] for e in self.manifest["artifacts"].values() if e["status"] == "AVAILABLE"}
        if directory.is_dir():
            for path in directory.glob("*.json"):
                if path.resolve().parent != directory:
                    raise ValueError("Artifact cleanup target escapes its directory")
                if "/artifacts/replay/" + path.name not in allowed:
                    path.unlink()


def first_party_license(dataset_key: str) -> dict:
    return {"status": "FIRST_PARTY", "permitted_uses": ["publish_derived"],
            "dataset_key": dataset_key, "valid_through": None}
