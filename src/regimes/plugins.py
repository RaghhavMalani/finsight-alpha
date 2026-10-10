"""Registered Phase 5 series plugins. Settings arrive through the identity-bound
run context; computations never read files, fetch data or open a holdout."""

from types import SimpleNamespace

import pandas as pd

from finsight.plugins import SeriesInput, SeriesModel, SignalType

VOL = "per_observation_volatility"
RET = "proportional_return"


def _state_at(frame):
    return frame.observed_at.iloc[-1].isoformat()


class VolatilityDiagnostics(SeriesModel):
    name = "regimes.volatility"
    version = "1"
    return_input = "mkt"
    series_inputs = (SeriesInput("mkt", unit=RET, minimum=60),)
    outputs = (
        SignalType("volatility_state", "category"),
        SignalType("realized_vol_20", "float", VOL),
        SignalType("ewma_vol", "float", VOL),
        SignalType("garch_persistence"),
        SignalType("garch_half_life", "float", "observations"),
        SignalType("arch_lm_pvalue"),
    )
    derived_outputs = (
        SignalType("realized_vol_20", "float", VOL),
        SignalType("volatility_state", "category"),
        SignalType("garch_conditional_vol", "float", VOL),
    )
    def compute(self, windows, context):
        from src.regimes.volatility import describe

        frame = windows[self.return_input]
        result = describe(
            frame,
            settings=context["settings"]["volatility"],
            tail=context["settings"]["volatility"]["tail"],
        )
        current, garch = result["current"], result["garch"]
        components = current["components"]
        fitted = garch["status"] == "AVAILABLE"
        values = {
            "volatility_state": current["state"],
            "realized_vol_20": components.get("rv_20"),
            "ewma_vol": components.get("ewma_vol"),
            "garch_persistence": garch["persistence"] if fitted else None,
            "garch_half_life": garch.get("half_life_observations") if fitted else None,
            "arch_lm_pvalue": result["arch_lm"].get("lm_pvalue"),
        }
        missing = [k for k, v in values.items() if v is None]
        issues = []
        if fitted and garch["fit_status"] != "CONVERGED":
            issues.append(
                {
                    "kind": "GARCH_UNCONVERGED"
                    if garch["fit_status"] == "UNCONVERGED"
                    else "GARCH_BOUNDARY",
                    "severity": "LOW",
                    "reason": garch["half_life_domain"],
                }
            )
        if current["state"] == "UNRESOLVED":
            issues.append(
                {
                    "kind": "INSUFFICIENT_WARMUP",
                    "severity": "LOW",
                    "reason": "Frozen D0.4.2 readiness (60 returns and identifiable components) not met at the cutoff",
                }
            )
        stamps = result["stamps"]
        conditional = result["garch_conditional"]
        return {
            "status": "PARTIAL" if missing else "COMPUTED",
            "state_at": _state_at(frame),
            "current": values,
            "missing": missing,
            "paths": {
                "tail": result["tail"],
                "states": [[t, p["state"]] for t, p in zip(stamps, result["path"])],
                "rv_20": [[t, p["components"].get("rv_20")] for t, p in zip(stamps, result["path"])],
            },
            "diagnostics": {
                "components": components,
                "cluster_score": current.get("cluster_score"),
                "cluster_contributions": current.get("cluster_contributions"),
                "state_counts": result["state_counts"],
                "garch": garch,
                "arch_lm": result["arch_lm"],
                "descriptive_engine": "src.dynamics.market_regime.volatility_path (market-regime/0.4.2), per observation",
                "confidence_meaning": "Window sufficiency, not calibrated probability",
            },
            "issues": issues,
            "derived": {
                "realized_vol_20": [
                    [t, p["components"].get("rv_20")] for t, p in zip(stamps, result["path"])
                ],
                "volatility_state": [
                    [t, p["state"]] for t, p in zip(stamps, result["path"])
                ],
                "garch_conditional_vol": [
                    [t, v] for t, v in zip(stamps, conditional or [])
                ],
            },
        }


