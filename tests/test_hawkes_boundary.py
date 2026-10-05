from __future__ import annotations

import copy
import hashlib

import numpy as np
import pytest
from scipy.optimize._numdiff import approx_derivative

from src.dynamics import hawkes_boundary as lab
from src.dynamics import hawkes_identifiability as incumbent
from src.dynamics.hawkes_boundary_analysis import failure_tags, terminal_decision
from src.dynamics import hawkes_boundary_verifier as independent


@pytest.mark.parametrize("dimension", [1, 2, 3])
@pytest.mark.parametrize(
    "name", ["ZERO", "KNOWN", "ORACLE", "STATIONARY_MEAN", "WARM_2", "LEFT_CENSORED"]
)
def test_boundary_likelihood_analytic_gradient(dimension: int, name: str) -> None:
    events = [[0.1, 0.8, 1.7, 2.1] for _ in range(dimension)]
    history = [[-9.0, -2.0, -0.3] for _ in range(dimension)]
    if name == "LEFT_CENSORED":
        history[0] = []
    exposure = {
        "name": name,
        "history": (
            history
            if name not in {"ZERO", "ORACLE", "STATIONARY_MEAN"}
            else [[] for _ in history]
        ),
        "initial_excitation": [0.15] * dimension if name == "ORACLE" else None,
    }
    mu, alpha, beta = (
        np.full(dimension, 0.6),
        np.full((dimension, dimension), 0.06),
        1.4,
    )
    vector = np.r_[mu, alpha.ravel(), beta]

    def objective(v):
        return lab.conditional_likelihood_gradient(
            events,
            v[:dimension],
            v[dimension:-1].reshape(dimension, dimension),
            v[-1],
            2.5,
            exposure,
        )

    ll, gm, ga, gb = objective(vector)
    assert np.isfinite(ll)
    assert ll == pytest.approx(
        independent._likelihood(
            events, 2.5, {"baseline": mu, "alpha": alpha, "beta": beta}, exposure
        ),
        abs=1e-10,
    )
    numerical = approx_derivative(lambda v: objective(v)[0], vector).ravel()
    np.testing.assert_allclose(
        np.r_[gm, ga.ravel(), gb], numerical, rtol=3e-5, atol=3e-5
    )


def test_empty_known_history_and_zero_match_frozen_likelihood() -> None:
    events = [[0.2, 0.7, 40.0], [0.3, 0.7, 39.0]]
    mu, alpha, beta = [0.5, 0.6], [[0.1, 0.04], [0.03, 0.12]], 1.2
    old = incumbent.hawkes_log_likelihood_gradient(events, mu, alpha, beta, 42.0)
    new = lab.conditional_likelihood_gradient(
        events,
        mu,
        alpha,
        beta,
        42.0,
        {"name": "KNOWN", "history": [[], []], "initial_excitation": None},
    )
    for a, b in zip(old, new):
        np.testing.assert_allclose(a, b, rtol=1e-12, atol=1e-12)


def test_oracle_exposes_only_initial_intensity_not_parameter_derivatives() -> None:
    exposure = {"name": "ORACLE", "history": [[], []], "initial_excitation": [0.4, 0.7]}
    for mu, alpha, beta in (
        (np.array([0.5, 0.8]), np.full((2, 2), 0.1), 1.2),
        (np.array([0.8, 0.5]), np.full((2, 2), 0.02), 2.4),
    ):
        e, gm, ga, gb = lab.initial_terms(mu, alpha, beta, exposure)
        np.testing.assert_array_equal(e, [0.4, 0.7])
        assert not np.any(gm) and not np.any(ga) and not np.any(gb)
    assert set(exposure) == {"name", "history", "initial_excitation"}


