"""Singular prior windows must not misalign descriptive attribution rows."""

import numpy as np
import pandas as pd
import pytest

from src.regimes.factors import diagnose


def test_decomposition_keeps_exact_observations_when_singular_windows_are_skipped():
    rng = np.random.default_rng(74)
    n = 240
    control = rng.normal(0, 0.01, n)
    control[80:150] = 0
    target = rng.normal(0, 0.01, n)
    frame = pd.DataFrame({
        "observed_at": pd.date_range("2020-01-01", periods=n, tz="UTC"),
        "mom": target,
        "mkt": control,
    })
    result = diagnose(frame, "mom", ["mkt"], window=60, minimum=60)
    rows = result["decomposition"]["tail"]
    assert 0 < len(rows) < n - 60
    expected = dict(zip(frame.observed_at.map(lambda t: t.isoformat()), target))
    for row in rows:
        assert row["raw"] == expected[row["observed_at"]]
        assert row["raw"] == pytest.approx(row["explained"] + row["residual"], abs=1e-12)
    sums = result["decomposition"]["cumulative"]
    assert sums["raw"] == pytest.approx(sum(expected[row["observed_at"]] for row in rows))
    assert sums["raw"] == pytest.approx(sums["explained"] + sums["residual"], abs=1e-12)
