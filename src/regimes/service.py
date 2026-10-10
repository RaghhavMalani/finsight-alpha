"""Operator pipeline and read-only projections for Phase 5 regime intelligence.

Computations happen only in `Pipeline.run_market` (an explicit operator or
scheduler action). Snapshots read sealed runs, re-verify lineage and turn any
broken link into an UNAVAILABLE module; nothing here fetches upstream data.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from finsight.plugins import RunRegistry, SeriesRunner, SignalStore
from finsight.plugins.derived import admit_outputs
from src.data_organ.registry import Registry
from src.truth.contracts import canonical_hash

from .calendar import session_evidence
from .contracts import CLAIMS, SCHEMA, issue, module_status, weakest_quality
from .lineage import JournalIndex, verify_run
from .plugins import (
    FactorDiagnostic,
    MomentumView,
    RegimeHMM2,
    RegimeHMM4,
    VolatilityDiagnostics,
)
from .profile import market, profile, profile_sha256, run_context

ROOT = Path(__file__).resolve().parents[2]
ORDER = ("volatility", "hmm2", "hmm4", "factors", "momentum")
PLUGINS = {
    "volatility": VolatilityDiagnostics,
    "hmm2": RegimeHMM2,
    "hmm4": RegimeHMM4,
    "factors": FactorDiagnostic,
    "momentum": MomentumView,
}


def _days(later, earlier):
    def parse(value):
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    return (parse(later) - parse(earlier)).total_seconds() / 86400


def plugin_chain(tier):
    if tier == "PUBLIC":
        return dict(PLUGINS), ORDER, {"volatility", "hmm2"}, {}
    from .local import (
        AssetReturns,
        IntradaySeasonality,
        LocalFactors,
        LocalHMM2,
        LocalHMM4,
        LocalMomentum,
        LocalVolatility,
    )

    plugins = {
        "returns": AssetReturns,
        "volatility": LocalVolatility,
        "hmm2": LocalHMM2,
        "hmm4": LocalHMM4,
        "factors": LocalFactors,
        "momentum": LocalMomentum,
        "seasonality": IntradaySeasonality,
    }
    return plugins, tuple(plugins), {"returns", "volatility", "hmm2"}, {"factors": "US-MKT"}


class Pipeline:
    def __init__(self, runtime: Path | str, *, tenant_id: str | None = None):
        self.runtime = Path(runtime)
        self.tenant_id = tenant_id or profile()["tenant"]
        self.store = SignalStore(self.runtime / "signals")
        self.journal = Registry(self.runtime / "data-organ.duckdb")
        self.registry = RunRegistry(self.runtime / "runs.sqlite")
        self.runner = SeriesRunner(self.store, self.registry, root=ROOT)

    def session(self, asset, as_of):
        name = "mkt" if market(asset)["tier"] == "PUBLIC" else "market_close"
        rows = self.store.history(self.tenant_id, as_of=as_of, names=[name], asset=asset)
        stamps = [r.observed_at for r in rows]
        if name == "market_close":
            from .local import alpaca_session

            stamps = alpaca_session(stamps)
        return session_evidence(market(asset)["calendar"], stamps)

    def run_market(self, asset, as_of):
        """Explicit computation at one cutoff; idempotent through sealed reuse."""
        context = run_context(asset, self.session(asset, as_of))
        plugins, order, producers, roles = plugin_chain(market(asset)["tier"])
        runs = {}
        for key in order:
            if key == "seasonality" and not self.store.history(
                self.tenant_id, as_of=as_of, names=["iex_bar_close"], asset=asset
            ):
                continue
            runs[key] = self.runner.compute(
                plugins[key],
                tenant_id=self.tenant_id,
                asset=asset,
                as_of=as_of,
                assets=roles,
                context=context,
                scope=market(asset)["tier"],
            )
            if key in producers:
                admit_outputs(self.store, self.tenant_id, runs[key])
        if self.registry.opening_count(self.tenant_id):
            raise RuntimeError("Phase 5 registry recorded a holdout opening")
        return runs

    def snapshot(self, asset, as_of, runs=None):
        """Read-only projection of sealed runs with re-verified lineage."""
        runs = runs or self.sealed(asset, as_of)
        try:
            index = JournalIndex(self.journal, self.tenant_id)
        except ValueError as error:
            chains = {
                key: {"status": "INVALID", "run_id": run["run_id"], "reason": str(error)}
                for key, run in runs.items()
            }
            return build_snapshot(asset, as_of, runs, chains)
        seen, histories = {}, {}
        chains = {
            key: verify_run(
                self.store,
                self.registry,
                index,
                self.tenant_id,
                run,
                _seen=seen,
                histories=histories,
            )
            for key, run in runs.items()
        }
        return build_snapshot(asset, as_of, runs, chains)

    def sealed(self, asset, as_of):
        plugins, _, _, _ = plugin_chain(market(asset)["tier"])
        found = {}
        for run in self.registry.list_runs(self.tenant_id):
            contract = run.get("contract") or {}
            if contract.get("asset") == asset and contract.get("as_of") == _iso(as_of):
                for key, plugin in plugins.items():
                    if contract.get("plugin") == plugin.name:
                        found[key] = run
        missing = set(plugins) - set(found) - {"seasonality"}
        if missing:
            raise LookupError("No sealed runs for " + ", ".join(sorted(missing)))
        return found


def _iso(value):
    from src.data.as_of import AsOfContext

    return AsOfContext.bind(value).isoformat


def _module(run, chain, *, partial_reason=None):
    if chain["status"] != "VERIFIED":
        return module_status("UNAVAILABLE", "INPUT_LINEAGE_INVALID: " + chain["reason"])
    if run["status"] == "UNAVAILABLE":
        return module_status("UNAVAILABLE", run.get("reason") or "Computation unavailable")
    if run["status"] == "PARTIAL":
        return module_status(
            "PARTIAL", "Missing components: " + ", ".join(run.get("missing", []))
        )
    if partial_reason:
        return module_status("PARTIAL", partial_reason)
    return module_status("AVAILABLE")


def build_snapshot(asset, as_of, runs, chains):
    spec = market(asset)
    settings = profile()
    india = spec["calendar"].get("status") == "UNAVAILABLE"
    local = spec["tier"] == "LOCAL_ONLY"
    daily_partial = (
        "Observation-step semantics: no evidenced XNSE sessions; durations and windows are per observed record; no annualisation"
        if india
        else None
    )
    vol, two, four = runs["volatility"], runs["hmm2"], runs["hmm4"]
    state_at = vol.get("state_at") or two.get("state_at")
    issues = []
    for key, run in runs.items():
        for item in run.get("issues", []):
            kind = item["kind"]
            if kind not in {"SERIES_UNAVAILABLE", "PLUGIN_RUN_FAILED"} or run["status"] == "UNAVAILABLE":
                issues.append(
                    issue(kind, item["severity"], item["reason"], asset=asset, evidence=run["run_id"])
                )
    for key, chain in chains.items():
        if chain["status"] != "VERIFIED":
            issues.append(
                issue("INPUT_LINEAGE_INVALID", "HIGH", chain["reason"], asset=asset, evidence=runs[key]["run_id"])
            )
    stale_days = _days(as_of, state_at) if state_at else None
    limits = settings["issues"]["stale_input_calendar_days"]
    if stale_days is not None and stale_days > limits["medium"]:
        issues.append(
            issue(
                "STALE_INPUT",
                "HIGH" if stale_days > limits["high"] else "MEDIUM",
                f"Latest admitted observation is {stale_days:.0f} calendar days before the requested cutoff",
                asset=asset,
                evidence=state_at,
            )
        )
    if india:
        issues.append(
            issue(
                "CALENDAR_UNAVAILABLE",
                "MEDIUM",
                spec["calendar"]["reason"],
                asset=asset,
                evidence=canonical_hash(spec["calendar"]),
            )
        )
    issues.append(
        issue(
            "EVENT_STREAM_UNAVAILABLE",
            "INFO",
            "No admitted event stream; aggregate Hawkes pressure is not computed",
            asset=asset,
            evidence="events",
        )
    )
    if local:
        issues.append(
            issue(
                "SOURCE_RESTRICTED",
                "INFO",
                "No derived-publication grant for this source; local authenticated view only",
                asset=asset,
                evidence=spec["source"],
            )
        )
    qualities = sorted(
        {
            source["clock_quality"]
            for chain in chains.values()
            if chain["status"] == "VERIFIED"
            for source in _all_sources(chain)
        }
    )
    coupling_ok = (
        chains["hmm2"]["status"] == "VERIFIED"
        and two["contract"]["lineage"]["producer_runs"] == [vol["run_id"]]
    )
    modules = {
        "volatility": _module(vol, chains["volatility"], partial_reason=daily_partial),
        "hmm": _module(two, chains["hmm2"], partial_reason=daily_partial),
        "hmm4": _module(four, chains["hmm4"], partial_reason=daily_partial),
        "coupling": module_status("AVAILABLE")
        if coupling_ok and not india
        else module_status("PARTIAL", daily_partial)
        if coupling_ok
        else module_status("UNAVAILABLE", "Volatility producer run is not the bound HMM input"),
        "seasonality": _module(runs["seasonality"], chains["seasonality"])
        if "seasonality" in runs
        else module_status(
            "UNAVAILABLE",
            "INDIA INTRADAY SEASONALITY — UNAVAILABLE: no admitted intraday source and no evidenced XNSE session manifest"
            if india
            else "Daily market-factor library: no admitted intraday evidence for this row",
            unblock="Licensed intraday evidence with an evidenced exchange session calendar"
            if india
            else "Local IEX minute admission (local tier only; never public without a grant)",
        ),
        "factors": module_status(
            "UNAVAILABLE" if runs["factors"]["status"] == "UNAVAILABLE" or chains["factors"]["status"] != "VERIFIED" else "PARTIAL",
            "PARTIAL_FACTOR_DIAGNOSTIC: " + ", ".join(settings["factors"]["public"]["controls"]) + " only; seven-factor neutrality UNAVAILABLE",
        ),
        "momentum": _module(runs["momentum"], chains["momentum"], partial_reason=daily_partial),
        "events": module_status(
            "UNAVAILABLE",
            "EVENT PRESSURE — UNAVAILABLE: no admitted event stream",
            unblock="An admitted event stream with genuine observation/availability clocks and a licence",
        ),
        "fracture": module_status(
            "PARTIAL",
            "PARTIAL SUBTOTAL: volatility component only; six-component score and 3D landscape UNAVAILABLE (spread, liquidity, events, seven factors missing)",
        ),
        "iohmm": module_status(
            "UNAVAILABLE",
            "Hawkes-driven input-output HMM and its out-of-sample gate are UNAVAILABLE: no admitted event stream",
        ),
    }
    tail = (vol.get("paths") or {}).get("tail") or []
    fracture = None
    if len(tail) >= 2:
        from src.dynamics.market_regime import fracture as frozen_fracture

        def v_component(row):
            z = row.get("vol_z")
            return None if z is None else min(max((z + 2) / 6, 0.0), 1.0)

        fracture = frozen_fracture({"V": v_component(tail[-1])}, {"V": v_component(tail[-2])})
    run_ids = {key: run["run_id"] for key, run in runs.items()}
    return {
        "schema_version": SCHEMA,
        "asset": asset,
        "market": spec["label"],
        "series_label": spec.get("series_label", asset),
        "not_a": spec.get("not_a"),
        "country": spec.get("country", "US"),
        "tier": spec["tier"],
        "badges": spec["badges"]
        + (["STALE_INPUT"] if any(i["kind"] == "STALE_INPUT" for i in issues) else [])
        + (["UNCONVERGED"] if any(i["kind"] == "HMM_UNCONVERGED" for i in issues) else []),
        "requested_as_of": _iso(as_of),
        "state_at": state_at,
        "stale_calendar_days": stale_days,
        "observation_unit": vol["contract"]["context"]["observation_unit"],
        "input_hash": canonical_hash({k: r["contract"]["lineage"]["lineage_digest"] for k, r in runs.items()}),
        "run_ids": run_ids,
        "profile_sha256": profile_sha256(),
        "evidence_scope": "PUBLIC_DERIVED" if spec["tier"] == "PUBLIC" else "LOCAL_ONLY",
        "evidence_quality": {
            "weakest": weakest_quality(qualities) if qualities else None,
            "present": qualities,
        },
        "calendar": vol["contract"]["context"].get("session_evidence") or spec["calendar"],
        "module_statuses": modules,
        "issues": sorted(issues, key=lambda i: (-_rank(i["severity"]), i["kind"])),
        "claims": dict(CLAIMS),
        "lineage": chains,
        "runs": runs,
        "fracture": fracture,
    }


def _rank(severity):
    return {"INFO": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}[severity]


def _all_sources(chain):
    yield from chain.get("sources", [])
    for producer in chain.get("producers", []):
        yield from _all_sources(producer)