class _HMM(SeriesModel):
    n_states = 2
    config_name = ""
    return_input = "mkt"
    outputs = (
        SignalType("hmm_state", "category"),
        SignalType("hmm_posterior"),
        SignalType("expected_duration", "float", "observations"),
        SignalType("hmm_converged", "bool"),
    )
    def features(self, windows):
        raise NotImplementedError

    def compute(self, windows, context):
        from src.regimes.hmm import fit, issues

        frame, columns, return_feature = self.features(windows)
        settings = context["settings"]
        config = settings["hmm"]["configs"][self.config_name]
        if len(frame) < config["minimum"]:
            from finsight.plugins.series import SeriesUnavailable

            raise SeriesUnavailable(
                f"{len(frame)} complete feature rows < {config['minimum']} warm-up minimum"
            )
        result = fit(
            frame,
            columns,
            n_states=self.n_states,
            seed=self.seed,
            return_feature=return_feature,
            settings=settings,
            unit=context["observation_unit"],
        )
        if result["status"] != "AVAILABLE":
            from finsight.plugins.series import SeriesUnavailable

            raise SeriesUnavailable(result["reason"])
        stamps = [t.isoformat() for t in frame.observed_at]
        index = result["current_index"]
        found = [
            {"kind": i["kind"], "severity": i["severity"], "reason": i["reason"]}
            for i in issues(result, settings=settings, asset=context["asset"], run_hint=self.name)
        ]
        state_path = [[t, result["labels"][s]] for t, s in zip(stamps, result["states"])]
        return {
            "status": "COMPUTED",
            "state_at": stamps[-1],
            "current": {
                "hmm_state": result["current_state"],
                "hmm_posterior": float(result["current_posterior"][index]),
                "expected_duration": result["expected_duration"][index],
                "hmm_converged": result["converged"],
            },
            "paths": {
                "states": state_path,
                "confidence": [[t, c] for t, c in zip(stamps, result["confidence"])],
                "posterior_tail": [
                    [t, p]
                    for t, p in zip(stamps[-len(result["posterior_tail"]):], result["posterior_tail"])
                ],
            },
            "diagnostics": {
                k: v
                for k, v in result.items()
                if k not in {"states", "confidence", "posterior_tail"}
            }
            | {"features": list(columns), "rows": len(frame), "config": self.config_name},
            "issues": found,
            "derived": self.derived(state_path),
        }

    def derived(self, state_path):
        return {}


class RegimeHMM2(_HMM):
    name = "regimes.hmm2"
    version = "1"
    n_states = 2
    config_name = "hmm2-diagnostic"
    series_inputs = (
        SeriesInput("mkt", unit=RET, minimum=120),
        SeriesInput("realized_vol_20", unit=VOL, minimum=120),
    )
    derived_outputs = (SignalType("hmm2_state", "category"),)

    def features(self, windows):
        name = self.return_input
        returns = windows[name][["observed_at", "value"]].rename(columns={"value": name})
        vol = windows["realized_vol_20"][["observed_at", "value"]].rename(
            columns={"value": "realized_vol_20"}
        )
        frame = returns.merge(vol, on="observed_at", how="inner").dropna()
        return frame.reset_index(drop=True), [name, "realized_vol_20"], name

    def derived(self, state_path):
        return {"hmm2_state": state_path}


class RegimeHMM4(_HMM):
    name = "regimes.hmm4"
    version = "1"
    n_states = 4
    config_name = "hmm4-existing"
    series_inputs = (SeriesInput("mkt", unit=RET, minimum=312),)
    def features(self, windows):
        from src.replay.factors import HMM_COLUMNS, factor_features

        source = windows[self.return_input]
        series = SimpleNamespace(
            frame=pd.DataFrame({"Date": source.observed_at, "MKT": source.value.astype(float)})
        )
        _, features = factor_features(series)
        features = features.assign(observed_at=source.observed_at.reset_index(drop=True))
        frame = features.dropna(subset=HMM_COLUMNS).reset_index(drop=True)
        return frame, list(HMM_COLUMNS), "log_return"


def _aligned(windows, names, *, how="inner"):
    frame = None
    for name in names:
        part = windows[name][["observed_at", "value"]].rename(columns={"value": name})
        frame = part if frame is None else frame.merge(part, on="observed_at", how=how)
    return frame.sort_values("observed_at").reset_index(drop=True)


