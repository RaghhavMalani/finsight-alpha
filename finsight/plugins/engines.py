"""Thin adapters for preserved scientific engines; no claim promotion or fallback."""

from __future__ import annotations
import json
import numpy as np
import pandas as pd
from .model import Model
from .contracts import SignalType, utc


class HMM(Model):
    inputs = ["market_return", "volatility"]
    outputs = ["regime"]
    output_types = {"regime": SignalType("regime", "int")}
    task = "computation"

    def fit(self, train):
        from src.regime.hmm_regime import train_hmm_regime_model

        unknown = set(self.config) - {"n_states", "covariance_type"}
        if unknown:
            raise ValueError(f"Unknown HMM configuration: {unknown}")
        self.fitted = train_hmm_regime_model(
            train, self.inputs, random_state=self.seed % 2**32, **self.config
        )
        if not self.fitted["success"]:
            raise ValueError(self.fitted["message"])
        self.history = train[self.inputs].copy()

    def predict(self, rows):
        from src.regime.hmm_regime import predict_hmm_regimes

        history = self.history.copy()
        result = []
        # Existing Viterbi uses the whole supplied sequence. Only pass a prefix,
        # then take its last state, so later held-out rows cannot revise this row.
        for _, row in rows.iterrows():
            history = pd.concat(
                [history, row[self.inputs].to_frame().T], ignore_index=True
            )
            result.append(
                int(
                    predict_hmm_regimes(
                        self.fitted["model"],
                        self.fitted["scaler"],
                        history,
                        self.inputs,
                    ).iloc[-1]
                )
            )
        return pd.DataFrame({"regime": result}, index=rows.index)

    def trace(self):
        monitor = self.fitted["model"].monitor_
        return {
            "engine": "src.regime.hmm_regime",
            "log_likelihood": list(monitor.history),
            "converged": bool(monitor.converged),
            "semantics": "Training monitor; prefix-only held-out state labels",
        }


class GBMSuite(Model):
    inputs = ["market_return", "volatility"]
    outputs = ["up_probability"]
    task = "classification"

    def fit(self, train):
        from src.ml.point_in_time_modeling import _model
        from src.ml.models import train_model

        if set(self.config) - {"model_name"}:
            raise ValueError("GBM suite accepts only its declared model_name")
        name = self.config.get("model_name", "gradient_boosting")
        if name not in {"logistic_regression", "random_forest", "gradient_boosting"}:
            raise ValueError("Unsupported estimator family")
        if not set(train.target.unique()) <= {0.0, 1.0} or train.target.nunique() != 2:
            raise ValueError("GBM suite requires both binary classes")
        self.estimator = train_model(
            _model(name, self.seed % 2**32), train[self.inputs], train.target
        )

    def predict(self, rows):
        from src.ml.models import make_predictions

        _, probability = make_predictions(self.estimator, rows[self.inputs])
        if probability is None:
            raise ValueError("Estimator did not produce probabilities")
        return pd.DataFrame({"up_probability": probability}, index=rows.index)

    def trace(self):
        return {
            "engine": "src.ml.point_in_time_modeling._model",
            "model_name": self.config.get("model_name", "gradient_boosting"),
            "semantics": "Platform owns family selection and holdout access; no hidden suite holdout",
        }


class MLP(Model):
    inputs = ["market_return", "volatility"]
    outputs = ["up_probability"]
    task = "classification"

    def fit(self, train):
        from src.ml.neural import Architecture, train as fit

        if not set(train.target.unique()) <= {0.0, 1.0}:
            raise ValueError("MLP requires binary labels")
        architecture = Architecture.parse({**self.config, "seed": self.seed % 2**31})
        self.network, self.scaler, self.record = fit(
            architecture, train[self.inputs], train.target
        )

    def predict(self, rows):
        from src.ml.neural import predict

        return pd.DataFrame(
            {"up_probability": predict(self.network, self.scaler, rows[self.inputs])},
            index=rows.index,
        )

    def trace(self):
        return {
            "engine": "src.ml.neural",
            "semantics": "Actual final development fit epochs and snapshots; no held-out training",
            **self.record,
        }


class VolatilityClustering(Model):
    inputs = ["market_return"]
    outputs = ["realized_volatility", "volatility_state"]
    output_types = {"volatility_state": SignalType("volatility_state", "category")}
    task = "computation"

    def fit(self, train):
        if set(self.config) - {"annual_sessions"}:
            raise ValueError("Unknown volatility configuration")
        self.history = train.market_return.tolist()

    def predict(self, rows):
        from src.dynamics.market_regime import volatility_path

        path = volatility_path(
            self.history + rows.market_return.tolist(),
            self.config.get("annual_sessions", 252),
        )[-len(rows) :]
        if any(p["components"].get("realized_vol") is None for p in path):
            raise ValueError(
                "Fewer than 20 returns for realized volatility; clustering may require longer history"
            )
        self.record = path
        return pd.DataFrame(
            {
                "realized_volatility": [p["components"]["realized_vol"] for p in path],
                "volatility_state": [p["state"] for p in path],
            },
            index=rows.index,
        )

    def trace(self):
        return {
            "engine": "src.dynamics.market_regime.volatility_path",
            "states": self.record,
            "semantics": "Unavailable clustering components stay null/UNRESOLVED",
        }


