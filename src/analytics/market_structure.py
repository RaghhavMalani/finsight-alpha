"""Historical analogs, technical structure and major-move diagnostics."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


def _f(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _rsi(close: pd.Series, window: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / window, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / window, adjust=False).mean()
    return 100 - 100 / (1 + gain / loss.replace(0, np.nan))


def _atr(frame: pd.DataFrame, window: int = 14) -> pd.Series:
    previous = frame["Close"].shift(1)
    true_range = pd.concat(
        [
            (frame["High"] - frame["Low"]).abs(),
            (frame["High"] - previous).abs(),
            (frame["Low"] - previous).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return true_range.ewm(alpha=1 / window, adjust=False).mean()


def _cluster_levels(
    points: list[tuple[float, int]], current: float, tolerance: float = 0.015
) -> list[dict[str, Any]]:
    clusters: list[list[tuple[float, int]]] = []
    for price, index in sorted(points):
        if (
            not clusters
            or abs(price / np.mean([row[0] for row in clusters[-1]]) - 1) > tolerance
        ):
            clusters.append([(price, index)])
        else:
            clusters[-1].append((price, index))
    levels = []
    total = max(
        1, max((index for cluster in clusters for _, index in cluster), default=1)
    )
    for cluster in clusters:
        price = float(np.mean([row[0] for row in cluster]))
        last_index = max(row[1] for row in cluster)
        recency = last_index / total
        distance = price / current - 1
        score = len(cluster) * 0.55 + recency * 0.25 + 0.2 / (1 + abs(distance) * 20)
        levels.append(
            {
                "price": price,
                "distance_pct": distance,
                "touches": len(cluster),
                "recency_score": recency,
                "strength": score,
            }
        )
    return sorted(levels, key=lambda row: row["strength"], reverse=True)


def _pivot_levels(
    frame: pd.DataFrame, lookback: int = 504, order: int = 5
) -> dict[str, list[dict[str, Any]]]:
    sample = frame.tail(lookback).reset_index(drop=True)
    current = float(sample["Close"].iloc[-1])
    highs: list[tuple[float, int]] = []
    lows: list[tuple[float, int]] = []
    for index in range(order, len(sample) - order):
        high_window = sample["High"].iloc[index - order : index + order + 1]
        low_window = sample["Low"].iloc[index - order : index + order + 1]
        if sample["High"].iloc[index] >= high_window.max():
            highs.append((float(sample["High"].iloc[index]), index))
        if sample["Low"].iloc[index] <= low_window.min():
            lows.append((float(sample["Low"].iloc[index]), index))
    support = [row for row in _cluster_levels(lows, current) if row["price"] < current][
        :6
    ]
    resistance = [
        row for row in _cluster_levels(highs, current) if row["price"] > current
    ][:6]
    return {"support": support, "resistance": resistance}


def _forward_return(close: pd.Series, index: int, horizon: int) -> float | None:
    if index + horizon >= len(close):
        return None
    return float(close.iloc[index + horizon] / close.iloc[index] - 1)


def _analogs(
    features: pd.DataFrame, close: pd.Series, dates: pd.Series, count: int = 8
) -> list[dict[str, Any]]:
    columns = ["ret_5", "ret_20", "ret_60", "vol_20", "drawdown", "sma50_gap", "rsi_14"]
    clean = features[columns].replace([np.inf, -np.inf], np.nan).dropna()
    if len(clean) < 150:
        return []
    current_index = int(clean.index[-1])
    history = clean.loc[clean.index <= current_index - 65].copy()
    if history.empty:
        return []
    scale = history.std().replace(0, 1)
    distance = (((history - clean.loc[current_index]) / scale) ** 2).mean(axis=1) ** 0.5
    candidates = distance.sort_values()
    picked: list[int] = []
    for index in candidates.index:
        if all(abs(int(index) - chosen) > 45 for chosen in picked):
            picked.append(int(index))
        if len(picked) >= count:
            break
    out = []
    for index in picked:
        similarity = 1 / (1 + float(distance.loc[index]))
        out.append(
            {
                "date": str(dates.iloc[index])[:10],
                "price": _f(close.iloc[index]),
                "similarity": similarity,
                "forward_5d": _f(_forward_return(close, index, 5)),
                "forward_20d": _f(_forward_return(close, index, 20)),
                "forward_60d": _f(_forward_return(close, index, 60)),
                "state": {
                    column: _f(features.loc[index, column]) for column in columns
                },
            }
        )
    return out


def _major_moves(
    frame: pd.DataFrame, returns: pd.Series
) -> dict[str, list[dict[str, Any]]]:
    dates = pd.to_datetime(frame["Date"]).dt.strftime("%Y-%m-%d")
    daily = pd.DataFrame(
        {"date": dates, "return": returns, "close": frame["Close"]}
    ).dropna()
    daily["absolute"] = daily["return"].abs()
    daily_rows = [
        {
            "date": row.date,
            "return": _f(row.return_),
            "close": _f(row.close),
            "direction": "UP" if row.return_ > 0 else "DOWN",
        }
        for row in daily.rename(columns={"return": "return_"})
        .nlargest(12, "absolute")
        .itertuples()
    ]
    windows = []
    for horizon, label in ((5, "1W"), (21, "1M"), (63, "3M")):
        rolling = frame["Close"].pct_change(horizon)
        for direction, series in (
            ("UP", rolling.nlargest(3)),
            ("DOWN", rolling.nsmallest(3)),
        ):
            for index, value in series.items():
                if pd.isna(value):
                    continue
                windows.append(
                    {
                        "window": label,
                        "direction": direction,
                        "end_date": str(dates.iloc[index]),
                        "return": _f(value),
                    }
                )
    return {"daily": daily_rows, "windows": windows}


def analyze_market_structure(frame: pd.DataFrame) -> dict[str, Any]:
    """Translate an OHLCV history into levels, analogs and regime evidence."""
    if frame is None or frame.empty:
        raise ValueError("Market history is empty.")
    df = frame.copy().sort_values("Date").reset_index(drop=True)
    for column in ("Open", "High", "Low", "Close", "Volume"):
        df[column] = pd.to_numeric(df[column], errors="coerce")
    df = df.dropna(subset=["Close", "High", "Low"])
    if len(df) < 260:
        raise ValueError("At least 260 clean sessions are required.")

    close = df["Close"]
    returns = close.pct_change()
    features = pd.DataFrame(index=df.index)
    features["ret_5"] = close.pct_change(5)
    features["ret_20"] = close.pct_change(20)
    features["ret_60"] = close.pct_change(60)
    features["vol_20"] = returns.rolling(20).std() * math.sqrt(252)
    features["drawdown"] = close / close.cummax() - 1
    features["sma50_gap"] = close / close.rolling(50).mean() - 1
    features["rsi_14"] = _rsi(close)
    sma20 = close.rolling(20).mean()
    sma50 = close.rolling(50).mean()
    sma200 = close.rolling(200).mean()
    atr14 = _atr(df)
    current = float(close.iloc[-1])
    high52 = float(df["High"].tail(252).max())
    low52 = float(df["Low"].tail(252).min())
    latest_vol = float(features["vol_20"].iloc[-1])
    vol_history = features["vol_20"].dropna()
    vol_percentile = float((vol_history <= latest_vol).mean())
    trend = (
        "BULL"
        if current > sma50.iloc[-1] > sma200.iloc[-1]
        else "BEAR" if current < sma50.iloc[-1] < sma200.iloc[-1] else "TRANSITION"
    )
    cross = (
        "GOLDEN"
        if sma50.iloc[-1] > sma200.iloc[-1] and sma50.iloc[-6] <= sma200.iloc[-6]
        else (
            "DEATH"
            if sma50.iloc[-1] < sma200.iloc[-1] and sma50.iloc[-6] >= sma200.iloc[-6]
            else "NONE"
        )
    )
    pattern_flags = [
        {
            "pattern": "52W_HIGH_BREAKOUT",
            "active": current >= high52 * 0.99,
            "distance": current / high52 - 1,
        },
        {
            "pattern": "52W_LOW_TEST",
            "active": current <= low52 * 1.03,
            "distance": current / low52 - 1,
        },
        {
            "pattern": "VOLATILITY_EXPANSION",
            "active": vol_percentile >= 0.8,
            "percentile": vol_percentile,
        },
        {"pattern": "SMA_CROSS", "active": cross != "NONE", "state": cross},
        {
            "pattern": "RSI_OVERBOUGHT",
            "active": features["rsi_14"].iloc[-1] >= 70,
            "value": _f(features["rsi_14"].iloc[-1]),
        },
        {
            "pattern": "RSI_OVERSOLD",
            "active": features["rsi_14"].iloc[-1] <= 30,
            "value": _f(features["rsi_14"].iloc[-1]),
        },
    ]
    analogs = _analogs(features, close, df["Date"])
    analog_summary = {}
    for horizon in (5, 20, 60):
        values = [
            row[f"forward_{horizon}d"]
            for row in analogs
            if row[f"forward_{horizon}d"] is not None
        ]
        analog_summary[f"forward_{horizon}d"] = {
            "median": _f(np.median(values)) if values else None,
            "bull_probability": _f(np.mean(np.asarray(values) > 0)) if values else None,
            "worst": _f(min(values)) if values else None,
            "best": _f(max(values)) if values else None,
        }
    return {
        "as_of": str(df["Date"].iloc[-1])[:10],
        "sessions": len(df),
        "price": current,
        "structure": {
            "trend": trend,
            "sma20": _f(sma20.iloc[-1]),
            "sma50": _f(sma50.iloc[-1]),
            "sma200": _f(sma200.iloc[-1]),
            "rsi14": _f(features["rsi_14"].iloc[-1]),
            "atr14": _f(atr14.iloc[-1]),
            "atr_pct": _f(atr14.iloc[-1] / current),
            "ann_vol20": latest_vol,
            "vol_percentile": vol_percentile,
            "drawdown": _f(features["drawdown"].iloc[-1]),
            "high_52w": high52,
            "low_52w": low52,
            "position_52w": (
                _f((current - low52) / (high52 - low52)) if high52 > low52 else None
            ),
        },
        "levels": _pivot_levels(df),
        "patterns": pattern_flags,
        "historical_analogs": analogs,
        "analog_forward_distribution": analog_summary,
        "major_moves": _major_moves(df, returns),
        "scenario_anchors": {
            "one_day_99": _f(returns.quantile(0.01)),
            "one_week_99": _f(close.pct_change(5).quantile(0.01)),
            "one_month_99": _f(close.pct_change(21).quantile(0.01)),
            "worst_day": _f(returns.min()),
            "worst_month": _f(close.pct_change(21).min()),
        },
        "methodology": "Levels cluster local pivots; analogs match seven standardized price, trend, volatility and drawdown features with 45-session separation.",
    }