def test_registry_and_immutable_parent_seals() -> None:
    specs = lab.registry()
    assert len(specs) == 200 and sum(s["audit"] for s in specs) == 20
    assert [s["seed"] for s in specs] == list(range(511001, 511201))
    assert len(set(s["id"] for s in specs)) == 200
    assert len(lab.PROTOCOLS) == 9
    parents = lab.parent_seals()
    assert not {s["seed"] for s in specs} & {
        x for p in parents.values() for x in p["seeds"]
    }
    for relative, _, digest in lab.PARENTS.values():
        assert hashlib.sha256((lab.ROOT / relative).read_bytes()).hexdigest() == digest


def test_latent_matching_and_observation_protocols_use_dev_seed() -> None:
    spec = {
        "id": "unit_only",
        "family": "UNIT",
        "regime": "UNIT",
        "information": "UNIT",
        "target": 50,
        "variant": 0,
        "seed": 799911,
        "mu": [0.5, 0.6],
        "G": [[0.15, 0.04], [0.12, 0.2]],
        "beta": 1.4,
        "observed": [0, 1],
        "audit": False,
    }
    latent = lab.generate_latent(spec)
    assert latent == lab.generate_latent(spec)
    assert latent["retained_events"] == [
        [t for t in stream if t >= 0] for stream in latent["full_events"]
    ]
    exposures = {name: lab.protocol_inputs(latent, name) for name in lab.PROTOCOLS}
    assert exposures["ZERO"]["history"] == [[], []]
    assert exposures["LEFT_CENSORED"]["history"][0] == []
    assert exposures["LEFT_CENSORED"]["history"][1] == exposures["KNOWN"]["history"][1]
    assert exposures["ORACLE"]["history"] == [[], []]
    assert exposures["ORACLE"]["initial_excitation"] is not None
    for channel in range(2):
        for shorter, longer in ((1, 2), (2, 5), (5, 10)):
            assert set(exposures[f"WARM_{shorter}"]["history"][channel]) <= set(
                exposures[f"WARM_{longer}"]["history"][channel]
            )
    assert all(
        set(p) == {"name", "history", "initial_excitation", "hash"}
        for p in exposures.values()
    )


def test_boundary_tag_needs_both_successful_matched_reference_fits() -> None:
    def row(name, present, success=True):
        return {
            "protocol": {"name": name},
            "fit": {"optimizer": {"success": success}},
            "uncertainty": {
                "event_attribution": {"edge_support": [[0, int(present)], [0, 0]]}
            },
        }

    record = {
        "truth": {
            "G": [[0.1, 0], [0.22, 0.2]],
            "driver_latent": False,
            "driver_observed": False,
        },
        "latent": {"counts": [80, 80]},
        "protocols": [row("ZERO", True), row("KNOWN", False), row("ORACLE", False)],
    }
    tags = failure_tags(record, record["protocols"][0], 1, 0)
    assert tags[:2] == ["BOUNDARY_INDUCED_EDGE", "DIRECTION_REVERSAL"]
    bad = copy.deepcopy(record)
    bad["protocols"][2]["fit"]["optimizer"]["success"] = False
    assert "BOUNDARY_INDUCED_EDGE" not in failure_tags(bad, bad["protocols"][0], 1, 0)


def test_terminal_decision_does_not_invent_evidence_for_empty_suite() -> None:
    result = terminal_decision([])
    assert result["decision"] == "EVIDENCE_INSUFFICIENT"
    assert not result["repair_implemented"]
    assert not result["intrinsic_nonidentifiability_established"]


def test_independent_dev_world_reconstruction() -> None:
    from src.dynamics.hawkes_boundary_analysis import derive_details

    spec = copy.deepcopy(lab.registry()[120])
    spec.update(id="independent_unit_only", seed=799912, target=60, audit=False)
    record = derive_details(lab.record_latent(spec))
    assert independent._latent(spec) == record["latent"]
    errors = []
    independent._world(record, spec, errors)
    assert not errors, errors
    record["protocols"][0]["structural_identifiability"] = "HIGH"
    independent._world(record, spec, errors)
    assert errors


def test_independent_registry_and_empty_decision() -> None:
    assert independent._design() == lab.registry()
    assert independent._decision([]) == terminal_decision([])
    assert not independent.verify_hawkes_boundary({})["valid"]
