"""Reproducible validation suite for pricing, risk, signal, and RAG layers.

The suite deliberately uses public engine entry points. It is not a second
implementation of the product code: independent formulae and optimizers only
appear where they are needed to form a validation oracle.
"""

from __future__ import annotations

import json
import math
import platform
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import xlogy
from scipy.stats import chi2
from sklearn.metrics import roc_auc_score

from src.pricing import black_scholes
from src.rag.retriever import hybrid_retrieve
from src.risk import portfolio_optimization


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]

HULL_REFERENCE_URL = (
    "https://search.r-project.org/CRAN/refmans/QFRM/html/BS_Simple.html"
)

BLACK_SCHOLES_REFERENCE_CASES = (
    {
        "reference": "Hull, Options, Futures, and Other Derivatives, example 15.6",
        "source_url": HULL_REFERENCE_URL,
        "S": 42.0,
        "K": 40.0,
        "T": 0.5,
        "r": 0.10,
        "sigma": 0.20,
        "q": 0.0,
        "option_type": "call",
        "expected": 4.759422,
    },
    {
        "reference": "Hull, Options, Futures, and Other Derivatives, example 15.6",
        "source_url": HULL_REFERENCE_URL,
        "S": 42.0,
        "K": 40.0,
        "T": 0.5,
        "r": 0.10,
        "sigma": 0.20,
        "q": 0.0,
        "option_type": "put",
        "expected": 0.8085994,
    },
)


def _status(passed: bool) -> str:
    return "pass" if passed else "fail"


