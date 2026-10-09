"""One-time checked reference extraction from the existing D0.4.2 synthetic world."""

from hashlib import sha256
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.dynamics.market_regime_fixture import demo_world
from src.dynamics.market_regime import volatility_path


if __name__ == "__main__":
    target = ROOT / "eval/plugins/nervous-system-v0.1/pit-fixture.json"
    if target.exists():
        raise SystemExit("Checked fixture already exists; no silent regeneration")
    world = demo_world(sessions=240)
    returns = [None] + [
        b.close / a.close - 1 for a, b in zip(world.daily, world.daily[1:])
    ]
    volatility = volatility_path(returns, world.annual_sessions)
    rows = [
        {
            "observed_at": b.observed_at.isoformat(),
            "available_at": b.available_at.isoformat(),
            "market_return": returns[i],
            "volatility": volatility[i]["components"]["realized_vol"],
            "factor_mkt": world.factors[i].values["MKT"],
            "factor_available_at": world.factors[i].available_at.isoformat(),
        }
        for i, b in enumerate(world.daily)
        if volatility[i]["components"].get("realized_vol") is not None
    ]
    value = {
        "schema_version": "plugin-pit-fixture/1",
        "scope": "SYNTHETIC_REFERENCE",
        "as_of": rows[-1]["available_at"],
        "source": "project:nervous-fixture",
        "licence": "FIRST_PARTY",
        "seed": 642011,
        "origin": "src.dynamics.market_regime_fixture.demo_world(sessions=240); existing engineering reference, not financial observations",
        "origin_source_sha256": sha256(
            (ROOT / "src/dynamics/market_regime_fixture.py").read_bytes()
        ).hexdigest(),
        "rows": rows,
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(
        (
            json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
            + "\n"
        ).encode()
    )
    print(f"Checked reference extracted: {len(rows)} return-only rows")
