"""Family E (GARCH/ARCH-LM): arch in production, SciPy reference in tests only."""

import json

import numpy as np
import pytest

from src.regimes.garch import arch_lm, fit_garch
from tests.regimes import reference_garch
from tests.regimes.fixtures import garch_returns


@pytest.fixture(scope="module")
def world():
    return garch_returns(3000, seed=21, omega=0.02, alpha=0.08, beta=0.9) / 100


def test_known_garch_world_is_recovered(world):
    fit = fit_garch(world)
    assert fit["fit_status"] == "CONVERGED" and fit["converged"]
    assert abs(fit["alpha"] - 0.08) < 0.03 and abs(fit["beta"] - 0.9) < 0.04
    assert 0 < fit["persistence"] < 1 and fit["half_life_domain"] == "VALID"
    assert fit["half_life_observations"] == pytest.approx(np.log(0.5) / np.log(fit["persistence"]))
    assert fit["inference"] == "DIAGNOSTIC_ASYMPTOTIC"
    json.dumps(fit, allow_nan=False)


def test_arch_matches_independent_scipy_reference(world):
    production = fit_garch(world)
    y = 100 * world
    arch_params = [production["mu_percent"], production["omega_percent2"], production["alpha"], production["beta"]]
    assert reference_garch.log_likelihood(arch_params, y) == pytest.approx(production["log_likelihood"], rel=1e-8)
    _, sigma2 = reference_garch.variance_path(arch_params, y)
    from arch import arch_model

    conditional = np.asarray(
        arch_model(y, mean="Constant", vol="GARCH", p=1, q=1, dist="normal", rescale=False)
        .fix(np.array(arch_params))
        .conditional_volatility
    )
    assert np.allclose(np.sqrt(sigma2), conditional, rtol=1e-6)
    params, ll, ok = reference_garch.fit(y)
    assert ok and abs(params[2] - production["alpha"]) < 0.01 and abs(params[3] - production["beta"]) < 0.01
    assert ll == pytest.approx(production["log_likelihood"], abs=0.5)


@pytest.mark.parametrize("seed", [3, 4, 5, 6, 7, 8])
def test_iid_gaussian_never_reports_an_identified_persistence(seed):
    # Without an ARCH effect beta is not identified; the optimizer may stop at
    # alpha = 0 or at a tiny alpha with beta near 1 depending on the platform.
    fit = fit_garch(np.random.default_rng(seed).normal(0, 0.01, 1500))
    assert fit["fit_status"] in {"BOUNDARY", "UNIDENTIFIED"}
    assert fit["half_life_observations"] is None and fit["half_life_domain"].startswith("INVALID_DOMAIN")
    assert fit["arch_identification"]["identified"] is False or fit["fit_status"] == "BOUNDARY"


def test_simulated_arch_effect_is_identified(world):
    fit = fit_garch(world)
    assert fit["arch_identification"]["identified"] and fit["arch_identification"]["alpha_lower_95"] > 0


def test_return_scaling_leaves_dynamics_invariant(world):
    base, scaled = fit_garch(world), fit_garch(world * 3)
    assert scaled["alpha"] == pytest.approx(base["alpha"], abs=5e-3)
    assert scaled["beta"] == pytest.approx(base["beta"], abs=5e-3)
    assert scaled["omega_percent2"] == pytest.approx(9 * base["omega_percent2"], rel=0.05)


@pytest.mark.parametrize("values", [np.zeros(800), np.full(800, 0.001), np.arange(10) / 100])
def test_constant_or_short_series_are_unavailable(values):
    assert fit_garch(values)["status"] == "UNAVAILABLE"


def test_arch_lm_is_labelled_diagnostic_and_detects_planted_clustering(world):
    planted = arch_lm(world)
    iid = arch_lm(np.random.default_rng(4).normal(0, 0.01, 3000))
    assert planted["inference"] == iid["inference"] == "DIAGNOSTIC_ASYMPTOTIC"
    assert planted["lm_pvalue"] < 1e-6 and np.isfinite(iid["lm_pvalue"])
    assert arch_lm(world[:50])["status"] == "UNAVAILABLE"