class MonteCarloVaR(Model):
    inputs = ["market_return"]
    outputs = ["var_return", "cvar_return"]
    task = "computation"

    def fit(self, train):
        if set(self.config) - {"simulations", "annual_sessions", "confidence"}:
            raise ValueError("Unknown Monte Carlo configuration")
        self.mean = float(train.market_return.mean())
        self.sigma = float(train.market_return.std(ddof=1))

    def predict(self, rows):
        from src.simulation.monte_carlo import (
            simulate_gbm_paths,
            calculate_final_prices,
            calculate_simulated_returns,
        )
        from src.risk.var_cvar import (
            calculate_monte_carlo_var,
            calculate_monte_carlo_cvar,
        )

        annual = self.config.get("annual_sessions", 252)
        simulations = self.config.get("simulations", 512)
        confidence = self.config.get("confidence", 0.95)
        if (
            type(simulations) is not int
            or not 100 <= simulations <= 100_000
            or not 0 < confidence < 1
            or annual <= 0
        ):
            raise ValueError("Invalid Monte Carlo settings")
        paths = simulate_gbm_paths(
            1.0,
            self.mean * annual,
            self.sigma * np.sqrt(annual),
            1 / annual,
            steps=1,
            n_simulations=simulations,
            random_seed=self.seed,
        )
        returns = calculate_simulated_returns(calculate_final_prices(paths), 1.0)
        value = calculate_monte_carlo_var(returns, confidence)
        cvalue = calculate_monte_carlo_cvar(returns, confidence)
        return pd.DataFrame(
            {"var_return": value, "cvar_return": cvalue}, index=rows.index
        )

    def trace(self):
        return {
            "engine": "src.simulation.monte_carlo + src.risk.var_cvar",
            "normalization": "Unit notional, one-session return distribution",
            "semantics": "Fixed development-fit parameters and seed; no probability calibration certificate",
        }


def _events(raw, information_at):
    payload = json.loads(raw)
    start, end = utc(payload["start_at"]), utc(payload["end_at"])
    if not start < end <= utc(information_at):
        raise ValueError("Event window crosses the row information cutoff")
    clocks = [utc(t) for t in payload["events"]]
    if any(t < start or t > end for t in clocks) or clocks != sorted(set(clocks)):
        raise ValueError(
            "Event times must be ordered, unique, and available in this window"
        )
    # Values are published event timestamps, never synthesized from daily counts.
    return tuple((t - start).total_seconds() / 86400 for t in clocks), (
        end - start
    ).total_seconds() / 86400


class Hawkes(Model):
    inputs = ["event_history"]
    input_types = {
        "event_history": SignalType("event_history", "json", "published-event-window")
    }
    outputs = ["fitted_branching_ratio"]
    task = "computation"

    def fit(self, train):
        from src.dynamics.market_regime import _event_fit

        if self.config:
            raise ValueError(
                "Hawkes uses the preserved frozen estimator without tuning"
            )
        for _, row in train.iterrows():
            times, horizon = _events(row.event_history, row.information_at)
        if len(times) < 30:
            raise ValueError("Fewer than 30 published events; Hawkes fit unavailable")
        self.record = _event_fit(times, horizon)
        if self.record["status"] != "AVAILABLE":
            raise ValueError("Existing Hawkes optimizer did not return a usable fit")

    def predict(self, rows):
        for _, row in rows.iterrows():
            _events(row.event_history, row.information_at)
        return pd.DataFrame(
            {"fitted_branching_ratio": self.record["fitted_rho"]}, index=rows.index
        )

    def trace(self):
        return {
            "engine": "src.dynamics.market_regime._event_fit",
            **self.record,
            "semantics": "Frozen development-window parameter; no causal graph or event-intensity forecast",
        }


class RegimeD042(Model):
    inputs = ["regime_world"]
    input_types = {
        "regime_world": SignalType("regime_world", "json", "published-world-vintage")
    }
    outputs = ["regime", "vector_complete"]
    output_types = {
        "regime": SignalType("regime", "category"),
        "vector_complete": SignalType("vector_complete", "bool"),
    }
    task = "computation"

    @staticmethod
    def world(row):
        from src.dynamics.market_regime_inputs import RegimeWorld

        world = RegimeWorld.model_validate(json.loads(row.regime_world))
        for family in (
            world.daily,
            world.intraday,
            world.factors,
            world.macro,
            world.events,
        ):
            if any(r.available_at > utc(row.information_at) for r in family):
                raise ValueError(
                    "Nested world data crosses its declared information cutoff"
                )
        return world

    def fit(self, train):
        if self.config:
            raise ValueError("D0.4.2 uses the preserved policy without tuning")
        for _, row in train.iterrows():
            self.world(row)

    def predict(self, rows):
        from src.dynamics.market_regime import compile_world

        states = []
        self.record = []
        for _, row in rows.iterrows():
            analysis = compile_world(self.world(row), as_of=row.decision_at)
            current = analysis["current"]
            states.append((current["regime"], current["vector_complete"]))
            self.record.append(
                {
                    "as_of": row.decision_at.isoformat(),
                    "regime": current["regime"],
                    "fracture": current["fracture"],
                    "vector_complete": current["vector_complete"],
                }
            )
        return pd.DataFrame(states, columns=self.outputs, index=rows.index)

    def trace(self):
        return {
            "engine": "src.dynamics.market_regime.compile_world",
            "states": self.record,
            "semantics": "Existing descriptive components; partial evidence is never a complete score",
        }


ENGINES = {
    "hmm": HMM,
    "gbm-suite": GBMSuite,
    "mlp": MLP,
    "hawkes": Hawkes,
    "volatility-clustering": VolatilityClustering,
    "monte-carlo-var": MonteCarloVaR,
    "d0.4.2": RegimeD042,
}
