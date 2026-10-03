from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import asdict

import numpy as np
import pytest
from scipy.optimize._numdiff import approx_derivative

from src.dynamics.hawkes_certification import exact_hawkes_log_likelihood
from src.dynamics.hawkes_identifiability import (
    DEFAULT_D041_ARTIFACT,
    PARENT_ARTIFACT,
    PARENT_FILE_SHA256,
    WORLD_SPECS,
    hawkes_log_likelihood_gradient,
)
from src.dynamics.hawkes_identifiability_verifier import (
    _expected_design,
    _expected_registry,
    _verify_world,
    verify_hawkes_identifiability,
)
from src.dynamics.selection_freeze import canonical_sha256


@pytest.fixture(scope="module")
def artifact() -> dict:
    return json.loads(DEFAULT_D041_ARTIFACT.read_text(encoding="utf-8"))


def rehash(payload: dict) -> dict:
    payload.pop("artifact_hash", None)
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


@pytest.mark.parametrize("dimension", [1, 2, 3])
def test_exact_vectorized_likelihood_and_gradient(dimension: int) -> None:
    rng = np.random.default_rng(8600 + dimension)
    events = [
        sorted([0.1, 0.7, 700.0] + rng.uniform(0.2, 699.0, 400).tolist())
        for _ in range(dimension)
    ]
    # Across-channel ties, hundreds of groups, and large gaps exercise the
    # chunk boundaries, exclusive histories, and exponential span guards.
    mu = rng.uniform(0.4, 0.8, dimension)
    alpha = rng.uniform(0.01, 0.12, (dimension, dimension))
    beta, horizon = 1.4, 701.0
    vector = np.r_[mu, alpha.ravel(), beta]

    def objective(v: np.ndarray) -> tuple:
        return hawkes_log_likelihood_gradient(
            events,
            v[:dimension],
            v[dimension:-1].reshape(dimension, dimension),
            v[-1],
            horizon,
        )

    likelihood, gm, ga, gb = objective(vector)
    historical_equation = exact_hawkes_log_likelihood(
        events, mu, alpha, np.full((dimension, dimension), beta), start=0.0, end=horizon
    )
    assert likelihood == pytest.approx(historical_equation, abs=1e-7)
    gradient = np.r_[gm, ga.ravel(), gb]
    numerical = approx_derivative(lambda v: objective(v)[0], vector).ravel()
    np.testing.assert_allclose(gradient, numerical, rtol=2e-5, atol=2e-5)


def test_registry_independently_reconciles_all_cells_and_parent() -> None:
    assert len(WORLD_SPECS) == 420
    assert sum(spec.audit for spec in WORLD_SPECS) == 44
    assert [spec.seed for spec in WORLD_SPECS] == list(range(41001, 41421))
    for spec, expected in zip(WORLD_SPECS, _expected_registry(), strict=True):
        design = _expected_design(expected)
        actual = json.loads(json.dumps(asdict(spec)))
        assert actual.keys() == design.keys()
        for key in actual:
            if key in {"baseline", "branching", "beta"}:
                np.testing.assert_allclose(actual[key], design[key], atol=1e-12)
            else:
                assert actual[key] == design[key]
    assert (
        hashlib.sha256(PARENT_ARTIFACT.read_bytes()).hexdigest() == PARENT_FILE_SHA256
    )


def test_frozen_artifact_independently_verifies(artifact: dict) -> None:
    report = verify_hawkes_identifiability(artifact)
    assert report["valid"], report["errors"]
    assert report["worlds_verified"] == 420
    assert artifact["program_result"]["status"] == "PARTIALLY_CHARACTERIZED"
    assert artifact["program_result"]["scalar_score"] is None
    assert not artifact["claim_boundary"]["market_claim_eligible"]
    assert not artifact["claim_boundary"]["causal_claim_eligible"]


@pytest.mark.parametrize(
    "attack",
    [
        "seed_overlap",
        "parent_seal",
        "grid",
        "market_claim",
        "causal_claim",
        "threshold",
        "source_seal",
    ],
)
def test_public_verifier_rejects_boundary_sabotage(artifact: dict, attack: str) -> None:
    bad = copy.deepcopy(artifact)
    if attack == "seed_overlap":
        bad["registry"][0]["seed"] = bad["parent_seal"]["parent_seeds"][0]
    elif attack == "parent_seal":
        bad["parent_seal"]["canonical_hash"] = "0" * 64
    elif attack == "grid":
        bad["worlds"].pop()
    elif attack == "source_seal":
        bad["implementation_sources"]["src/dynamics/hawkes_identifiability.py"] = (
            "0" * 64
        )
    elif attack == "threshold":
        bad["thresholds"]["edge_support_lower_bound"] = 0.0
    else:
        bad["claim_boundary"][attack + "_eligible"] = True
    report = verify_hawkes_identifiability(rehash(bad))
    assert not report["valid"], attack


@pytest.mark.parametrize(
    "attack",
    [
        "matrix",
        "stability",
        "truth_grid",
        "coverage",
        "graph",
        "support",
        "method_seed",
        "information",
        "rho_interval",
    ],
)
def test_world_evidence_rejects_arithmetic_sabotage(
    artifact: dict, attack: str
) -> None:
    record = copy.deepcopy(artifact["worlds"][0])
    if attack == "matrix":
        record["fit"]["branching_matrix"][0][0] += 0.1
    elif attack == "stability":
        record["fit"]["branching_matrix"][0][0] = 1.1
        record["fit"]["alpha"][0][0] = record["fit"]["beta"] * 1.1
        record["fit"]["spectral_radius"] = 1.1
    elif attack == "truth_grid":
        record["truth"]["baseline"][0] += 0.1
    elif attack == "coverage":
        record["uncertainty"]["event_attribution"]["branching"]["covered"][0][0] ^= 1
    elif attack == "graph":
        record["graph_evaluation"]["false_positive"] += 1
    elif attack == "support":
        record["uncertainty"]["event_attribution"]["bootstrap_support_probability"][0][
            0
        ] = -0.1
    elif attack == "method_seed":
        record["uncertainty"]["event_attribution"]["seed"] += 1
    elif attack == "information":
        record["information"]["expected_offspring_events"] += 1.0
    else:
        record["uncertainty"]["parametric_bootstrap"]["spectral_radius_ci95"] = [
            0.0,
            1.0,
        ]
    errors: list[str] = []
    _verify_world(record, _expected_registry()[0], artifact["registry"][0], errors)
    assert errors, attack


def test_aggregate_graph_metric_cannot_be_rehashed_into_truth(artifact: dict) -> None:
    bad = copy.deepcopy(artifact)
    bad["metrics"]["graph"]["precision"] = 1.0
    assert not verify_hawkes_identifiability(rehash(bad))["valid"]


@pytest.mark.parametrize(
    "payload", [None, [], {}, {"artifact_hash": "bad"}, {"worlds": [float("nan")]}]
)
def test_malformed_evidence_is_rejected_not_raised(payload) -> None:
    assert not verify_hawkes_identifiability(payload)["valid"]