class FactorDiagnostic(SeriesModel):
    name = "regimes.factors"
    version = "1"
    tier = "public"
    series_inputs = (
        SeriesInput("mkt", unit=RET, minimum=60),
        SeriesInput("smb", unit=RET, minimum=60),
        SeriesInput("hml", unit=RET, minimum=60),
        SeriesInput("mom", unit=RET, minimum=60),
        SeriesInput("hmm2_state", kind="category", minimum=0),
    )
    outputs = (
        SignalType("market_beta"),
        SignalType("r_squared"),
        SignalType("intercept", "float", RET),
        SignalType("neutrality", "category"),
    )

    def design(self, windows, target, controls):
        return _aligned(windows, [target, *controls])

    def compute(self, windows, context):
        from src.regimes.factors import diagnose

        settings = context["settings"]["factors"]
        target, controls = settings[self.tier]["target"], settings[self.tier]["controls"]
        frame = self.design(windows, target, controls)
        states = None
        if len(windows["hmm2_state"]):
            labels = windows["hmm2_state"][["observed_at", "value"]].rename(columns={"value": "state"})
            frame = frame.merge(labels, on="observed_at", how="left")
            states = frame.state.tolist()
        result = diagnose(
            frame,
            target,
            controls,
            states=states,
            window=settings["rolling_window"],
            minimum=settings["minimum"],
        )
        full = result["full_window"]
        if full["status"] != "AVAILABLE":
            from finsight.plugins.series import SeriesUnavailable

            raise SeriesUnavailable(full.get("reason", "Factor design unidentifiable"))
        terms = {r["term"]: r for r in full["terms"]}
        statuses = [r["neutrality"] for r in full["terms"] if r["neutrality"]]
        beta_term = "mkt" if "mkt" in terms else controls[0]
        overall = "EXPOSED" if "EXPOSED" in statuses else "WATCH" if "WATCH" in statuses else "NEUTRAL"
        return {
            "status": "COMPUTED",
            "state_at": frame.observed_at.iloc[-1].isoformat(),
            "current": {
                "market_beta": terms[beta_term]["coefficient"],
                "r_squared": full["r_squared"],
                "intercept": terms["intercept"]["coefficient"],
                "neutrality": overall,
            },
            "paths": {
                "rolling_tail": result["rolling"]["tail"],
                "decomposition_tail": result["decomposition"]["tail"],
            },
            "diagnostics": {k: v for k, v in result.items() if k not in {"rolling", "decomposition"}}
            | {
                "rolling_semantics": result["rolling"]["semantics"],
                "decomposition": {k: v for k, v in result["decomposition"].items() if k != "tail"},
                "regime_states": "hmm2-diagnostic filtered states" if states else "UNAVAILABLE",
            },
            "issues": [
                {
                    "kind": "FACTOR_COVERAGE_PARTIAL",
                    "severity": "INFO",
                    "reason": "Partial factor set (" + ", ".join(controls) + "); seven-factor neutrality UNAVAILABLE",
                }
            ],
        }


class MomentumView(SeriesModel):
    name = "regimes.momentum"
    version = "1"
    return_input = "mkt"
    mom_key = "mom"
    signal_label = "12-1 market-factor momentum"
    series_inputs = (
        SeriesInput("mkt", unit=RET, minimum=253),
        SeriesInput("mom", unit=RET, minimum=0),
        SeriesInput("hmm2_state", kind="category", minimum=1),
    )
    outputs = (
        SignalType("momentum_signal"),
        SignalType("momentum_sign", "category"),
    )

    def compute(self, windows, context):
        from src.regimes.momentum import mom_by_state, signal_by_state, signal_path

        settings = context["settings"]["momentum"]
        returns = windows[self.return_input][["observed_at", "value"]].rename(
            columns={"value": "mkt"}
        )
        signal = signal_path(
            returns.mkt.tolist(), lookback=settings["lookback"], skip=settings["skip"]
        )
        returns = returns.assign(signal=signal)
        states = windows["hmm2_state"][["observed_at", "value"]].rename(columns={"value": "state"})
        mom = windows[self.mom_key][["observed_at", "value"]].rename(columns={"value": "mom"})
        frame = returns.merge(states, on="observed_at", how="left").merge(
            mom, on="observed_at", how="left"
        )
        frame = frame.astype(object).where(frame.notna(), None)
        current = signal[-1]
        unit = context["observation_unit"]
        index_label = (
            "252/21 session-index window (XNYS package evidence)"
            if unit == "session"
            else "252/21 observation-index approximation · CALENDAR_UNAVAILABLE"
        )
        stamps = [t.isoformat() for t in frame.observed_at]
        return {
            "status": "COMPUTED",
            "state_at": stamps[-1],
            "current": {
                "momentum_signal": current,
                "momentum_sign": "POSITIVE" if current > 0 else "NEGATIVE" if current < 0 else "ZERO",
            },
            "paths": {
                "signal_tail": [[t, s] for t, s in list(zip(stamps, signal))[-250:]],
            },
            "diagnostics": {
                "definition": self.signal_label + ": prod(1 + r) - 1 over observations t-252 .. t-22",
                "index_label": index_label,
                "signal_by_state": signal_by_state(frame.signal.tolist(), frame.state.tolist()),
                "signal_by_state_semantics": "Distribution of the signal itself by hmm2 filtered state at the same observation; not a return",
                "mom_factor_by_regime": mom_by_state(
                    frame.mom.tolist(),
                    frame.state.tolist(),
                    annualization=context["annualization"],
                    minimum=settings["mom_factor_sharpe_minimum"],
                ),
                "mom_factor_semantics": "MOM FACTOR BY REGIME: cross-sectional momentum-factor diagnostic; next-observation published MOM factor grouped by the lagged filtered state. Not the return of the 12-1 market-factor signal.",
                "verdicts": "None. Research OS verdicts live only on the frozen Phase 4 card.",
            },
            "issues": [],
        }


SERIES_PLUGINS = {
    plugin.name: plugin
    for plugin in (
        VolatilityDiagnostics,
        RegimeHMM2,
        RegimeHMM4,
        FactorDiagnostic,
        MomentumView,
    )
}
