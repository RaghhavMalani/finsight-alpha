"""Admitted-store fixtures. Synthetic controls here are test-only, never Replay."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from finsight.plugins import RunRegistry, Signal, SignalStore, SeriesRunner
from src.truth.contracts import canonical_hash

ROOT = Path(__file__).resolve().parents[2]
TENANT = "regime-test"


def admit(store, rows, *, source_version="source-v1"):
    """Append rows with Data-Organ-shaped admission bindings."""
    admission = canonical_hash([r.identity for r in rows])
    bindings = [
        {
            "signal_id": r.identity,
            "signal_sha256": canonical_hash(r.payload()),
            "admission_id": admission,
            "admission_seal": canonical_hash(["seal", admission]),
            "source_version_id": r.version,
            "capture_sha256": canonical_hash(["capture", r.version]),
            "schema_hash": canonical_hash(["schema"]),
            "licence_resolution_hash": canonical_hash(["licence"]),
        }
        for r in rows
    ]
    return store.append(rows[0].tenant_id, rows, admissions=bindings)


def series_rows(
    values,
    *,
    name="mkt",
    asset="US-MKT",
    start="2020-01-01",
    available=None,
    version="capture-1",
    tenant=TENANT,
    licence="ACTIVE",
    source="unit:factor-capture",
):
    clocks = pd.bdate_range(start, periods=len(values), tz="UTC")
    rows = []
    for clock, value in zip(clocks, values):
        rows.append(
            Signal(
                tenant,
                name,
                asset,
                float(value),
                clock.to_pydatetime(),
                (pd.Timestamp(available) if available else clock).to_pydatetime(),
                source,
                licence,
                version,
                unit="proportional_return",
            )
        )
    return rows


@pytest.fixture
def series_platform(tmp_path):
    store = SignalStore(tmp_path / "signals")
    registry = RunRegistry(tmp_path / "runs.sqlite")
    return store, registry, SeriesRunner(store, registry, root=ROOT)


@pytest.fixture
def returns():
    rng = np.random.default_rng(7)
    return rng.normal(0.0003, 0.01, 400)


def pre_phase5_manifest(target):
    """The checked Replay pointer without Phase 5 entries, for an isolated test publication.

    The committed pointer carries real sealed regimes routes whose artifacts are
    not copied into a test directory.
    """
    import json

    manifest = json.loads((ROOT / "frontend-v2/public/replay-manifest.json").read_bytes())
    manifest["artifacts"] = {
        k: v for k, v in manifest["artifacts"].items() if not k.startswith("regimes:")
    }
    manifest["routes"] = {
        k: v for k, v in manifest["routes"].items() if not k.startswith("/regimes/")
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(manifest, indent=1, sort_keys=True))
