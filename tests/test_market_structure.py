import numpy as np
import pandas as pd

from src.analytics.market_structure import analyze_market_structure


def _history(rows: int = 720) -> pd.DataFrame:
    rng = np.random.default_rng(17)
    dates = pd.bdate_range("2023-01-02", periods=rows)
    cycle = 0.0007 + 0.003 * np.sin(np.arange(rows) / 19)
    returns = cycle + rng.normal(0, 0.012, rows)
    close = 100 * np.exp(np.cumsum(returns))
    spread = 0.008 + rng.random(rows) * 0.009
    return pd.DataFrame(
        {
            "Date": dates,
            "Open": close * (1 + rng.normal(0, 0.002, rows)),
            "High": close * (1 + spread),
            "Low": close * (1 - spread),
            "Close": close,
            "Volume": rng.integers(1_000_000, 5_000_000, rows),
        }
    )


def test_market_structure_produces_levels_analogs_and_tail_anchors():
    result = analyze_market_structure(_history())

    assert result["sessions"] == 720
    assert result["structure"]["trend"] in {"BULL", "BEAR", "TRANSITION"}
    assert 0 <= result["structure"]["vol_percentile"] <= 1
    assert set(result["levels"]) == {"support", "resistance"}
    assert len(result["historical_analogs"]) >= 4
    assert len(result["major_moves"]["daily"]) == 12
    assert result["scenario_anchors"]["worst_day"] < 0
    assert "forward_20d" in result["analog_forward_distribution"]


def test_market_structure_rejects_short_history():
    short = _history(200)
    try:
        analyze_market_structure(short)
    except ValueError as exc:
        assert "260" in str(exc)
    else:
        raise AssertionError("short histories must be rejected")