def _json_value(value: Any) -> Any:
    """Convert numpy/pandas values recursively to strict JSON values."""
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, np.ndarray):
        return [_json_value(item) for item in value.tolist()]
    if isinstance(value, (np.floating, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    return value


def run_black_scholes_validation(
    reference_tolerance: float = 1e-6,
    parity_tolerance: float = 1e-10,
) -> dict[str, Any]:
    """Validate Black-Scholes prices against Hull and put-call parity."""
    reference_rows: list[dict[str, Any]] = []
    for case in BLACK_SCHOLES_REFERENCE_CASES:
        actual = black_scholes.calculate_option_price(
            S=case["S"],
            K=case["K"],
            T=case["T"],
            r=case["r"],
            sigma=case["sigma"],
            q=case["q"],
            option_type=case["option_type"],
        )
        reference_rows.append(
            {
                **case,
                "actual": float(actual),
                "absolute_error": abs(float(actual) - case["expected"]),
            }
        )

    parity_rows: list[dict[str, Any]] = []
    spot, rate, volatility, dividend_yield = 100.0, 0.03, 0.27, 0.012
    for strike in (60.0, 80.0, 100.0, 120.0, 140.0):
        for maturity in (0.05, 0.25, 0.5, 1.0, 2.0, 5.0):
            call = black_scholes.calculate_option_price(
                spot, strike, maturity, rate, volatility, dividend_yield, "call"
            )
            put = black_scholes.calculate_option_price(
                spot, strike, maturity, rate, volatility, dividend_yield, "put"
            )
            lhs = call - put
            rhs = spot * np.exp(-dividend_yield * maturity) - strike * np.exp(
                -rate * maturity
            )
            parity_rows.append(
                {
                    "strike": strike,
                    "maturity": maturity,
                    "call_minus_put": float(lhs),
                    "discounted_spot_minus_strike": float(rhs),
                    "absolute_error": abs(float(lhs - rhs)),
                }
            )

    max_reference_error = max(row["absolute_error"] for row in reference_rows)
    max_parity_error = max(row["absolute_error"] for row in parity_rows)
    passed = (
        max_reference_error <= reference_tolerance
        and max_parity_error <= parity_tolerance
    )
    return {
        "status": _status(passed),
        "summary": {
            "max_reference_absolute_error": max_reference_error,
            "max_put_call_parity_absolute_error": max_parity_error,
            "reference_tolerance": reference_tolerance,
            "parity_tolerance": parity_tolerance,
            "parity_grid_points": len(parity_rows),
        },
        "reference_cases": reference_rows,
        "put_call_parity_grid": parity_rows,
    }


def run_monte_carlo_validation(
    path_counts: Sequence[int] = (10_000, 100_000, 1_000_000, 10_000_000),
    random_seed: int = 20260817,
    chunk_size: int = 250_000,
    max_z_score: float = 4.0,
    slope_tolerance: float = 0.05,
) -> dict[str, Any]:
    """Price European options from terminal GBM draws at nested path counts.

    Convergence is verified from the Monte Carlo standard error, whose log-log
    slope against N must be -1/2. Absolute pricing error is also required to
    remain within ``max_z_score`` estimated standard errors at every checkpoint.
    """
    counts = sorted({int(count) for count in path_counts})
    if len(counts) < 2 or counts[0] < 2:
        raise ValueError("path_counts must contain at least two integers greater than one")

    S, K, T, r, sigma, q = 100.0, 100.0, 1.0, 0.05, 0.20, 0.0
    discount = math.exp(-r * T)
    drift = (r - q - 0.5 * sigma**2) * T
    diffusion = sigma * math.sqrt(T)
    closed_forms = {
        option_type: float(
            black_scholes.calculate_option_price(
                S, K, T, r, sigma, q, option_type
            )
        )
        for option_type in ("call", "put")
    }

    rng = np.random.default_rng(random_seed)
    sums = {"call": 0.0, "put": 0.0}
    sums_of_squares = {"call": 0.0, "put": 0.0}
    rows: list[dict[str, Any]] = []
    generated = 0

    for target in counts:
        while generated < target:
            take = min(chunk_size, target - generated)
            terminal = S * np.exp(
                drift + diffusion * rng.standard_normal(take)
            )
            payoffs = {
                "call": np.maximum(terminal - K, 0.0),
                "put": np.maximum(K - terminal, 0.0),
            }
            for option_type, payoff in payoffs.items():
                sums[option_type] += float(np.sum(payoff, dtype=np.float64))
                sums_of_squares[option_type] += float(
                    np.sum(payoff * payoff, dtype=np.float64)
                )
            generated += take

        for option_type in ("call", "put"):
            mean_payoff = sums[option_type] / target
            payoff_variance = (
                sums_of_squares[option_type]
                - target * mean_payoff * mean_payoff
            ) / (target - 1)
            standard_error = discount * math.sqrt(
                max(payoff_variance, 0.0) / target
            )
            estimate = discount * mean_payoff
            absolute_error = abs(estimate - closed_forms[option_type])
            rows.append(
                {
                    "option_type": option_type,
                    "paths": target,
                    "monte_carlo_price": estimate,
                    "black_scholes_price": closed_forms[option_type],
                    "absolute_error": absolute_error,
                    "standard_error": standard_error,
                    "absolute_z_score": (
                        absolute_error / standard_error
                        if standard_error > 0.0
                        else None
                    ),
                    "standard_error_times_sqrt_n": standard_error
                    * math.sqrt(target),
                }
            )

    convergence: list[dict[str, Any]] = []
    for option_type in ("call", "put"):
        option_rows = [
            row for row in rows if row["option_type"] == option_type
        ]
        slope = float(
            np.polyfit(
                np.log([row["paths"] for row in option_rows]),
                np.log([row["standard_error"] for row in option_rows]),
                1,
            )[0]
        )
        largest_z = max(
            row["absolute_z_score"] for row in option_rows
            if row["absolute_z_score"] is not None
        )
        option_passed = (
            abs(slope + 0.5) <= slope_tolerance and largest_z <= max_z_score
        )
        convergence.append(
            {
                "option_type": option_type,
                "log_standard_error_vs_log_n_slope": slope,
                "expected_slope": -0.5,
                "slope_tolerance": slope_tolerance,
                "max_absolute_z_score": largest_z,
                "max_z_score_tolerance": max_z_score,
                "status": _status(option_passed),
            }
        )

    passed = all(row["status"] == "pass" for row in convergence)
    return {
        "status": _status(passed),
        "summary": {
            "path_counts": counts,
            "random_seed": random_seed,
            "max_absolute_error": max(row["absolute_error"] for row in rows),
            "max_absolute_z_score": max(
                row["absolute_z_score"] for row in rows
                if row["absolute_z_score"] is not None
            ),
        },
        "prices": rows,
        "convergence": convergence,
    }


def _relative_error(actual: float, reference: float, floor: float = 1e-8) -> float:
    return abs(actual - reference) / max(abs(actual), abs(reference), floor)


def run_greeks_validation() -> dict[str, Any]:
    """Compare analytic Greeks with central finite-difference estimates."""
    tolerances = {
        "delta": 2e-6,
        "gamma": 2e-5,
        "vega": 2e-6,
        "theta": 2e-6,
        "rho": 2e-6,
    }
    rows: list[dict[str, Any]] = []
    S, r, sigma, q = 100.0, 0.04, 0.25, 0.015

    for K in (80.0, 100.0, 120.0):
        for T in (0.25, 1.0, 2.0):
            for option_type in ("call", "put"):
                price: Callable[..., float] = lambda **changes: float(
                    black_scholes.calculate_option_price(
                        changes.get("S", S),
                        K,
                        changes.get("T", T),
                        changes.get("r", r),
                        changes.get("sigma", sigma),
                        q,
                        option_type,
                    )
                )
                h_delta = S * 1e-4
                h_gamma = S * 5e-4
                h_sigma = 1e-5
                h_t = min(1e-5, T / 10.0)
                h_r = 1e-5
                finite_differences = {
                    "delta": (price(S=S + h_delta) - price(S=S - h_delta))
                    / (2.0 * h_delta),
                    "gamma": (
                        price(S=S + h_gamma)
                        - 2.0 * price()
                        + price(S=S - h_gamma)
                    )
                    / (h_gamma * h_gamma),
                    "vega": (
                        price(sigma=sigma + h_sigma)
                        - price(sigma=sigma - h_sigma)
                    )
                    / (2.0 * h_sigma),
                    # Theta is the derivative with respect to elapsed calendar time.
                    "theta": (price(T=T - h_t) - price(T=T + h_t))
                    / (2.0 * h_t),
                    "rho": (price(r=r + h_r) - price(r=r - h_r))
                    / (2.0 * h_r),
                }
                analytic = {
                    "delta": float(
                        black_scholes.calculate_delta(
                            S, K, T, r, sigma, q, option_type
                        )
                    ),
                    "gamma": float(
                        black_scholes.calculate_gamma(
                            S, K, T, r, sigma, q, option_type
                        )
                    ),
                    "vega": float(
                        black_scholes.calculate_vega(
                            S, K, T, r, sigma, q, option_type
                        )
                    ),
                    "theta": float(
                        black_scholes.calculate_theta(
                            S, K, T, r, sigma, q, option_type
                        )
                    ),
                    "rho": float(
                        black_scholes.calculate_rho(
                            S, K, T, r, sigma, q, option_type
                        )
                    ),
                }
                for greek in tolerances:
                    rows.append(
                        {
                            "greek": greek,
                            "option_type": option_type,
                            "strike": K,
                            "maturity": T,
                            "analytic": analytic[greek],
                            "finite_difference": finite_differences[greek],
                            "relative_error": _relative_error(
                                analytic[greek], finite_differences[greek]
                            ),
                        }
                    )

    summary_rows: list[dict[str, Any]] = []
    for greek, tolerance in tolerances.items():
        max_error = max(
            row["relative_error"] for row in rows if row["greek"] == greek
        )
        summary_rows.append(
            {
                "greek": greek,
                "max_relative_error": max_error,
                "tolerance": tolerance,
                "status": _status(max_error <= tolerance),
            }
        )
    passed = all(row["status"] == "pass" for row in summary_rows)
    return {
        "status": _status(passed),
        "summary": summary_rows,
        "grid_points_per_greek": len(rows) // len(tolerances),
        "comparisons": rows,
    }


def kupiec_pof_test(breaches: Iterable[bool], expected_probability: float) -> dict[str, Any]:
    """Kupiec likelihood-ratio test for unconditional breach coverage."""
    values = np.asarray(list(breaches), dtype=bool)
    n_observations = int(values.size)
    if n_observations == 0:
        raise ValueError("Kupiec test requires at least one observation")
    n_breaches = int(values.sum())
    observed_probability = n_breaches / n_observations
    null_ll = float(
        xlogy(n_breaches, expected_probability)
        + xlogy(n_observations - n_breaches, 1.0 - expected_probability)
    )
    fitted_ll = float(
        xlogy(n_breaches, observed_probability)
        + xlogy(n_observations - n_breaches, 1.0 - observed_probability)
    )
    statistic = max(0.0, -2.0 * (null_ll - fitted_ll))
    return {
        "statistic": statistic,
        "p_value": float(chi2.sf(statistic, df=1)),
        "observations": n_observations,
        "breaches": n_breaches,
        "expected_breaches": n_observations * expected_probability,
        "observed_breach_rate": observed_probability,
        "expected_breach_rate": expected_probability,
    }


def christoffersen_independence_test(breaches: Iterable[bool]) -> dict[str, Any]:
    """Christoffersen likelihood-ratio test for first-order independence."""
    values = np.asarray(list(breaches), dtype=np.int8)
    if values.size < 2:
        raise ValueError("Christoffersen test requires at least two observations")
    previous, current = values[:-1], values[1:]
    n00 = int(np.sum((previous == 0) & (current == 0)))
    n01 = int(np.sum((previous == 0) & (current == 1)))
    n10 = int(np.sum((previous == 1) & (current == 0)))
    n11 = int(np.sum((previous == 1) & (current == 1)))

    transitions = n00 + n01 + n10 + n11
    pi = (n01 + n11) / transitions
    pi01 = n01 / (n00 + n01) if n00 + n01 else 0.0
    pi11 = n11 / (n10 + n11) if n10 + n11 else 0.0
    null_ll = float(
        xlogy(n00 + n10, 1.0 - pi) + xlogy(n01 + n11, pi)
    )
    alternative_ll = float(
        xlogy(n00, 1.0 - pi01)
        + xlogy(n01, pi01)
        + xlogy(n10, 1.0 - pi11)
        + xlogy(n11, pi11)
    )
    statistic = max(0.0, -2.0 * (null_ll - alternative_ll))
    return {
        "statistic": statistic,
        "p_value": float(chi2.sf(statistic, df=1)),
        "transitions": {"n00": n00, "n01": n01, "n10": n10, "n11": n11},
        "p_breach_after_no_breach": pi01,
        "p_breach_after_breach": pi11,
    }


def _load_default_historical_returns(
    repository_root: Path,
    ticker: str,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    files = [
        repository_root / "data" / "exports" / "ml_benchmark" / "regression_validation_predictions.csv",
        repository_root / "data" / "exports" / "ml_benchmark" / "regression_test_predictions.csv",
    ]
    frames = [pd.read_csv(path) for path in files]
    frame = pd.concat(frames, ignore_index=True)
    frame = frame[
        (frame["ticker"] == ticker) & (frame["model"] == "linear_regression")
    ][["Date", "y_true"]]
    frame = frame.rename(columns={"y_true": "return"})
    frame["Date"] = pd.to_datetime(frame["Date"])
    frame = frame.drop_duplicates("Date").sort_values("Date").reset_index(drop=True)
    return frame, {
        "kind": "repository historical out-of-sample return labels",
        "ticker": ticker,
        "upstream_provider": "yfinance",
        "source_files": [str(path.relative_to(repository_root)) for path in files],
    }


def _load_returns_csv(path: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    frame = pd.read_csv(path)
    return_column = next(
        (column for column in ("return", "returns", "y_true") if column in frame),
        None,
    )
    if return_column is None:
        raise ValueError("returns CSV must contain return, returns, or y_true")
    date_column = next(
        (column for column in ("Date", "date", "timestamp") if column in frame),
        None,
    )
    result = pd.DataFrame({"return": pd.to_numeric(frame[return_column])})
    result["Date"] = (
        pd.to_datetime(frame[date_column])
        if date_column is not None
        else pd.RangeIndex(len(frame))
    )
    result = result.dropna(subset=["return"]).reset_index(drop=True)
    return result[["Date", "return"]], {
        "kind": "user-supplied historical returns",
        "source_file": str(path),
    }


def run_var_cvar_validation(
    returns_csv: str | Path | None = None,
    repository_root: str | Path = REPOSITORY_ROOT,
    ticker: str = "AAPL",
    rolling_window: int = 252,
    confidence_levels: Sequence[float] = (0.95, 0.99),
    rejection_threshold: float = 0.01,
) -> dict[str, Any]:
    """Backtest rolling historical VaR/CVaR forecasts."""
    root = Path(repository_root)
    if returns_csv is None:
        frame, source = _load_default_historical_returns(root, ticker)
    else:
        frame, source = _load_returns_csv(Path(returns_csv))
    if len(frame) <= rolling_window:
        raise ValueError(
            f"need more than {rolling_window} historical returns, got {len(frame)}"
        )

    returns = frame["return"].to_numpy(dtype=float)
    dates = frame["Date"].to_numpy()
    results: list[dict[str, Any]] = []
    for confidence in confidence_levels:
        alpha = 1.0 - confidence
        breaches: list[bool] = []
        forecasts: list[dict[str, Any]] = []
        for index in range(rolling_window, len(returns)):
            history = returns[index - rolling_window : index]
            return_quantile = float(np.quantile(history, alpha))
            tail = history[history <= return_quantile]
            var_forecast = max(0.0, -return_quantile)
            cvar_forecast = max(0.0, -float(np.mean(tail)))
            breach = bool(returns[index] < -var_forecast)
            breaches.append(breach)
            forecasts.append(
                {
                    "date": pd.Timestamp(dates[index]).isoformat(),
                    "return": returns[index],
                    "var": var_forecast,
                    "cvar": cvar_forecast,
                    "breach": breach,
                }
            )

        kupiec = kupiec_pof_test(breaches, alpha)
        christoffersen = christoffersen_independence_test(breaches)
        breached_forecasts = [row for row in forecasts if row["breach"]]
        mean_realized_breach_loss = (
            float(np.mean([-row["return"] for row in breached_forecasts]))
            if breached_forecasts
            else None
        )
        mean_cvar_on_breaches = (
            float(np.mean([row["cvar"] for row in breached_forecasts]))
            if breached_forecasts
            else None
        )
        passed = (
            kupiec["p_value"] >= rejection_threshold
            and christoffersen["p_value"] >= rejection_threshold
            and all(row["cvar"] + 1e-15 >= row["var"] for row in forecasts)
        )
        results.append(
            {
                "confidence_level": confidence,
                "observations": len(forecasts),
                "date_start": forecasts[0]["date"],
                "date_end": forecasts[-1]["date"],
                "observed_breach_rate": kupiec["observed_breach_rate"],
                "expected_breach_rate": alpha,
                "observed_breaches": kupiec["breaches"],
                "expected_breaches": kupiec["expected_breaches"],
                "kupiec_pof": kupiec,
                "christoffersen_independence": christoffersen,
                "mean_realized_breach_loss": mean_realized_breach_loss,
                "mean_cvar_forecast_on_breaches": mean_cvar_on_breaches,
                "status": _status(passed),
            }
        )

    return {
        "status": _status(all(row["status"] == "pass" for row in results)),
        "summary": results,
        "configuration": {
            "rolling_window": rolling_window,
            "rejection_threshold": rejection_threshold,
            "return_rows": len(frame),
        },
        "data_source": source,
    }


def run_markowitz_validation(
    weight_tolerance: float = 1e-8,
    reference_tolerance: float = 5e-4,
    convexity_tolerance: float = 2e-6,
) -> dict[str, Any]:
    """Validate portfolio constraints, frontier convexity, and a SciPy oracle."""
    names = ["ALPHA", "BETA", "GAMMA", "DELTA"]
    expected_returns = pd.Series(
        [0.07, 0.10, 0.135, 0.17], index=names, dtype=float
    )
    covariance = pd.DataFrame(
        [
            [0.028, 0.006, 0.004, 0.002],
            [0.006, 0.042, 0.009, 0.006],
            [0.004, 0.009, 0.065, 0.012],
            [0.002, 0.006, 0.012, 0.095],
        ],
        index=names,
        columns=names,
        dtype=float,
    )
    engine = portfolio_optimization.minimum_variance_portfolio(
        expected_returns, covariance
    )
    max_sharpe = portfolio_optimization.maximum_sharpe_portfolio(
        expected_returns, covariance, risk_free_rate=0.03
    )
    frontier = portfolio_optimization.calculate_efficient_frontier(
        expected_returns, covariance, n_portfolios=41
    ).sort_values("target_return")

    n_assets = len(names)
    initial = np.full(n_assets, 1.0 / n_assets)
    cov_values = covariance.to_numpy()
    reference = minimize(
        fun=lambda weights: float(weights @ cov_values @ weights),
        jac=lambda weights: 2.0 * cov_values @ weights,
        x0=initial,
        method="SLSQP",
        bounds=[(0.0, 1.0)] * n_assets,
        constraints={"type": "eq", "fun": lambda weights: weights.sum() - 1.0},
        options={"ftol": 1e-14, "maxiter": 2_000},
    )

    engine_weights = engine["weights"].to_numpy()
    reference_difference = float(np.max(np.abs(engine_weights - reference.x)))
    portfolio_weight_errors = {
        "minimum_variance": abs(float(engine_weights.sum()) - 1.0),
        "maximum_sharpe": abs(float(max_sharpe["weights"].sum()) - 1.0),
        "frontier_max": max(
            abs(float(np.sum(weights)) - 1.0) for weights in frontier["weights"]
        ),
    }
    max_weight_error = max(portfolio_weight_errors.values())

    targets = frontier["target_return"].to_numpy()
    variances = np.square(frontier["volatility"].to_numpy())
    slopes = np.diff(variances) / np.diff(targets)
    slope_changes = np.diff(slopes)
    minimum_slope_change = float(np.min(slope_changes))
    convexity_violation = max(0.0, -minimum_slope_change)
    passed = (
        bool(engine["success"])
        and bool(max_sharpe["success"])
        and bool(reference.success)
        and max_weight_error <= weight_tolerance
        and reference_difference <= reference_tolerance
        and convexity_violation <= convexity_tolerance
    )
    return {
        "status": _status(passed),
        "summary": {
            "max_weight_sum_absolute_error": max_weight_error,
            "weight_sum_tolerance": weight_tolerance,
            "max_weight_difference_vs_scipy_reference": reference_difference,
            "reference_tolerance": reference_tolerance,
            "frontier_convexity_violation": convexity_violation,
            "convexity_tolerance": convexity_tolerance,
            "frontier_points": len(frontier),
        },
        "weight_sum_errors": portfolio_weight_errors,
        "minimum_variance_weights": dict(engine["weights"]),
        "scipy_reference_weights": dict(zip(names, reference.x)),
        "frontier_minimum_slope_change": minimum_slope_change,
    }


def run_ml_signal_validation(
    predictions_csv: str | Path | None = None,
    repository_root: str | Path = REPOSITORY_ROOT,
    model: str = "gradient_boosting",
    shuffle_repeats: int = 200,
    shuffle_tolerance: float = 0.03,
    random_seed: int = 20260817,
) -> dict[str, Any]:
    """Report walk-forward fold AUC and a shuffled-label negative control."""
    path = (
        Path(predictions_csv)
        if predictions_csv is not None
        else Path(repository_root) / "data" / "exports" / "ml_benchmark" / "classification_validation_predictions.csv"
    )
    frame = pd.read_csv(path)
    probability_column = (
        "y_probability" if "y_probability" in frame else "y_pred_proba"
    )
    required = {"fold", "y_true", probability_column}
    if not required.issubset(frame.columns):
        raise ValueError(f"prediction file is missing {sorted(required - set(frame))}")
    if "model" in frame:
        frame = frame[frame["model"] == model]
    if frame.empty:
        raise ValueError(f"no predictions found for model {model!r}")

    rng = np.random.default_rng(random_seed)
    folds: list[dict[str, Any]] = []
    for fold, group in frame.groupby("fold", sort=True):
        y_true = group["y_true"].to_numpy(dtype=int)
        probabilities = group[probability_column].to_numpy(dtype=float)
        if np.unique(y_true).size < 2:
            folds.append(
                {
                    "fold": int(fold),
                    "samples": len(group),
                    "status": "not_evaluable",
                    "reason": "fold contains one target class",
                }
            )
            continue
        observed_auc = float(roc_auc_score(y_true, probabilities))
        shuffled_aucs = np.asarray(
            [
                roc_auc_score(rng.permutation(y_true), probabilities)
                for _ in range(shuffle_repeats)
            ],
            dtype=float,
        )
        shuffled_mean = float(shuffled_aucs.mean())
        deviation = abs(shuffled_mean - 0.5)
        folds.append(
            {
                "fold": int(fold),
                "samples": len(group),
                "date_start": str(group["Date"].min()) if "Date" in group else None,
                "date_end": str(group["Date"].max()) if "Date" in group else None,
                "roc_auc": observed_auc,
                "shuffled_label_auc_mean": shuffled_mean,
                "shuffled_label_auc_std": float(shuffled_aucs.std(ddof=1)),
                "shuffled_auc_absolute_deviation_from_half": deviation,
                "status": _status(deviation <= shuffle_tolerance),
            }
        )

    evaluable = [row for row in folds if row["status"] != "not_evaluable"]
    passed = bool(evaluable) and all(row["status"] == "pass" for row in evaluable)
    return {
        "status": _status(passed),
        "summary": {
            "model": model,
            "folds": len(folds),
            "evaluable_folds": len(evaluable),
            "mean_walk_forward_roc_auc": float(
                np.mean([row["roc_auc"] for row in evaluable])
            ),
            "max_shuffled_auc_deviation_from_half": max(
                row["shuffled_auc_absolute_deviation_from_half"]
                for row in evaluable
            ),
            "shuffle_tolerance": shuffle_tolerance,
            "shuffle_repeats_per_fold": shuffle_repeats,
        },
        "folds": folds,
        "data_source": str(path),
        "negative_control": (
            "Validation labels are independently permuted within each walk-forward "
            "fold while predictions remain fixed; mean AUC must collapse to 0.5."
        ),
    }


def run_rag_validation(
    question_set: str | Path | None = None,
    repository_root: str | Path = REPOSITORY_ROOT,
    ks: Sequence[int] = (1, 3, 5),
) -> dict[str, Any]:
    """Evaluate hybrid retrieval hit-rate@k on a hand-labeled corpus."""
    path = (
        Path(question_set)
        if question_set is not None
        else Path(repository_root) / "data" / "validation" / "rag_questions.json"
    )
    fixture = json.loads(path.read_text(encoding="utf-8"))
    chunks = fixture["chunks"]
    questions = fixture["questions"]
    counts = sorted({int(k) for k in ks})
    max_k = max(counts)
    hits = {k: 0 for k in counts}
    rows: list[dict[str, Any]] = []

    for question in questions:
        retrieved = hybrid_retrieve(
            question["query"],
            chunks,
            vector_store=None,
            top_k=max_k,
            semantic_weight=0.0,
            keyword_weight=1.0,
        )
        retrieved_ids = [row["chunk_id"] for row in retrieved]
        relevant = set(question["relevant_chunk_ids"])
        relevant_ranks = [
            index + 1
            for index, chunk_id in enumerate(retrieved_ids)
            if chunk_id in relevant
        ]
        first_rank = min(relevant_ranks) if relevant_ranks else None
        question_hits = {}
        for k in counts:
            hit = first_rank is not None and first_rank <= k
            hits[k] += int(hit)
            question_hits[str(k)] = hit
        rows.append(
            {
                "question_id": question["question_id"],
                "query": question["query"],
                "relevant_chunk_ids": sorted(relevant),
                "retrieved_chunk_ids": retrieved_ids,
                "first_relevant_rank": first_rank,
                "hit_at_k": question_hits,
            }
        )

    hit_rates = {str(k): hits[k] / len(questions) for k in counts}
    thresholds = {
        str(k): (0.75 if k == 1 else 0.90 if k <= 3 else 1.0)
        for k in counts
    }
    passed = all(hit_rates[str(k)] >= thresholds[str(k)] for k in counts)
    return {
        "status": _status(passed),
        "summary": {
            "questions": len(questions),
            "hit_rate_at_k": hit_rates,
            "threshold_at_k": thresholds,
        },
        "questions": rows,
        "data_source": str(path),
        "retrieval_mode": "BM25 keyword component of hybrid_retrieve",
    }


def _run_safely(function: Callable[..., dict[str, Any]], **kwargs: Any) -> dict[str, Any]:
    try:
        return function(**kwargs)
    except Exception as exc:  # A report is more useful than an aborted suite.
        return {
            "status": "error",
            "error_type": type(exc).__name__,
            "error": str(exc),
        }


def run_validation_suite(
    *,
    repository_root: str | Path = REPOSITORY_ROOT,
    returns_csv: str | Path | None = None,
    ml_predictions_csv: str | Path | None = None,
    rag_question_set: str | Path | None = None,
    mc_path_counts: Sequence[int] = (10_000, 100_000, 1_000_000, 10_000_000),
) -> dict[str, Any]:
    """Run every validation and return a strict JSON-compatible report."""
    root = Path(repository_root).resolve()
    sections = {
        "black_scholes": _run_safely(run_black_scholes_validation),
        "monte_carlo": _run_safely(
            run_monte_carlo_validation, path_counts=mc_path_counts
        ),
        "greeks": _run_safely(run_greeks_validation),
        "var_cvar": _run_safely(
            run_var_cvar_validation,
            returns_csv=returns_csv,
            repository_root=root,
        ),
        "markowitz": _run_safely(run_markowitz_validation),
        "ml_signal": _run_safely(
            run_ml_signal_validation,
            predictions_csv=ml_predictions_csv,
            repository_root=root,
        ),
        "rag": _run_safely(
            run_rag_validation,
            question_set=rag_question_set,
            repository_root=root,
        ),
    }
    passed = all(section["status"] == "pass" for section in sections.values())
    report = {
        "schema_version": "1.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "overall_status": _status(passed),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
        },
        "sections": sections,
    }
    return _json_value(report)


def _format_number(value: Any) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, (float, np.floating)):
        if value == 0.0:
            return "0"
        if abs(value) < 1e-3 or abs(value) >= 1e4:
            return f"{value:.4e}"
        return f"{value:.6f}"
    return str(value)


def _markdown_table(headers: Sequence[str], rows: Sequence[Sequence[Any]]) -> list[str]:
    rendered = [f"| {' | '.join(headers)} |", f"| {' | '.join(['---'] * len(headers))} |"]
    for row in rows:
        values = [str(_format_number(value)).replace("|", "\\|") for value in row]
        rendered.append(f"| {' | '.join(values)} |")
    return rendered


def render_markdown_report(report: dict[str, Any]) -> str:
    """Render the JSON report as compact human-readable Markdown tables."""
    sections = report["sections"]
    lines = [
        "# FinSight validation report",
        "",
        f"Overall status: **{report['overall_status'].upper()}**  ",
        f"Generated: `{report['generated_at_utc']}`",
        "",
        "## Summary",
        "",
    ]
    summary_rows = []
    for name, section in sections.items():
        summary_rows.append((name, section["status"], section.get("error", "")))
    lines.extend(_markdown_table(("Layer", "Status", "Error"), summary_rows))

    bs = sections.get("black_scholes", {})
    if "summary" in bs:
        lines.extend(["", "## Black-Scholes", ""])
        lines.extend(
            _markdown_table(
                ("Metric", "Value", "Tolerance"),
                (
                    (
                        "Published-reference max absolute error",
                        bs["summary"]["max_reference_absolute_error"],
                        bs["summary"]["reference_tolerance"],
                    ),
                    (
                        "Put-call parity max absolute error",
                        bs["summary"]["max_put_call_parity_absolute_error"],
                        bs["summary"]["parity_tolerance"],
                    ),
                ),
            )
        )

    mc = sections.get("monte_carlo", {})
    if "prices" in mc:
        lines.extend(["", "## Monte Carlo", ""])
        lines.extend(
            _markdown_table(
                ("Option", "Paths", "MC price", "BS price", "Abs. error", "Std. error", "Abs. z-score"),
                [
                    (
                        row["option_type"],
                        row["paths"],
                        row["monte_carlo_price"],
                        row["black_scholes_price"],
                        row["absolute_error"],
                        row["standard_error"],
                        row["absolute_z_score"],
                    )
                    for row in mc["prices"]
                ],
            )
        )
        lines.extend(["", "Convergence diagnostic:", ""])
        lines.extend(
            _markdown_table(
                ("Option", "log(SE) / log(N) slope", "Expected", "Status"),
                [
                    (
                        row["option_type"],
                        row["log_standard_error_vs_log_n_slope"],
                        row["expected_slope"],
                        row["status"],
                    )
                    for row in mc["convergence"]
                ],
            )
        )

    greeks = sections.get("greeks", {})
    if isinstance(greeks.get("summary"), list):
        lines.extend(["", "## Greeks", ""])
        lines.extend(
            _markdown_table(
                ("Greek", "Max relative error", "Tolerance", "Status"),
                [
                    (row["greek"], row["max_relative_error"], row["tolerance"], row["status"])
                    for row in greeks["summary"]
                ],
            )
        )

    var = sections.get("var_cvar", {})
    if isinstance(var.get("summary"), list):
        lines.extend(["", "## VaR / CVaR backtest", ""])
        lines.extend(
            _markdown_table(
                (
                    "Confidence",
                    "Observed breaches",
                    "Expected breaches",
                    "Observed rate",
                    "Expected rate",
                    "Kupiec p",
                    "Christoffersen p",
                    "Status",
                ),
                [
                    (
                        row["confidence_level"],
                        row["observed_breaches"],
                        row["expected_breaches"],
                        row["observed_breach_rate"],
                        row["expected_breach_rate"],
                        row["kupiec_pof"]["p_value"],
                        row["christoffersen_independence"]["p_value"],
                        row["status"],
                    )
                    for row in var["summary"]
                ],
            )
        )

    markowitz = sections.get("markowitz", {})
    if "summary" in markowitz:
        lines.extend(["", "## Markowitz", ""])
        lines.extend(
            _markdown_table(
                ("Metric", "Value", "Tolerance"),
                (
                    (
                        "Max |sum(weights) - 1|",
                        markowitz["summary"]["max_weight_sum_absolute_error"],
                        markowitz["summary"]["weight_sum_tolerance"],
                    ),
                    (
                        "Max weight difference vs SciPy reference",
                        markowitz["summary"]["max_weight_difference_vs_scipy_reference"],
                        markowitz["summary"]["reference_tolerance"],
                    ),
                    (
                        "Frontier convexity violation",
                        markowitz["summary"]["frontier_convexity_violation"],
                        markowitz["summary"]["convexity_tolerance"],
                    ),
                ),
            )
        )

    ml = sections.get("ml_signal", {})
    if "folds" in ml:
        lines.extend(["", "## ML signal walk-forward", ""])
        lines.extend(
            _markdown_table(
                ("Fold", "Samples", "ROC-AUC", "Shuffled AUC", "Shuffle deviation", "Status"),
                [
                    (
                        row["fold"],
                        row["samples"],
                        row.get("roc_auc"),
                        row.get("shuffled_label_auc_mean"),
                        row.get("shuffled_auc_absolute_deviation_from_half"),
                        row["status"],
                    )
                    for row in ml["folds"]
                ],
            )
        )

    rag = sections.get("rag", {})
    if "summary" in rag:
        lines.extend(["", "## RAG retrieval", ""])
        lines.extend(
            _markdown_table(
                ("k", "Hit rate", "Threshold", "Status"),
                [
                    (
                        k,
                        rate,
                        rag["summary"]["threshold_at_k"][k],
                        _status(rate >= rag["summary"]["threshold_at_k"][k]),
                    )
                    for k, rate in rag["summary"]["hit_rate_at_k"].items()
                ],
            )
        )

    lines.append("")
    return "\n".join(lines)


def write_validation_reports(
    report: dict[str, Any],
    output_directory: str | Path,
) -> tuple[Path, Path]:
    """Write the report as JSON and Markdown and return both paths."""
    directory = Path(output_directory)
    directory.mkdir(parents=True, exist_ok=True)
    json_path = directory / "validation_report.json"
    markdown_path = directory / "validation_report.md"
    json_path.write_text(
        json.dumps(_json_value(report), indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    markdown_path.write_text(render_markdown_report(report), encoding="utf-8")
    return json_path, markdown_path
