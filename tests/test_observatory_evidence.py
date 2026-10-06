"""Verdict, interval, family and stability evidence for signal traces, on synthetic fixtures."""
import json
from pathlib import Path

import numpy as np
import pytest
from scipy.stats import spearmanr
from sklearn.metrics import roc_auc_score

from src.observatory.evidence import (FAMILIES, bootstrap_auc_ci, feature_family, fold_rho,
                                      selection_suppressed, selection_verdict)

ROOT = Path(__file__).resolve().parents[1]


def ci(low, high):
    return {"low": low, "high": high, "resamples": 2000, "valid_resamples": 2000, "seed": 42}


@pytest.mark.parametrize("interval, aucs, expected", [
    # edge: holdout interval above chance and a family clears 0.52 on validation
    (ci(0.53, 0.61), [0.55, 0.60, 0.49], ("edge", "holdout_ci_above_chance")),
    # none: holdout interval entirely below chance, whatever validation said
    (ci(0.41, 0.49), [0.55, 0.60], ("none", "holdout_ci_below_chance")),
    # none: every family at or below a coin flip, even with a lucky holdout
    (ci(0.53, 0.61), [0.50, 0.48, 0.49], ("none", "validation_at_or_below_chance")),
    # inconclusive: the interval includes chance
    (ci(0.47, 0.58), [0.55, 0.60], ("inconclusive", "holdout_ci_spans_chance")),
    # inconclusive: interval clears chance but no family beats 0.52
    (ci(0.51, 0.58), [0.505, 0.52], ("inconclusive", "validation_edge_too_small")),
    # inconclusive: no computable holdout AUC
    (None, [0.55, 0.60], ("inconclusive", "holdout_auc_unavailable")),
    # the SPY replay: every family below chance, holdout 0.463
    (ci(0.396, 0.532), [0.489, 0.482, 0.4819, 0.481, 0.446], ("none", "validation_at_or_below_chance")),
])
def test_verdict_branches(interval, aucs, expected):
    assert selection_verdict(interval, aucs) == expected


def test_verdict_boundaries_are_strict():
    assert selection_verdict(ci(0.50, 0.60), [0.60]) == ("inconclusive", "holdout_ci_spans_chance")
    assert selection_verdict(ci(0.40, 0.50), [0.60]) == ("inconclusive", "holdout_ci_spans_chance")
    assert selection_verdict(ci(0.55, 0.60), [0.50, 0.50]) == ("none", "validation_at_or_below_chance")
    assert selection_verdict(ci(0.55, 0.60), [0.52]) == ("inconclusive", "validation_edge_too_small")
    assert selection_verdict(ci(0.55, 0.60), [None, 0.53]) == ("edge", "holdout_ci_above_chance")
    assert selection_verdict(ci(0.55, 0.60), [None]) == ("inconclusive", "validation_edge_too_small")


def test_selection_suppressed_only_when_every_family_is_at_or_below_chance():
    assert selection_suppressed([0.49, 0.5, 0.3])
    assert not selection_suppressed([0.49, 0.501])
    assert not selection_suppressed([None, None])
    assert selection_suppressed([None, 0.45])


def test_bootstrap_is_seeded_and_matches_sklearn_resamples():
    rng = np.random.default_rng(7)
    y, p = rng.integers(0, 2, 272), np.round(rng.random(272), 2)  # rounding forces tied scores
    first, second = bootstrap_auc_ci(y, p), bootstrap_auc_ci(y, p)
    assert first == second
    assert first["resamples"] == 2000 and first["seed"] == 42 and first["valid_resamples"] == 2000
    assert first["low"] < 0.5 < first["high"]  # noise spans chance
    idx = np.random.default_rng(42).integers(0, 272, size=(2000, 272))
    expected = np.percentile([roc_auc_score(y[i], p[i]) for i in idx], [2.5, 97.5])
    np.testing.assert_allclose([first["low"], first["high"]], expected, rtol=0, atol=1e-12)
    assert bootstrap_auc_ci(y, p, seed=43) != first


def test_bootstrap_separable_scores_give_a_degenerate_interval():
    y = np.repeat([0, 1], 50)
    interval = bootstrap_auc_ci(y, y + np.linspace(0, 0.1, 100))
    assert interval["low"] == interval["high"] == 1.0


def test_bootstrap_without_two_classes_or_scores_has_no_interval():
    assert bootstrap_auc_ci(np.ones(40), np.random.default_rng(1).random(40)) is None
    assert bootstrap_auc_ci(np.repeat([0, 1], 20), None) is None


def test_bootstrap_skips_single_class_resamples():
    interval = bootstrap_auc_ci([0, 0, 1], [0.1, 0.2, 0.9], resamples=500)
    assert 0 < interval["valid_resamples"] < 500
    assert interval["low"] == interval["high"] == 1.0


def test_feature_families_match_the_reference_export():
    html = (ROOT / "docs/observatory-reference.html").read_text(encoding="utf-8")
    start = html.index("window.OBS=") + len("window.OBS=")
    sig = json.loads(html[start:html.index(";</script>", start)])["sig"]
    assert tuple(sig["families"]) == FAMILIES
    for name, k in zip(sig["features"], sig["family"]):
        assert feature_family(name) == FAMILIES[k], name


def test_unknown_feature_columns_are_not_guessed():
    with pytest.raises(ValueError, match="No feature family"):
        feature_family("astrology_index")


def test_fold_rho_is_spearman_of_final_stage_importance():
    rng = np.random.default_rng(3)
    finals = [rng.random(12) for _ in range(4)]
    folds = [{"frames": [{"feature_importance": list(rng.random(12))},
                         {"feature_importance": list(v)}]} for v in finals]
    rho = fold_rho(folds)
    assert len(rho) == 3
    for r, a, b in zip(rho, finals, finals[1:]):
        assert r == pytest.approx(spearmanr(a, b).statistic, abs=1e-6)
    constant = [{"frames": [{"feature_importance": [0.5] * 12}]}, folds[0]]
    assert fold_rho(constant) == [None]
