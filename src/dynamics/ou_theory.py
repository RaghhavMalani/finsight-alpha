"""Exact-transition Ornstein-Uhlenbeck theory adapter for Dynamics D0.1."""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Sequence

import numpy as np
from scipy.optimize import minimize
from scipy.stats import jarque_bera

from src.dynamics.contracts import (
    BaselineScore,
    CheckStatus,
    FalsificationCheck,
    FalsificationReport,
    ForecastDistribution,
    ForecastHorizon,
    ForecastPoint,
    HypothesisLedger,
    MarketTheory,
    ScientificVerdict,
    SealedHoldout,
    TheoryArtifact,
    TheoryComparison,
    TheoryEvidence,
    TheoryFit,
    TheoryScore,
    TheoryWorld,
    TimeWindow,
)
from src.dynamics.world import TheoryWorldError, elapsed_in_unit, make_theory_world


class OUTheoryError(ValueError):
    """Raised when an OU experiment cannot be evaluated."""


_Z_90 = 1.6448536269514722
_ALPHA_90 = 0.10


def _window(world: TheoryWorld, start: int, end: int) -> TimeWindow:
    if start < 0 or end > len(world.values) or end - start < 2:
        raise OUTheoryError("theory windows require at least two observations")
    return TimeWindow(
        start=world.observed_at[start],
        end=world.observed_at[end - 1],
        start_index=start,
        end_index=end,
        observations=end - start,
        elapsed_time=elapsed_in_unit(
            world.observed_at[start], world.observed_at[end - 1], world.time_unit
        ),
        time_unit=world.time_unit,
    )


