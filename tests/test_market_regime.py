from __future__ import annotations

import copy
from datetime import timedelta
import json

import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError

from src.dynamics.market_regime import (
    CLAIMS,
    compile_world,
    fracture,
    hac_regression,
    landscape,
    macro_state,
    momentum_stats,
    seasonality,
    volatility_path,
)
from src.dynamics.market_regime_fixture import demo_world
from src.dynamics.market_regime_inputs import (
    Bar,
    RegimeInputError,
    RegimeWorld,
    bars_from_market_frame,
    utc,
    vintage,
)


@pytest.fixture(scope="module")
def full():
    return demo_world(sessions=160)


@pytest.fixture(scope="module")
def compiled(full):
    return compile_world(full, as_of=full.daily[-1].available_at)


def test_integrated_modules_and_disclosed_objective(compiled):
    assert compiled["claims"] == CLAIMS and not any(CLAIMS.values())
    assert len(compiled["timeline"]) == 160
    assert compiled["current"]["factors"]["status"] == "EXPOSED"
    mom = next(
        r for r in compiled["current"]["factors"]["rows"] if r["factor"] == "MOM"
    )
    assert abs(mom["beta"] - 0.7) < 0.06
    assert mom["status"] == "EXPOSED"
    assert len(compiled["landscape"]["cells"]) == 121
    for cell in compiled["landscape"]["cells"]:
        assert cell["objective"] == pytest.approx(
            sum(cell["contributions"].values()), abs=2e-9
        )
    assert compiled["landscape"]["optimum"] == max(
        compiled["landscape"]["cells"], key=lambda c: c["objective"]
    )
    for point in compiled["factor_pnl"]:
        assert point["raw"] == pytest.approx(
            point["explained"] + point["residual"], abs=2e-9
        )


def test_future_data_cannot_change_prefix(full, compiled):
    cutoff = full.daily[130].available_at
    old = compile_world(full, as_of=cutoff)
    future = copy.deepcopy(full.payload())
    for row in future["daily"][131:]:
        row["close"] *= 2.5
        row["strategy_return"] = 0.9
        row["liquidity"] = 1e10
    for row in future["factors"][131:]:
        row["values"] = {key: 0.5 for key in row["values"]}
    changed = compile_world(RegimeWorld.model_validate(future), as_of=cutoff)
    assert old == changed
    assert compiled["timeline"][:131] == old["timeline"]
    assert (
        compiled["optimizer_path"][: len(old["optimizer_path"])]
        == old["optimizer_path"]
    )


def test_late_observation_is_not_visible(full):
    data = full.payload()
    cutoff = full.daily[20].available_at
    before = macro_state(full, cutoff)
    row = dict(data["macro"][0])
    row["available_at"] = (cutoff + timedelta(days=20)).isoformat()
    row["revision"] = "future-correction"
    row["value"] = 1e6
    data["macro"].append(row)
    revised = RegimeWorld.model_validate(data)
    assert macro_state(revised, cutoff) == before
    known = vintage(revised.macro, cutoff + timedelta(days=21))
    assert known[0].revision == "future-correction"


def test_seasonality_excludes_current_day_and_future_sessions(full):
    cutoff = full.daily[70].available_at
    cells = seasonality(full, cutoff)["cells"]
    assert len(cells) == 65
    for cell in cells:
        assert utc(cell["baseline_end"]).date() < utc(cell["current_at"]).date()
        assert cell["metrics"]["volume"]["observations"] >= 5
        assert 0 <= cell["metrics"]["volume"]["percentile"] <= 1
    data = full.payload()
    for bar in data["intraday"]:
        if utc(bar["available_at"]) > cutoff:
            bar["volume"] = 1e12
    assert seasonality(RegimeWorld.model_validate(data), cutoff)["cells"] == cells


def test_sparse_data_is_not_silently_filled():
    world = demo_world(sparse=True, sessions=70)
    result = compile_world(world, as_of=world.daily[-1].available_at)
    assert result["current"]["vector"]["L"] is None
    assert result["current"]["vector"]["S"] is None
    assert result["current"]["vector"]["H"] is None
    assert result["current"]["factors"]["status"] == "UNIDENTIFIABLE"
    assert result["current"]["fracture"]["score"] is None
    assert result["landscape"]["status"] == "UNAVAILABLE"
    assert result["landscape"]["cells"] == []
    assert result["factor_pnl"] == []


def test_ewma_and_realized_volatility_have_numerical_witnesses():
    r = [None] + [0.01 * (-1) ** i for i in range(80)]
    result = volatility_path(r, 252)
    assert result[-1]["components"]["rv_20"] == pytest.approx(0.01 * np.sqrt(252))
    assert result[-1]["components"]["ewma_vol"] == pytest.approx(0.01 * np.sqrt(252))
    assert result[10]["cluster_score"] is None
    single = [None] + list(np.random.default_rng(6).normal(0, 0.003, 100)) + [0.07]
    assert volatility_path(single, 252)[-1]["state"] == "VOL_SHOCK"


def test_volatility_prefix_invariance():
    r = list(np.random.default_rng(1).normal(0, 0.01, 200))
    assert volatility_path(r, 252)[:100] == volatility_path(r[:100], 252)


def test_persistent_volatility_dependence_activates_cluster():
    magnitudes = np.tile(
        np.r_[np.full(15, 0.002), np.full(20, 0.02), np.full(10, 0.006)], 8
    )
    signs = np.random.default_rng(66).choice([-1, 1], len(magnitudes))
    result = volatility_path([None] + list(signs * magnitudes), 252)
    assert any(row["state"] == "VOL_CLUSTER" for row in result[120:])


