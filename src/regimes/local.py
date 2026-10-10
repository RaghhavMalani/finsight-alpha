"""Local tier: SPY/QQQ/IWM from admitted Alpaca IEX evidence. Never public.

Sources keep their own clock conventions and are aligned on explicit session
dates: Alpaca daily bars end at the next New York midnight after session d;
French factor rows are stamped at session d (UTC). Returns exist only between
consecutive XNYS sessions, so a gap never becomes a multi-session "daily" return.
"""

from datetime import timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from finsight.plugins import SeriesInput, SeriesModel, SignalType

from .plugins import (
    RET,
    VOL,
    FactorDiagnostic,
    MomentumView,
    RegimeHMM2,
    RegimeHMM4,
    VolatilityDiagnostics,
)

NY = ZoneInfo("America/New_York")


def alpaca_session(stamps):
    return [(pd.Timestamp(t).tz_convert(NY).date() - timedelta(days=1)) for t in stamps]


def factor_session(stamps):
    return [pd.Timestamp(t).tz_convert("UTC").date() for t in stamps]


def xnys_sessions(start, end):
    import exchange_calendars as xcals

    return [
        d.date()
        for d in xcals.get_calendar("XNYS", start=str(start), end=str(end)).sessions_in_range(
            str(start), str(end)
        )
    ]


class AssetReturns(SeriesModel):
    name = "regimes.local.returns"
    version = "1"
    series_inputs = (SeriesInput("market_close", unit="USD", minimum=2),)
    outputs = (SignalType("last_return", "float", RET), SignalType("gap_count", "int"))
    derived_outputs = (SignalType("asset_return", "float", RET),)

    def compute(self, windows, context):
        frame = windows["market_close"]
        sessions = alpaca_session(frame.observed_at)
        calendar = xnys_sessions(min(sessions), max(sessions))
        position = {d: i for i, d in enumerate(calendar)}
        if any(d not in position for d in sessions):
            from finsight.plugins.series import SeriesUnavailable

            raise SeriesUnavailable("Admitted bar outside XNYS sessions; no remapping")
        returns, gaps = [], 0
        closes = frame.value.astype(float).tolist()
        for i in range(1, len(closes)):
            if position[sessions[i]] - position[sessions[i - 1]] == 1:
                returns.append([frame.observed_at.iloc[i].isoformat(), closes[i] / closes[i - 1] - 1])
            else:
                gaps += 1
        if not returns:
            from finsight.plugins.series import SeriesUnavailable

            raise SeriesUnavailable("No consecutive XNYS sessions")
        return {
            "status": "COMPUTED",
            "state_at": frame.observed_at.iloc[-1].isoformat(),
            "current": {"last_return": returns[-1][1], "gap_count": gaps},
            "diagnostics": {
                "definition": "Unadjusted IEX close-to-close return between consecutive XNYS sessions only",
                "gaps_skipped": gaps,
                "price_basis": "UNADJUSTED: dividends and corporate actions are not reconstructed",
                "feed": "IEX_ONLY",
            },
            "derived": {"asset_return": returns},
        }


class LocalVolatility(VolatilityDiagnostics):
    name = "regimes.local.volatility"
    return_input = "asset_return"
    series_inputs = (SeriesInput("asset_return", unit=RET, minimum=60),)


class LocalHMM2(RegimeHMM2):
    name = "regimes.local.hmm2"
    return_input = "asset_return"
    series_inputs = (
        SeriesInput("asset_return", unit=RET, minimum=120),
        SeriesInput("realized_vol_20", unit=VOL, minimum=120),
    )


class LocalHMM4(RegimeHMM4):
    name = "regimes.local.hmm4"
    return_input = "asset_return"
    series_inputs = (SeriesInput("asset_return", unit=RET, minimum=312),)