def _transition_arrays(
    world: TheoryWorld, window: TimeWindow
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    values = np.asarray(
        world.values[window.start_index : window.end_index], dtype=float
    )
    timestamps = world.observed_at[window.start_index : window.end_index]
    delta_times = np.asarray(
        [
            elapsed_in_unit(left, right, world.time_unit)
            for left, right in zip(timestamps, timestamps[1:])
        ],
        dtype=float,
    )
    if np.any(delta_times <= 0) or not np.all(np.isfinite(delta_times)):
        raise OUTheoryError("every transition must have a positive finite delta time")
    return values[:-1], values[1:], delta_times


def _ou_distribution(
    theta: float,
    mu: float,
    sigma: float,
    origin: np.ndarray,
    delta_times: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    decay = np.exp(-theta * delta_times)
    means = mu + (origin - mu) * decay
    if abs(theta) < 1e-8:
        variances = sigma * sigma * delta_times
    else:
        variances = (sigma * sigma / (2.0 * theta)) * (
            1.0 - np.exp(-2.0 * theta * delta_times)
        )
    return means, np.maximum(variances, np.finfo(float).eps)


def _negative_log_likelihood(
    transformed: np.ndarray,
    origin: np.ndarray,
    target: np.ndarray,
    delta_times: np.ndarray,
) -> float:
    theta, mu, log_sigma = transformed
    sigma = math.exp(float(log_sigma))
    means, variances = _ou_distribution(theta, float(mu), sigma, origin, delta_times)
    errors = target - means
    value = 0.5 * np.sum(
        np.log(2.0 * math.pi * variances) + np.square(errors) / variances
    )
    return float(value) if math.isfinite(float(value)) else 1e100


def _numerical_hessian(function, point: np.ndarray) -> np.ndarray:
    size = len(point)
    hessian = np.zeros((size, size), dtype=float)
    steps = 1e-4 * (1.0 + np.abs(point))
    center = float(function(point))
    for row in range(size):
        plus = point.copy()
        minus = point.copy()
        plus[row] += steps[row]
        minus[row] -= steps[row]
        hessian[row, row] = (
            float(function(plus)) - 2.0 * center + float(function(minus))
        ) / (steps[row] * steps[row])
        for column in range(row + 1, size):
            pp = point.copy()
            pm = point.copy()
            mp = point.copy()
            mm = point.copy()
            pp[row] += steps[row]
            pp[column] += steps[column]
            pm[row] += steps[row]
            pm[column] -= steps[column]
            mp[row] -= steps[row]
            mp[column] += steps[column]
            mm[row] -= steps[row]
            mm[column] -= steps[column]
            value = (
                float(function(pp))
                - float(function(pm))
                - float(function(mp))
                + float(function(mm))
            ) / (4.0 * steps[row] * steps[column])
            hessian[row, column] = value
            hessian[column, row] = value
    return hessian


def _uncertainty(
    objective,
    optimum: np.ndarray,
    theta: float,
    mu: float,
    sigma: float,
) -> tuple[dict[str, dict[str, float | None]], bool]:
    try:
        hessian = _numerical_hessian(objective, optimum)
        if (
            not np.all(np.isfinite(hessian))
            or np.linalg.cond(hessian) > 1e12
            or np.min(np.linalg.eigvalsh(hessian)) <= 0
        ):
            raise np.linalg.LinAlgError("ill-conditioned observed information")
        covariance = np.linalg.inv(hessian)
        standard_errors = np.sqrt(np.maximum(np.diag(covariance), 0.0))
        theta_se = float(standard_errors[0])
        mu_se = float(standard_errors[1])
        sigma_se = sigma * float(standard_errors[2])
        half_life = math.log(2.0) / theta if theta > 0 else None
        half_life_se = (
            math.log(2.0) * theta_se / (theta * theta) if theta > 0 else None
        )
        values = (
            ("theta", theta, theta_se),
            ("mu", mu, mu_se),
            ("sigma", sigma, sigma_se),
            ("half_life", half_life, half_life_se),
        )
        return (
            {
                name: {
                    "estimate": estimate,
                    "standard_error": standard_error,
                    "ci_low": (
                        estimate - 1.96 * standard_error
                        if estimate is not None and standard_error is not None
                        else None
                    ),
                    "ci_high": (
                        estimate + 1.96 * standard_error
                        if estimate is not None and standard_error is not None
                        else None
                    ),
                }
                for name, estimate, standard_error in values
            },
            True,
        )
    except (ValueError, np.linalg.LinAlgError, FloatingPointError):
        return (
            {
                name: {
                    "estimate": estimate,
                    "standard_error": None,
                    "ci_low": None,
                    "ci_high": None,
                }
                for name, estimate in (
                    ("theta", theta),
                    ("mu", mu),
                    ("sigma", sigma),
                    ("half_life", math.log(2.0) / theta if theta > 0 else None),
                )
            },
            False,
        )


def _score_distribution(
    forecast: ForecastDistribution, sealed_holdout: SealedHoldout
) -> TheoryScore:
    actual = np.asarray(sealed_holdout.values, dtype=float)
    means = np.asarray([point.mean for point in forecast.points], dtype=float)
    variances = np.asarray([point.variance for point in forecast.points], dtype=float)
    lower = np.asarray([point.lower_90 for point in forecast.points], dtype=float)
    upper = np.asarray([point.upper_90 for point in forecast.points], dtype=float)
    if len(actual) != len(means):
        raise OUTheoryError("forecast and sealed holdout lengths do not match")
    errors = actual - means
    nll = float(
        np.mean(
            0.5 * np.log(2.0 * math.pi * variances)
            + np.square(errors) / (2.0 * variances)
        )
    )
    misses_below = np.maximum(lower - actual, 0.0)
    misses_above = np.maximum(actual - upper, 0.0)
    interval_score = float(
        np.mean(
            upper
            - lower
            + (2.0 / _ALPHA_90) * misses_below
            + (2.0 / _ALPHA_90) * misses_above
        )
    )
    return TheoryScore(
        negative_log_likelihood=nll,
        log_likelihood=-nll,
        rmse=float(np.sqrt(np.mean(np.square(errors)))),
        mae=float(np.mean(np.abs(errors))),
        coverage_90=float(np.mean((actual >= lower) & (actual <= upper))),
        interval_score_90=interval_score,
        observations=len(actual),
    )


def _forecast_from_arrays(
    name: str,
    means: np.ndarray,
    variances: np.ndarray,
    horizon: ForecastHorizon,
) -> ForecastDistribution:
    standard_deviation = np.sqrt(np.maximum(variances, np.finfo(float).eps))
    return ForecastDistribution(
        target=f"one-step conditional distribution ({name})",
        points=tuple(
            ForecastPoint(
                target_time=timestamp,
                delta_time=float(delta_time),
                mean=float(mean),
                variance=float(variance),
                lower_90=float(mean - _Z_90 * deviation),
                upper_90=float(mean + _Z_90 * deviation),
            )
            for timestamp, delta_time, mean, variance, deviation in zip(
                horizon.target_times,
                horizon.delta_times,
                means,
                variances,
                standard_deviation,
            )
        ),
    )


class OUTheory(MarketTheory):
    name = "ornstein_uhlenbeck"
    equation = "dX_t = theta(mu - X_t)dt + sigma dW_t"

    def fit(self, world: TheoryWorld, train_window: TimeWindow) -> TheoryFit:
        origin, target, delta_times = _transition_arrays(world, train_window)
        standard_deviation = max(float(np.std(target, ddof=1)), 1e-4)
        covariance = float(np.cov(origin, target, ddof=1)[0, 1])
        variance = max(float(np.var(origin, ddof=1)), np.finfo(float).eps)
        phi = min(max(covariance / variance, 1e-5), 5.0)
        median_dt = float(np.median(delta_times))
        theta_start = min(max(-math.log(phi) / median_dt, -1.0), 1.0)
        mu_start = float(np.mean(target))
        sigma_start = max(
            float(np.std(np.diff(np.concatenate([origin[:1], target])), ddof=1))
            / math.sqrt(median_dt),
            1e-4,
        )
        objective = lambda parameters: _negative_log_likelihood(
            parameters, origin, target, delta_times
        )
        result = minimize(
            objective,
            np.asarray([theta_start, mu_start, math.log(sigma_start)]),
            method="L-BFGS-B",
            bounds=[
                (-5.0, 5.0),
                (mu_start - 12.0 * standard_deviation, mu_start + 12.0 * standard_deviation),
                (-12.0, 5.0),
            ],
            options={"maxiter": 2_000, "ftol": 1e-12},
        )
        theta = float(result.x[0])
        mu = float(result.x[1])
        sigma = math.exp(float(result.x[2]))
        means, variances = _ou_distribution(theta, mu, sigma, origin, delta_times)
        standardized = (target - means) / np.sqrt(variances)
        lag_one = (
            float(np.corrcoef(standardized[:-1], standardized[1:])[0, 1])
            if len(standardized) > 3 and np.std(standardized) > 0
            else 0.0
        )
        normality = jarque_bera(standardized)
        uncertainty, covariance_available = _uncertainty(
            objective, np.asarray(result.x, dtype=float), theta, mu, sigma
        )
        half_life = math.log(2.0) / theta if theta > 0 else None
        theta_low = uncertainty["theta"]["ci_low"]
        identifiable = bool(
            result.success
            and covariance_available
            and theta_low is not None
            and theta_low > 0
            and half_life is not None
            and half_life <= train_window.elapsed_time / 3.0
        )
        parameter_count = 3
        log_likelihood = -float(result.fun)
        observations = len(target)
        return TheoryFit(
            theory=self.name,
            parameters={
                "theta": theta,
                "mu": mu,
                "sigma": sigma,
                "half_life": half_life,
            },
            parameter_uncertainty=uncertainty,
            identifiable=identifiable,
            train_window=train_window,
            train_log_likelihood=log_likelihood,
            aic=2.0 * parameter_count - 2.0 * log_likelihood,
            bic=math.log(observations) * parameter_count - 2.0 * log_likelihood,
            optimizer={
                "method": "L-BFGS-B",
                "converged": bool(result.success),
                "iterations": int(result.nit),
                "message": str(result.message),
                "exact_irregular_transition": True,
            },
            residual_diagnostics={
                "standardized_mean": float(np.mean(standardized)),
                "standardized_std": float(np.std(standardized, ddof=1)),
                "lag_one_autocorrelation": lag_one,
                "jarque_bera_statistic": float(normality.statistic),
                "jarque_bera_pvalue": float(normality.pvalue),
            },
            state={
                "optimum": np.asarray(result.x, dtype=float),
                "standardized_residuals": standardized,
            },
        )

    def forecast(
        self, fit: TheoryFit, horizon: ForecastHorizon
    ) -> ForecastDistribution:
        theta = float(fit.parameters["theta"])
        mu = float(fit.parameters["mu"])
        sigma = float(fit.parameters["sigma"])
        means, variances = _ou_distribution(
            theta,
            mu,
            sigma,
            np.asarray(horizon.origin_values, dtype=float),
            np.asarray(horizon.delta_times, dtype=float),
        )
        return _forecast_from_arrays(self.name, means, variances, horizon)

    def score(
        self, forecast: ForecastDistribution, sealed_holdout: SealedHoldout
    ) -> TheoryScore:
        return _score_distribution(forecast, sealed_holdout)

    def _structural_stability(
        self, world: TheoryWorld, fit: TheoryFit
    ) -> dict[str, float | bool | None]:
        train = fit.train_window
        length = train.end_index - train.start_index
        candidates = sorted(
            {
                train.start_index + int(length * fraction)
                for fraction in (0.4, 0.5, 0.6)
            }
        )
        best_bic_improvement = -math.inf
        worst_theta_gap = 0.0
        worst_mu_shift = 0.0
        evaluated = 0
        fitted_theta = float(fit.parameters["theta"])
        if fitted_theta <= 0:
            return {
                "stable": False,
                "candidate_splits": 0,
                "bic_improvement": None,
                "theta_relative_gap": None,
                "mu_shift_stationary_sigma": None,
                "score": 0.0,
            }
        stationary_scale = float(fit.parameters["sigma"]) / math.sqrt(2.0 * fitted_theta)
        for split in candidates:
            if split - train.start_index < 32 or train.end_index - split < 32:
                continue
            try:
                left = self.fit(world, _window(world, train.start_index, split))
                right = self.fit(world, _window(world, split, train.end_index))
            except (OUTheoryError, ValueError):
                continue
            theta_left = float(left.parameters["theta"])
            theta_right = float(right.parameters["theta"])
            if theta_left <= 0 or theta_right <= 0:
                theta_gap = 1.0
            else:
                theta_gap = abs(theta_left - theta_right) / max(theta_left, theta_right)
            mu_shift = abs(float(left.parameters["mu"]) - float(right.parameters["mu"])) / max(
                stationary_scale, 1e-9
            )
            bic_improvement = fit.bic - (left.bic + right.bic)
            best_bic_improvement = max(best_bic_improvement, bic_improvement)
            worst_theta_gap = max(worst_theta_gap, theta_gap)
            worst_mu_shift = max(worst_mu_shift, mu_shift)
            evaluated += 1
        if evaluated == 0:
            return {
                "stable": False,
                "candidate_splits": 0,
                "bic_improvement": None,
                "theta_relative_gap": None,
                "mu_shift_stationary_sigma": None,
                "score": 0.0,
            }
        stable = (
            best_bic_improvement <= 10.0
            and worst_theta_gap <= 0.75
            and worst_mu_shift <= 1.5
        )
        score = max(
            0.0,
            1.0
            - max(
                max(best_bic_improvement, 0.0) / 20.0,
                worst_theta_gap,
                worst_mu_shift / 2.0,
            ),
        )
        return {
            "stable": stable,
            "candidate_splits": evaluated,
            "bic_improvement": best_bic_improvement,
            "theta_relative_gap": worst_theta_gap,
            "mu_shift_stationary_sigma": worst_mu_shift,
            "score": score,
        }

    def falsify(
        self, fit: TheoryFit, evidence: TheoryEvidence
    ) -> FalsificationReport:
        diagnostics = fit.residual_diagnostics
        theta = float(fit.parameters["theta"])
        half_life_value = fit.parameters["half_life"]
        half_life = float(half_life_value) if half_life_value is not None else None
        theta_interval = fit.parameter_uncertainty["theta"]
        theta_low = theta_interval["ci_low"]
        residual_mean = abs(float(diagnostics["standardized_mean"]))
        residual_std = float(diagnostics["standardized_std"])
        residual_lag = abs(float(diagnostics["lag_one_autocorrelation"]))
        normality_pvalue = float(diagnostics["jarque_bera_pvalue"])
        lag_tolerance = max(0.20, 2.0 / math.sqrt(fit.train_window.observations - 1))
        structural = self._structural_stability(evidence.world, fit)
        deltas = np.asarray(
            [
                elapsed_in_unit(left, right, evidence.world.time_unit)
                for left, right in zip(
                    evidence.world.observed_at, evidence.world.observed_at[1:]
                )
            ]
        )
        irregular = bool(np.ptp(deltas) > 1e-9)
        ledger = evidence.hypothesis_ledger
        correction = (ledger.multiplicity_adjustment or "").lower()
        supported_correction = correction.startswith("benjamini-hochberg") or correction.startswith(
            "bonferroni"
        )
        multiplicity_status = (
            CheckStatus.PASS
            if ledger.hypotheses_considered == 1 or supported_correction
            else CheckStatus.NOT_MEASURED
        )
        checks = (
            FalsificationCheck(
                "pit_world",
                CheckStatus.PASS
                if evidence.world.point_in_time_enforced
                else CheckStatus.FAIL,
                "Every observation was available by the bound as-of timestamp.",
                True,
                {"world_hash": evidence.world.world_hash},
            ),
            FalsificationCheck(
                "optimizer_convergence",
                CheckStatus.PASS
                if bool(fit.optimizer["converged"])
                else CheckStatus.FAIL,
                "Exact-transition maximum likelihood converged."
                if bool(fit.optimizer["converged"])
                else "Exact-transition maximum likelihood did not converge.",
                True,
                dict(fit.optimizer),
            ),
            FalsificationCheck(
                "theta_positive",
                CheckStatus.PASS if theta > 0 else CheckStatus.FAIL,
                "The fitted continuous-time reversion rate is positive."
                if theta > 0
                else "The fitted process is not mean-reverting.",
                True,
                {"theta": theta},
            ),
            FalsificationCheck(
                "parameter_identifiability",
                CheckStatus.PASS if fit.identifiable else CheckStatus.FAIL,
                "Parameter uncertainty identifies a supported reversion rate."
                if fit.identifiable
                else "Parameter uncertainty or sample span does not identify a supported reversion rate.",
                True,
                {"theta_ci_low": theta_low, "half_life": half_life},
            ),
            FalsificationCheck(
                "half_life_support",
                CheckStatus.PASS
                if half_life is not None
                and half_life <= fit.train_window.elapsed_time / 3.0
                else CheckStatus.FAIL,
                "The estimated half-life is short relative to the training span."
                if half_life is not None
                and half_life <= fit.train_window.elapsed_time / 3.0
                else "The estimated half-life is too long for the available sample.",
                True,
                {
                    "half_life": half_life,
                    "training_span": fit.train_window.elapsed_time,
                    "maximum_ratio": 1.0 / 3.0,
                },
            ),
            FalsificationCheck(
                "residual_distribution",
                CheckStatus.PASS
                if residual_mean <= 0.15
                and 0.75 <= residual_std <= 1.25
                and normality_pvalue >= 0.01
                else CheckStatus.FAIL,
                "Standardized innovations pass the D0.1 moment and tail screen."
                if residual_mean <= 0.15
                and 0.75 <= residual_std <= 1.25
                and normality_pvalue >= 0.01
                else "Standardized innovations materially violate Gaussian OU assumptions.",
                True,
                {
                    "absolute_mean": residual_mean,
                    "standard_deviation": residual_std,
                    "jarque_bera_pvalue": normality_pvalue,
                },
            ),
            FalsificationCheck(
                "residual_independence",
                CheckStatus.PASS if residual_lag <= lag_tolerance else CheckStatus.FAIL,
                "Innovation lag-one dependence is below the pre-registered tolerance."
                if residual_lag <= lag_tolerance
                else "Innovation lag-one dependence exceeds the pre-registered tolerance.",
                True,
                {
                    "absolute_lag_one": residual_lag,
                    "tolerance": lag_tolerance,
                },
            ),
            FalsificationCheck(
                "irregular_time_transition",
                CheckStatus.PASS,
                "The exact transition likelihood uses each observed delta time."
                if irregular
                else "The exact transition likelihood was evaluated on regular spacing.",
                True,
                {
                    "irregular": irregular,
                    "minimum_delta": float(np.min(deltas)),
                    "maximum_delta": float(np.max(deltas)),
                },
            ),
            FalsificationCheck(
                "structural_stability",
                CheckStatus.PASS if bool(structural["stable"]) else CheckStatus.FAIL,
                "Pre-holdout subwindow fits remain structurally stable."
                if bool(structural["stable"])
                else "A pre-holdout parameter or likelihood break invalidates the stable-OU claim.",
                True,
                structural,
            ),
            FalsificationCheck(
                "sealed_holdout",
                CheckStatus.PASS
                if evidence.hypothesis_ledger.holdout_untouched
                else CheckStatus.FAIL,
                "The future holdout remained untouched during selection."
                if evidence.hypothesis_ledger.holdout_untouched
                else "The selection procedure touched the future holdout.",
                True,
                {
                    "holdout_start": evidence.holdout.window.start.isoformat(),
                    "holdout_observations": evidence.holdout.window.observations,
                },
            ),
            FalsificationCheck(
                "multiple_testing",
                multiplicity_status,
                (
                    "One pre-registered hypothesis was evaluated."
                    if ledger.hypotheses_considered == 1
                    else "The searched hypothesis family carries a supported multiplicity correction."
                )
                if multiplicity_status is CheckStatus.PASS
                else "The searched hypothesis family has no supported multiplicity correction.",
                True,
                {
                    "hypotheses_considered": ledger.hypotheses_considered,
                    "selection_procedure": ledger.selection_procedure,
                    "multiplicity_adjustment": ledger.multiplicity_adjustment,
                },
            ),
        )
        if any(
            check.critical and check.status is CheckStatus.FAIL for check in checks
        ):
            verdict = ScientificVerdict.REJECT
            explanation = "The OU scientific interpretation failed a critical falsifier."
        elif any(
            check.critical and check.status is CheckStatus.NOT_MEASURED
            for check in checks
        ):
            verdict = ScientificVerdict.ABSTAIN
            explanation = "A critical scientific control is not measured."
        else:
            verdict = ScientificVerdict.ACCEPT
            explanation = "OU passed every pre-registered scientific falsifier."
        return FalsificationReport(
            checks=checks,
            structural_stability=structural,
            scientific_verdict=verdict,
            explanation=explanation,
        )

    def compare(
        self, score: TheoryScore, baselines: Sequence[BaselineScore]
    ) -> TheoryComparison:
        if not baselines:
            return TheoryComparison(
                best_baseline="unavailable",
                best_baseline_loss=math.nan,
                theory_loss=score.negative_log_likelihood,
                delta_baseline=math.nan,
                winner="unresolved",
                predictive_verdict=ScientificVerdict.ABSTAIN,
                explanation="No baseline scores were supplied.",
            )
        best = min(baselines, key=lambda item: item.score.negative_log_likelihood)
        delta = best.score.negative_log_likelihood - score.negative_log_likelihood
        theory_wins = delta > 1e-6 and score.rmse <= best.score.rmse
        return TheoryComparison(
            best_baseline=best.theory,
            best_baseline_loss=best.score.negative_log_likelihood,
            theory_loss=score.negative_log_likelihood,
            delta_baseline=delta,
            winner="OU" if theory_wins else best.theory,
            predictive_verdict=(
                ScientificVerdict.ACCEPT
                if theory_wins
                else ScientificVerdict.REJECT
            ),
            explanation=(
                f"OU improves proper-score loss by {delta:.4f} and does not worsen RMSE."
                if theory_wins
                else f"{best.theory} wins the sealed holdout; OU cannot claim predictive value."
            ),
        )


def _baseline_scores(
    theory: OUTheory,
    world: TheoryWorld,
    train_window: TimeWindow,
    horizon: ForecastHorizon,
    holdout: SealedHoldout,
) -> tuple[BaselineScore, ...]:
    train = np.asarray(
        world.values[train_window.start_index : train_window.end_index], dtype=float
    )
    train_times = world.observed_at[
        train_window.start_index : train_window.end_index
    ]
    train_dt = np.asarray(
        [
            elapsed_in_unit(left, right, world.time_unit)
            for left, right in zip(train_times, train_times[1:])
        ],
        dtype=float,
    )
    train_diff = np.diff(train)
    origins = np.asarray(horizon.origin_values, dtype=float)
    holdout_dt = np.asarray(horizon.delta_times, dtype=float)
    target = np.asarray(holdout.values, dtype=float)
    entries: list[BaselineScore] = []

    def add(
        name: str,
        complexity: str,
        parameters: int,
        means: np.ndarray,
        variances: np.ndarray,
    ) -> None:
        forecast = _forecast_from_arrays(name, means, variances, horizon)
        entries.append(
            BaselineScore(
                theory=name,
                role="baseline",
                complexity=complexity,
                parameters=parameters,
                score=theory.score(forecast, holdout),
            )
        )

    drift = float(np.sum(train_diff) / np.sum(train_dt))
    drift_residual = train_diff - drift * train_dt
    diffusion_rate = max(
        float(np.sum(np.square(drift_residual)) / np.sum(train_dt)),
        np.finfo(float).eps,
    )
    add(
        "Random walk",
        "LOW",
        2,
        origins + drift * holdout_dt,
        diffusion_rate * holdout_dt,
    )

    persistence_variance = max(
        float(np.mean(np.square(train_diff))), np.finfo(float).eps
    )
    add(
        "Persistence",
        "MINIMAL",
        1,
        origins,
        np.full_like(origins, persistence_variance),
    )

    historical_mean = float(np.mean(train))
    historical_variance = max(float(np.var(train, ddof=1)), np.finfo(float).eps)
    add(
        "Historical mean",
        "MINIMAL",
        2,
        np.full_like(origins, historical_mean),
        np.full_like(origins, historical_variance),
    )

    x = train[:-1]
    y = train[1:]
    centered = x - float(np.mean(x))
    phi = float(
        np.dot(centered, y - float(np.mean(y)))
        / max(np.dot(centered, centered), np.finfo(float).eps)
    )
    intercept = float(np.mean(y) - phi * np.mean(x))
    ar_residual = y - (intercept + phi * x)
    ar_variance = max(float(np.mean(np.square(ar_residual))), np.finfo(float).eps)
    add(
        "AR(1)",
        "LOW",
        3,
        intercept + phi * origins,
        np.full_like(origins, ar_variance),
    )

    rolling_window = min(20, max(8, len(train) // 6))
    training_predictions = np.asarray(
        [
            train[index - 1]
            - 0.25
            * (
                train[index - 1]
                - float(np.mean(train[max(0, index - rolling_window) : index]))
            )
            for index in range(rolling_window, len(train))
        ],
        dtype=float,
    )
    rolling_targets = train[rolling_window:]
    rolling_variance = max(
        float(np.mean(np.square(rolling_targets - training_predictions))),
        np.finfo(float).eps,
    )
    rolling_means = []
    all_values = np.asarray(world.values, dtype=float)
    for index in range(holdout.window.start_index, holdout.window.end_index):
        origin = all_values[index - 1]
        local_mean = float(
            np.mean(all_values[max(0, index - rolling_window) : index])
        )
        rolling_means.append(origin - 0.25 * (origin - local_mean))
    add(
        "Rolling z-score",
        "LOW",
        2,
        np.asarray(rolling_means),
        np.full_like(target, rolling_variance),
    )
    return tuple(entries)


def certify_ou(
    values: Sequence[float],
    *,
    observable: str = "unnamed observable",
    observed_at: Sequence[datetime] | None = None,
    available_at: Sequence[datetime] | None = None,
    as_of: datetime | None = None,
    time_unit: str = "day",
    regular_dt: float = 1.0,
    train_fraction: float = 0.72,
    hypothesis_ledger: HypothesisLedger | None = None,
    source: str = "in-memory",
    revision: str = "unversioned",
    execution_survival: bool | None = None,
) -> TheoryArtifact:
    """Run the full D0.1 theory-certification lifecycle for OU."""

    if not 0.6 <= train_fraction <= 0.85:
        raise OUTheoryError("train_fraction must be between 0.60 and 0.85")
    try:
        world = make_theory_world(
            values,
            observable=observable,
            observed_at=observed_at,
            available_at=available_at,
            as_of=as_of,
            time_unit=time_unit,
            regular_dt=regular_dt,
            source=source,
            revision=revision,
        )
    except TheoryWorldError as exc:
        raise OUTheoryError(str(exc)) from exc
    split = max(48, int(len(world.values) * train_fraction))
    split = min(split, len(world.values) - 16)
    train_window = _window(world, 0, split)
    holdout_window = _window(world, split, len(world.values))
    ledger = hypothesis_ledger or HypothesisLedger(
        hypotheses_considered=1,
        selection_procedure="pre-registered single-theory calibration",
        selection_timestamp=world.observed_at[0],
        selection_metric="sealed holdout negative log likelihood",
        holdout_untouched=True,
    )
    theory = OUTheory()
    fit = theory.fit(world, train_window)
    horizon = ForecastHorizon(
        origin_values=tuple(world.values[split - 1 : -1]),
        delta_times=tuple(
            elapsed_in_unit(left, right, world.time_unit)
            for left, right in zip(
                world.observed_at[split - 1 : -1], world.observed_at[split:]
            )
        ),
        target_times=tuple(world.observed_at[split:]),
    )
    holdout = SealedHoldout(
        window=holdout_window, values=tuple(world.values[split:])
    )
    forecast = theory.forecast(fit, horizon)
    score = theory.score(forecast, holdout)
    baselines = _baseline_scores(theory, world, train_window, horizon, holdout)
    comparison = theory.compare(score, baselines)
    evidence = TheoryEvidence(
        world=world,
        holdout=holdout,
        score=score,
        hypothesis_ledger=ledger,
    )
    report = theory.falsify(fit, evidence)

    if execution_survival is True:
        economic_verdict = ScientificVerdict.ACCEPT
    elif execution_survival is False:
        economic_verdict = ScientificVerdict.REJECT
    else:
        economic_verdict = ScientificVerdict.ABSTAIN
    market_claim_eligible = bool(
        report.scientific_verdict is ScientificVerdict.ACCEPT
        and comparison.predictive_verdict is ScientificVerdict.ACCEPT
        and economic_verdict is ScientificVerdict.ACCEPT
        and world.point_in_time_enforced
        and all(
            not check.critical or check.status is CheckStatus.PASS
            for check in report.checks
        )
    )
    verdicts = (
        report.scientific_verdict,
        comparison.predictive_verdict,
        economic_verdict,
    )
    if any(verdict is ScientificVerdict.REJECT for verdict in verdicts):
        final_market_claim = ScientificVerdict.REJECT
    elif market_claim_eligible:
        final_market_claim = ScientificVerdict.ACCEPT
    else:
        final_market_claim = ScientificVerdict.ABSTAIN

    failed = next(
        (
            check
            for check in report.checks
            if check.critical and check.status is CheckStatus.FAIL
        ),
        None,
    )
    if failed is not None and comparison.predictive_verdict is ScientificVerdict.ACCEPT:
        decision_summary = (
            f"OU predicts better, but {failed.code.replace('_', ' ')} fails "
            "→ SCIENTIFIC REJECT."
        )
    elif report.scientific_verdict is ScientificVerdict.REJECT:
        decision_summary = (
            f"OU is rejected by {failed.code.replace('_', ' ') if failed else 'a critical falsifier'}."
        )
    elif comparison.predictive_verdict is ScientificVerdict.REJECT:
        decision_summary = (
            f"{comparison.best_baseline} wins the sealed holdout "
            "→ PREDICTIVE REJECT."
        )
    elif economic_verdict is ScientificVerdict.ABSTAIN:
        decision_summary = (
            "OU survives scientific and predictive certification; execution is unmeasured "
            "→ MARKET CLAIM ABSTAIN."
        )
    elif economic_verdict is ScientificVerdict.REJECT:
        decision_summary = (
            "OU survives statistically, but execution fails → ECONOMIC REJECT."
        )
    else:
        decision_summary = "OU satisfies the complete scientific and economic eligibility gate."

    forecast_by_time = {point.target_time: point for point in forecast.points}
    series = tuple(
        {
            "index": index,
            "observed": value,
            "observed_at": observation.isoformat(),
            "available_at": availability.isoformat(),
            "forecast": (
                forecast_by_time[observation].mean
                if observation in forecast_by_time
                else None
            ),
            "forecast_lower_90": (
                forecast_by_time[observation].lower_90
                if observation in forecast_by_time
                else None
            ),
            "forecast_upper_90": (
                forecast_by_time[observation].upper_90
                if observation in forecast_by_time
                else None
            ),
        }
        for index, (value, observation, availability) in enumerate(
            zip(world.values, world.observed_at, world.available_at)
        )
    )
    return TheoryArtifact(
        schema_version="dynamics-theory/0.1.0",
        theory=theory.name,
        equation=theory.equation,
        observable=world.observable,
        world_hash=world.world_hash,
        as_of=world.as_of,
        train_window=train_window,
        holdout_window=holdout_window,
        parameters=fit.parameters,
        parameter_uncertainty=fit.parameter_uncertainty,
        identifiability={
            "identified": fit.identifiable,
            "optimizer_converged": fit.optimizer["converged"],
            "criterion": "theta 95% CI > 0 and half-life <= one-third training span",
        },
        forecast_distribution=forecast,
        holdout_score=score,
        baseline_scores=baselines,
        comparison=comparison,
        structural_stability=report.structural_stability,
        falsification_checks=report.checks,
        hypothesis_ledger=ledger,
        scientific_verdict=report.scientific_verdict,
        predictive_verdict=comparison.predictive_verdict,
        economic_verdict=economic_verdict,
        final_market_claim=final_market_claim,
        market_claim_eligible=market_claim_eligible,
        decision_summary=decision_summary,
        series=series,
    )


def generate_exact_ou(
    delta_times: Sequence[float],
    *,
    theta: float = 0.18,
    mu: float = 0.0,
    sigma: float = 0.24,
    seed: int = 212,
    initial_value: float = 0.42,
    innovations: Sequence[float] | None = None,
) -> list[float]:
    """Generate an exact OU path across regular or irregular delta times."""

    if theta <= 0 or sigma <= 0:
        raise OUTheoryError("theta and sigma must be positive")
    deltas = np.asarray(delta_times, dtype=float)
    if len(deltas) < 63 or np.any(deltas <= 0) or not np.all(np.isfinite(deltas)):
        raise OUTheoryError("at least 63 positive finite transition deltas are required")
    if innovations is None:
        shocks = np.random.default_rng(seed).normal(size=len(deltas))
    else:
        shocks = np.asarray(innovations, dtype=float)
        if len(shocks) != len(deltas):
            raise OUTheoryError("innovations must match delta_times")
    values = np.empty(len(deltas) + 1, dtype=float)
    values[0] = initial_value
    for index, (delta_time, shock) in enumerate(zip(deltas, shocks), start=1):
        decay = math.exp(-theta * float(delta_time))
        variance = (sigma * sigma / (2.0 * theta)) * (
            1.0 - math.exp(-2.0 * theta * float(delta_time))
        )
        values[index] = mu + (values[index - 1] - mu) * decay + math.sqrt(
            variance
        ) * float(shock)
    return [float(value) for value in values]