def test_regime_turnover_includes_cross_regime_switches():
    states = [
        {
            "regime": "BULL_TREND" if i % 2 else "BEAR_TREND",
            "momentum": {"signal": 0.1 if i % 2 else -0.1},
        }
        for i in range(80)
    ]
    rows = momentum_stats(states, [0.01] * 80, 252)
    bull = next(row for row in rows if row["regime"] == "BULL_TREND")
    assert bull["turnover"] == pytest.approx(2 * np.tanh(1), abs=1e-9)


def test_hac_matches_independent_outer_product_calculation():
    rng = np.random.default_rng(44)
    x = rng.normal(0, 0.01, (100, 3))
    y = 0.002 + x @ np.array([0.2, -0.3, 0.8]) + rng.normal(0, 0.002, 100)
    result = hac_regression(y, x)
    design = np.c_[np.ones(100), x]
    beta = np.linalg.solve(design.T @ design, design.T @ y)
    np.testing.assert_allclose(result["beta"], beta)
    scores = design * (y - design @ beta)[:, None]
    meat = sum(np.outer(s, s) for s in scores)
    for lag in range(1, 4):
        for i in range(lag, 100):
            cross = np.outer(scores[i], scores[i - lag])
            meat += (1 - lag / 4) * (cross + cross.T)
    bread = np.linalg.inv(design.T @ design)
    np.testing.assert_allclose(result["covariance"], bread @ meat @ bread * 100 / 96)


@pytest.mark.parametrize("n", [0, 11, 59])
def test_insufficient_regression_abstains(n):
    assert hac_regression(np.zeros(n), np.zeros((n, 2)))["status"] == "UNIDENTIFIABLE"


def test_collinear_regression_abstains():
    x = np.arange(100) * 0.0001
    assert hac_regression(x, np.c_[x, x])["status"] == "UNIDENTIFIABLE"


def test_fracture_component_accounting_and_missingness():
    a = dict(V=0.5, C=0.3, L=0.2, H=0.4, F=0.1, S=0.2)
    b = {k: 0 for k in a}
    result = fracture(a, b)
    assert result["score"] == pytest.approx(sum(a.values()) / 6)
    assert result["score"] == pytest.approx(
        sum(result["contributions"].values()), abs=2e-9
    )
    a["H"] = None
    assert fracture(a, b)["score"] is None


def test_momentum_small_regime_does_not_acquire_sharpe():
    states = [{"regime": "BULL_TREND", "momentum": {"signal": 0.1}} for _ in range(12)]
    result = next(
        r
        for r in momentum_stats(states, [0.01] * 12, 252)
        if r["regime"] == "BULL_TREND"
    )
    assert result["n"] == 11 and result["status"] == "UNRESOLVED"
    assert result["hit_rate"] is None and result["sharpe"] is None


def test_hawkes_has_no_structure_or_criticality_claim(compiled):
    event = compiled["current"]["events"]
    assert event["training_as_of"] < compiled["current"]["observed_at"]
    assert event["criticality_status"] == "UNRESOLVED"
    assert event["graph_status"] == "NOT_TRUSTED"
    assert event["causal_status"] == "NOT_ESTABLISHED"
    assert not any(compiled["claims"].values())


def test_demo_session_volume_is_consistent(full):
    for i, bar in enumerate(full.daily):
        assert sum(
            b.volume for b in full.intraday[i * 13 : (i + 1) * 13]
        ) == pytest.approx(bar.volume)


def test_current_costs_cannot_select_current_landscape_position(full):
    states = [
        {
            "observed_at": b.observed_at.isoformat(),
            "asset_return": 0.001,
            "vector": dict(V=0.2, L=0.2, M=0.3, H=0.1, F=0.1, S=0.2),
        }
        for b in full.daily[:80]
    ]
    original = landscape(states, full.daily[:80], 252)
    bars = copy.deepcopy(full.daily[:80])
    bars[-1].spread_bps = 9999
    assert landscape(states, bars, 252) == original


def test_future_daily_bar_not_available(full):
    result = compile_world(full, as_of=full.daily[2].observed_at)
    assert result["world"]["observations"] == 2


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1, 0])
def test_nonfinite_or_invalid_prices_rejected(value):
    with pytest.raises((ValidationError, ValueError)):
        Bar(
            close=value,
            volume=10,
            observed_at="2024-01-01T10:00:00Z",
            available_at="2024-01-01T10:01:00Z",
        )


@pytest.mark.parametrize("value", ["2024-01-01", "2024-01-01T10:00:00"])
def test_naive_asof_rejected(value):
    with pytest.raises(RegimeInputError):
        utc(value)


def test_existing_market_adapter_requires_real_availability():
    frame = pd.DataFrame(
        {"Date": ["2024-01-01T10:00:00Z"], "Close": [100], "Volume": [5]}
    )
    with pytest.raises(RegimeInputError):
        bars_from_market_frame(frame, as_of=utc("2024-01-02T00:00:00Z"))
    frame["available_at"] = ["2024-01-01T10:02:00Z"]
    assert not bars_from_market_frame(frame, as_of=utc("2024-01-01T10:01:00Z"))
    assert len(bars_from_market_frame(frame, as_of=utc("2024-01-02T00:00:00Z"))) == 1
