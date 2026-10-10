"""Cold scheduled runners retain sealed evidence and never invent a fallback."""

import json
import shutil
from pathlib import Path

from scripts import collect_data_organ as collector
from scripts.export_data_organ_replay import export

ROOT = Path(__file__).resolve().parents[2]


def test_missing_upstreams_retain_prior_evidence_and_export_is_idempotent(
    tmp_path, monkeypatch
):
    public = tmp_path / "public"
    directory = tmp_path / "derived"
    (public / "artifacts/replay").mkdir(parents=True)
    shutil.copyfile(
        ROOT / "frontend-v2/public/replay-manifest.json",
        public / "replay-manifest.json",
    )
    for source in (ROOT / "frontend-v2/public/artifacts/replay").glob(
        "data-organ-*.json"
    ):
        shutil.copyfile(source, public / "artifacts/replay" / source.name)
    shutil.copytree(ROOT / "data/exports/data_organ_v0_1", directory)
    prior = json.loads((directory / "receipt.json").read_bytes())
    original_health = json.loads((directory / "health.json").read_bytes())

    def unavailable(*args, **kwargs):
        raise ValueError(
            "UNAVAILABLE: provider/credential not available; test sabotage"
        )

    monkeypatch.setattr(collector.adapters, "factors", unavailable)
    monkeypatch.setattr(collector.adapters, "alfred", unavailable)
    monkeypatch.setattr(collector.adapters, "bls", unavailable)
    import dotenv

    monkeypatch.setattr(dotenv, "dotenv_values", lambda *_: {})
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    runtime = tmp_path / "runtime"
    service = collector.collect(runtime, network=True)
    assert len(service.registry.entries(collector.TENANT, "ATTEMPT_FAILED")) == 11
    assert not service.registry.entries(collector.TENANT, "SOURCE_VERSION")
    first = export(runtime, public, directory)
    assert first["model_runs"] == first["holdout_openings"] == 0
    assert json.loads((directory / "health.json").read_bytes()) == original_health
    coverage = json.loads((directory / "coverage.json").read_bytes())["items"]
    assert sum(r["status"] == "RETAINED" for r in coverage) == 4
    assert all(
        "retained evidence" in r["reason"]
        for r in coverage
        if r["status"] == "RETAINED"
    )
    assert first["source_versions"] == prior["source_versions"]
    before = {p.name: p.read_bytes() for p in directory.glob("*.json")}
    second = export(runtime, public, directory)
    assert second == first
    assert {p.name: p.read_bytes() for p in directory.glob("*.json")} == before