class LocalFactors(FactorDiagnostic):
    name = "regimes.local.factors"
    tier = "local"
    series_inputs = (
        SeriesInput("asset_return", unit=RET, minimum=60),
        SeriesInput("rf", unit=RET, role="factors", minimum=60),
        SeriesInput("mkt", unit=RET, role="factors", minimum=60),
        SeriesInput("smb", unit=RET, role="factors", minimum=60),
        SeriesInput("hml", unit=RET, role="factors", minimum=60),
        SeriesInput("mom", unit=RET, role="factors", minimum=60),
        SeriesInput("hmm2_state", kind="category", minimum=0),
    )

    def design(self, windows, target, controls):
        asset = windows["asset_return"]
        frame = pd.DataFrame(
            {"session": alpaca_session(asset.observed_at), "observed_at": asset.observed_at, "asset_return": asset.value.astype(float)}
        )
        for name in ["rf", *controls]:
            part = windows["factors." + name]
            frame = frame.merge(
                pd.DataFrame({"session": factor_session(part.observed_at), name: part.value.astype(float)}),
                on="session",
                how="inner",
            )
        frame["excess_return"] = frame.asset_return - frame.rf
        return frame.sort_values("observed_at").reset_index(drop=True)


class LocalMomentum(MomentumView):
    name = "regimes.local.momentum"
    return_input = "asset_return"
    mom_key = "factors.mom"
    signal_label = "12-1 asset momentum signal (unadjusted IEX closes)"
    series_inputs = (
        SeriesInput("asset_return", unit=RET, minimum=253),
        SeriesInput("mom", unit=RET, role="factors", minimum=0),
        SeriesInput("hmm2_state", kind="category", minimum=1),
    )

    def compute(self, windows, context):
        mom = windows["factors.mom"]
        by_session = dict(zip(factor_session(mom.observed_at), mom.value))
        asset = windows["asset_return"]
        aligned = pd.DataFrame(
            {
                "observed_at": asset.observed_at,
                "available_at": asset.available_at,
                "value": [by_session.get(s) for s in alpaca_session(asset.observed_at)],
            }
        ).dropna()
        return super().compute({**windows, "factors.mom": aligned}, context)


