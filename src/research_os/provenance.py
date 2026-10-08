"""Actual code/dependency identity and narrow fixed-vintage factor adapter."""
from __future__ import annotations
import importlib.metadata
import platform
from pathlib import Path
import subprocess
from src.eval.canonical import canonical_sha256
from src.truth.contracts import dataframe_hash
from src.replay.factors import load_factor_series
from .contracts import DatasetSnapshot


def environment() -> dict:
    names = ("numpy", "scipy", "pandas", "statsmodels", "scikit-learn", "hmmlearn", "pydantic")
    return {"python": platform.python_version(), "platform": platform.platform(),
            "dependencies": {n: importlib.metadata.version(n) for n in names}}


def code_identity(root: Path) -> tuple[str, str]:
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    paths = ["src/research_os", "src/eval/canonical.py", "src/truth/contracts.py",
        "src/replay/factors.py", "src/regime/hmm_regime.py", "src/dynamics/market_regime.py",
        "src/dynamics/market_regime_inputs.py", "src/regime_intelligence/french.py", "pyproject.toml"]
    dirty = subprocess.check_output(["git", "status", "--porcelain", "--", *paths], cwd=root, text=True)
    if dirty.strip():
        raise ValueError("Research execution requires committed computation code")
    files = sorted(p for directory in paths for p in ((root / directory).rglob("*.py")
        if (root / directory).is_dir() else [root / directory]) if p.is_file())
    from src.eval.canonical import sha256_bytes
    return commit, canonical_sha256({p.relative_to(root).as_posix(): sha256_bytes(p.read_bytes()) for p in files})


def factor_snapshot(root: Path, country: str, cutoff: str):
    series = load_factor_series(root, country, cutoff)
    p = series.provenance
    snapshot = DatasetSnapshot(country=country, label="market factor, not a ticker",
        content_sha256=dataframe_hash(series.frame), source_sha256=tuple(p["raw_snapshot_ids"]),
        source_urls=tuple(p["source_urls"]), source_available_at=p["latest_availability"],
        latest_observation=p["latest_observation"], input_cutoff=cutoff, evidence_mode="CAPTURE_ONLY",
        disclosure="Fixed revised snapshot. Observation-sequence analysis, no historical-vintage PIT; no investable or alpha claim.")
    return series, snapshot
