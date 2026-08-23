from __future__ import annotations

import numpy as np
import pandas as pd

from src.ml.signal_features import create_signal_research_features
from src.ml.walk_forward import time_series_train_test_split


def _prices(rows: int = 360) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    close = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, rows)))
    return pd.DataFrame(
        {
            "Date": pd.date_range("2024-01-01", periods=rows, freq="D"),
            "Open": close * 0.999,
            "High": close * 1.01,
            "Low": close * 0.99,
            "Close": close,
            "Volume": rng.integers(10_000, 20_000, rows),
        }
    )


def test_future_volatility_cannot_relabel_past_regimes() -> None:
    original = _prices()
    shocked = original.copy()
    future = shocked.index >= 300
    shocked.loc[future, "Close"] *= np.where(np.arange(future.sum()) % 2, 0.5, 1.8)

    first = create_signal_research_features(original)
    second = create_signal_research_features(shocked)

    assert (
        first.loc[:299, "volatility_regime"].tolist()
        == second.loc[:299, "volatility_regime"].tolist()
    )


def test_chronological_split_purges_horizon_and_applies_embargo() -> None:
    frame = pd.DataFrame({"feature": range(100), "target": range(100)})
    x_train, x_test, _, _ = time_series_train_test_split(
        frame,
        ["feature"],
        "target",
        test_size=0.2,
        target_horizon=5,
        embargo=2,
    )

    assert x_train.index.max() == 74
    assert x_test.index.min() == 82
