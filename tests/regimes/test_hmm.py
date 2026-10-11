"""Family D: filtered posteriors, deterministic labels, retained non-convergence."""

import numpy as np
import pandas as pd
import pytest

from src.regimes import hmm
from src.regimes.profile import profile


def regime_world(n=900, seed=9):
    rng = np.random.default_rng(seed)
    blocks, values, truth = [150, 120, 200, 130, 300], [], []
    for i, size in enumerate(blocks):
        scale = 0.005 if i % 2 == 0 else 0.02
        values.extend(rng.normal(0.0004 if scale < 0.01 else -0.001, scale, size))
        truth.extend([0 if scale < 0.01 else 1] * size)
    returns = np.asarray(values[:n])
    vol = pd.Series(returns).rolling(20).apply(lambda w: np.sqrt(np.mean(w**2)))
    frame = pd.DataFrame(
        {
            "observed_at": pd.bdate_range("2010-01-01", periods=len(returns), tz="UTC"),
            "mkt": returns,
            "realized_vol_20": vol,
            "truth": truth[: len(returns)],
        }
    ).dropna().reset_index(drop=True)
    return frame


@pytest.fixture(scope="module")
def fitted():
    frame = regime_world()
    result = hmm.fit(frame, ["mkt", "realized_vol_20"], n_states=2, seed=42, return_feature="mkt", settings=profile(), unit="session")
    return frame, result


def test_filtered_rows_are_probabilities_and_final_row_matches_hmmlearn(fitted):
    from src.regime.hmm_regime import train_hmm_regime_model

    frame, result = fitted
    tail = np.asarray(result["posterior_tail"])
    assert np.allclose(tail.sum(axis=1), 1)
    assert np.allclose(np.asarray(result["transition_matrix"]).sum(axis=1), 1)
    model = train_hmm_regime_model(frame[["mkt", "realized_vol_20"]], ["mkt", "realized_vol_20"], n_states=2, covariance_type="full", random_state=42)
    x = model["scaler"].transform(frame[["mkt", "realized_vol_20"]].values)
    smoothed_last = model["model"].predict_proba(x)[-1]
    order = hmm.canonical_order(np.asarray(model["model"].covars_)[:, 0, 0])
    assert np.allclose(smoothed_last[order], result["current_posterior"], atol=1e-8)


def test_filtered_path_is_prefix_invariant_under_fixed_parameters(fitted):
    from src.regime.hmm_regime import train_hmm_regime_model

    frame, _ = fitted
    model = train_hmm_regime_model(frame[["mkt", "realized_vol_20"]], ["mkt", "realized_vol_20"], n_states=2, covariance_type="full", random_state=42)["model"]
    x = np.random.default_rng(1).normal(size=(300, 2))
    full = hmm.forward_filter(model.startprob_, model.transmat_, model.means_, model.covars_, x)
    prefix = hmm.forward_filter(model.startprob_, model.transmat_, model.means_, model.covars_, x[:120])
    assert np.allclose(full[:120], prefix)
    smoothed = model.predict_proba(x)
    assert not np.allclose(smoothed[:120], full[:120]), "smoothing must differ from filtering"


def test_labels_rank_volatility_and_recover_the_planted_world(fitted):
    frame, result = fitted
    assert result["labels"] == ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"]
    assert result["return_variance"][0] < result["return_variance"][1]
    agreement = np.mean(np.asarray(result["states"]) == frame.truth.values)
    assert agreement > 0.9
    assert not any(word in str(result) for word in ("Bull", "Bear", "Crash", "Selloff"))


def test_labels_are_invariant_to_internal_state_permutation():
    variances = np.array([0.04, 0.01, 0.09])
    order = hmm.canonical_order(variances)
    permuted = variances[[2, 0, 1]]
    assert variances[order].tolist() == permuted[hmm.canonical_order(permuted)].tolist()


def test_same_seed_is_deterministic_and_semantic_hash_tracks_parameters(fitted):
    frame, result = fitted
    again = hmm.fit(frame, ["mkt", "realized_vol_20"], n_states=2, seed=42, return_feature="mkt", settings=profile(), unit="session")
    assert again["semantic_hash"] == result["semantic_hash"]
    shifted = frame.assign(mkt=frame.mkt * 1.5)
    other = hmm.fit(shifted, ["mkt", "realized_vol_20"], n_states=2, seed=42, return_feature="mkt", settings=profile(), unit="session")
    assert other["semantic_hash"] != result["semantic_hash"]


def test_unconverged_fit_is_retained_once_without_reruns(monkeypatch):
    import hmmlearn.hmm as module

    calls = []
    original = module.GaussianHMM.__init__

    def capped(self, *args, **kwargs):
        calls.append(1)
        kwargs["n_iter"] = 1
        original(self, *args, **kwargs)

    monkeypatch.setattr(module.GaussianHMM, "__init__", capped)
    frame = regime_world()
    result = hmm.fit(frame, ["mkt", "realized_vol_20"], n_states=2, seed=42, return_feature="mkt", settings=profile(), unit="observation")
    assert result["status"] == "AVAILABLE" and result["converged"] is False and len(calls) == 1
    found = hmm.issues(result, settings=profile(), asset="IN-MKT", run_hint="test")
    assert "HMM_UNCONVERGED" in {i["kind"] for i in found}
    assert result["duration_unit"] == "observations"