def bucket_bars(close, volume, *, minutes=30):
    """Aggregate admitted IEX minute bars into XNYS bucket closes (no invented minutes)."""
    import exchange_calendars as xcals

    frame = close.merge(
        volume.rename(columns={"value": "volume", "available_at": "volume_available"}),
        on="observed_at",
        how="inner",
    ).rename(columns={"value": "close"})
    local = frame.observed_at.dt.tz_convert(NY)
    days = sorted(set(local.dt.date))
    calendar = xcals.get_calendar("XNYS", start=str(days[0]), end=str(days[-1]))
    schedule = calendar.schedule.loc[str(days[0]) : str(days[-1])]
    opens = {d.date(): o for d, o in zip(schedule.index, schedule.open)}
    closes = {d.date(): c for d, c in zip(schedule.index, schedule.close)}
    rows = []
    for day, group in frame.groupby(local.dt.date):
        if day not in opens:
            continue
        start = opens[day]
        for _, bars in group.groupby(
            ((group.observed_at - start).dt.total_seconds() - 1) // (minutes * 60)
        ):
            end = start + pd.Timedelta(minutes=minutes) * (
                int(((bars.observed_at.iloc[-1] - start).total_seconds() - 1) // (minutes * 60)) + 1
            )
            end = min(end, closes[day])
            available = max(
                bars.available_at.max(), bars.volume_available.max(), end + pd.Timedelta(seconds=900)
            )
            rows.append(
                {
                    "observed_at": end.to_pydatetime(),
                    "available_at": available.to_pydatetime(),
                    "close": float(bars.close.iloc[-1]),
                    "volume": float(bars.volume.sum()),
                    "minutes": len(bars),
                }
            )
    return rows


class IntradaySeasonality(SeriesModel):
    name = "regimes.local.seasonality"
    version = "1"
    series_inputs = (
        SeriesInput("iex_bar_close", unit="USD", minimum=60),
        SeriesInput("iex_bar_volume", unit="shares", minimum=60),
    )
    outputs = (SignalType("sessions", "int"), SignalType("cells", "int"))

    def compute(self, windows, context):
        from src.dynamics.market_regime import seasonality
        from src.dynamics.market_regime_inputs import Bar, RegimeWorld

        buckets = bucket_bars(windows["iex_bar_close"], windows["iex_bar_volume"])
        sessions = len({b["observed_at"].astimezone(NY).date() for b in buckets})
        minimum = context["settings"]["issues"]["intraday_minimum_sessions"]
        world = RegimeWorld(
            schema_version="market-regime-input/0.4.2",
            id=context["asset"] + "-phase5-local",
            ticker=context["asset"],
            evidence_scope="PIT_LOCAL",
            source="alpaca:iex",
            revision="phase5-buckets",
            price_basis="UNADJUSTED",
            calendar_note="XNYS exchange-calendars sessions with explicit bounds; IEX only",
            bucket_minutes=30,
            session_minutes=390,
            daily=[],
            intraday=[
                Bar(observed_at=b["observed_at"], available_at=b["available_at"], close=b["close"], volume=b["volume"])
                for b in buckets
            ],
        )
        frozen = seasonality(world, pd.Timestamp(context["as_of"]).to_pydatetime())
        cells = []
        for cell in frozen["cells"]:
            metrics = {}
            for name, value in cell["metrics"].items():
                if name in {"spread", "liquidity", "event_intensity", "trade_intensity", "order_imbalance"}:
                    continue
                metrics["iex_volume" if name == "volume" else name] = value
            cells.append({**cell, "metrics": metrics})
        profile = self.profile(buckets)
        issues = []
        if sessions < minimum:
            issues.append(
                {
                    "kind": "INTRADAY_COVERAGE_LOW",
                    "severity": "MEDIUM",
                    "reason": f"{sessions} admitted IEX sessions < {minimum} profile minimum",
                }
            )
        return {
            "status": "PARTIAL" if sessions < minimum else "COMPUTED",
            "state_at": windows["iex_bar_close"].observed_at.iloc[-1].isoformat(),
            "current": {"sessions": sessions, "cells": len(cells)},
            "paths": {"cells": cells, "profile": profile},
            "diagnostics": {
                "baseline_rule": frozen["baseline_rule"],
                "vol_unit": frozen["vol_unit"],
                "volume_label": "IEX_ONLY: IEX venue volume, not consolidated US market volume",
                "unavailable_measures": "spread, liquidity, order imbalance, trade intensity and event intensity: no admitted quote/trade/event evidence",
                "significance": "None shown: descriptive cells only, so no multiple-testing family exists",
                "bucket_minutes": 30,
            },
            "issues": issues,
        }

    @staticmethod
    def profile(buckets):
        rows = []
        previous = {}
        for b in buckets:
            local = b["observed_at"].astimezone(NY)
            day = local.date()
            before = previous.get(day)
            r = b["close"] / before - 1 if before else None
            previous[day] = b["close"]
            rows.append((local.weekday(), local.strftime("%H:%M"), r, b["volume"]))
        groups = {}
        for weekday, bucket, r, volume in rows:
            groups.setdefault((weekday, bucket), []).append((r, volume))
        out = []
        for (weekday, bucket), values in sorted(groups.items()):
            returns = np.asarray([r for r, _ in values if r is not None], float)
            volume = np.asarray([v for _, v in values], float)

            def stats(data):
                if not len(data):
                    return {"n": 0}
                median = float(np.median(data))
                return {
                    "n": int(len(data)),
                    "mean": float(np.mean(data)),
                    "median": median,
                    "mad": float(np.median(np.abs(data - median))),
                    "p10": float(np.percentile(data, 10)),
                    "p90": float(np.percentile(data, 90)),
                }

            out.append(
                {
                    "weekday": weekday,
                    "bucket": bucket,
                    "return": stats(returns),
                    "absolute_return": stats(np.abs(returns)),
                    "iex_volume": stats(volume),
                }
            )
        return out


LOCAL_PLUGINS = {
    p.name: p
    for p in (
        AssetReturns,
        LocalVolatility,
        LocalHMM2,
        LocalHMM4,
        LocalFactors,
        LocalMomentum,
        IntradaySeasonality,
    )
}
