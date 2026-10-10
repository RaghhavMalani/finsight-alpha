"""Deterministic synthetic captures in the official file formats (test-only)."""

import io
import json
import zipfile
from hashlib import sha256

import numpy as np
import pandas as pd

from src.replay.factors import SOURCE_URLS


def garch_returns(n, *, seed=11, omega=0.02, alpha=0.08, beta=0.9, mu=0.03):
    """Percent returns from a known GARCH(1,1) world."""
    rng = np.random.default_rng(seed)
    variance = omega / (1 - alpha - beta)
    out = np.empty(n)
    shock = 0.0
    for t in range(n):
        variance = omega + alpha * shock**2 + beta * variance
        shock = np.sqrt(variance) * rng.standard_normal()
        out[t] = mu + shock
    return out


def _zip(name, text):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(name, text)
    return buffer.getvalue()


def write_receipt(directory, name, raw, captured_at):
    (directory / name).write_bytes(raw)
    (directory / (name + ".meta.json")).write_text(
        json.dumps(
            {
                "sha256": sha256(raw).hexdigest(),
                "source_url": SOURCE_URLS[name],
                "captured_at": captured_at,
            }
        )
    )


def write_factor_captures(
    directory,
    *,
    start="1999-06-01",
    end="2001-12-31",
    captured_at="2026-10-10T06:00:00Z",
    seed=5,
):
    import exchange_calendars as xcals

    directory.mkdir(parents=True, exist_ok=True)
    us_days = xcals.get_calendar("XNYS", start="1990-01-02").sessions_in_range(start, end)
    n = len(us_days)
    rng = np.random.default_rng(seed)
    mkt = garch_returns(n, seed=seed)
    smb, hml, mom = rng.normal(0, 0.5, (3, n))
    ff3 = ["Synthetic test capture in the French daily format", "", ",Mkt-RF,SMB,HML,RF"]
    momentum = ["Synthetic test capture", "", ",Mom"]
    for i, day in enumerate(us_days):
        stamp = day.strftime("%Y%m%d")
        ff3.append(f"{stamp},{mkt[i]:.2f},{smb[i]:.2f},{hml[i]:.2f},0.010")
        momentum.append(f"{stamp},{mom[i] + 0.1 * mkt[i]:.2f}")
    ff3 += ["", " Copyright synthetic"]
    write_receipt(directory, "french-ff3.zip", _zip("F-F_Research_Data_Factors_daily.CSV", "\n".join(ff3)), captured_at)
    write_receipt(directory, "french-mom.zip", _zip("F-F_Momentum_Factor_daily.CSV", "\n".join(momentum)), captured_at)
    india_days = pd.bdate_range(start, end)
    m = len(india_days)
    india = garch_returns(m, seed=seed + 1, omega=0.03)
    frame = pd.DataFrame(
        {
            "Date": india_days.strftime("%Y-%m-%d"),
            "SMB": rng.normal(0, 0.6, m).round(4),
            "HML": rng.normal(0, 0.6, m).round(4),
            "WML": rng.normal(0.05, 0.7, m).round(4),
            "MF": india.round(4),
            "RF": 0.02,
        }
    )
    write_receipt(directory, "iima-daily.csv", frame.to_csv(index=False).encode(), captured_at)
    return {"us_sessions": n, "india_rows": m}
