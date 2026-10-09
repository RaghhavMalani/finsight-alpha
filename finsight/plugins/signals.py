"""Reuse existing return transforms; prices remain in the local input boundary."""

from __future__ import annotations
import numpy as np
import pandas as pd
from src.regime.regime_features import calculate_rolling_returns
from .contracts import Signal, utc


def return_signals(frame, *, tenant_id, asset, source, licence, version):
    if not {"Date", "Close", "available_at"} <= set(frame):
        raise ValueError(
            "Local price transform needs both observation and publication clocks"
        )
    dates = pd.to_datetime(frame.Date, utc=True)
    available = pd.to_datetime(frame.available_at, utc=True)
    if (
        not dates.is_monotonic_increasing
        or dates.duplicated().any()
        or not np.isfinite(frame.Close).all()
        or (frame.Close <= 0).any()
    ):
        raise ValueError("Invalid chronological local price input")
    returns = calculate_rolling_returns(frame)
    result = []
    for i in range(1, len(frame)):
        result.append(
            Signal(
                tenant_id,
                "market_return",
                asset,
                float(returns.iloc[i].simple_return),
                dates.iloc[i].to_pydatetime(),
                max(available.iloc[i], available.iloc[i - 1]).to_pydatetime(),
                source,
                licence,
                version,
            )
        )
    return result
