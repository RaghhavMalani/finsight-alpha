"""Publication permissions, immutable links, and retained scheduled attempt history."""

from copy import deepcopy
from hashlib import sha256
import json
import sqlite3
import pytest
import pyarrow.parquet as pq
import pyarrow as pa
from finsight.plugins import RunRegistry
from finsight.plugins.replay import source_permissions, projection
from tests.plugins.test_platform import platform, MeanModel, ROOT


def test_publication_permission_does_not_trust_vendor_first_party_labels():
    for source in ("alpaca:iex", "yfinance", "nse:india-vix", "made-up"):
        with pytest.raises(PermissionError):
            source_permissions(
                {
                    "source_lineage": [
                        {
                            "source": source,
                            "licence": "FIRST_PARTY",
                            "version": "invented",
                        }
                    ]
                },
                ROOT,
            )


def test_dirty_computation_cannot_publish(platform, monkeypatch):
    import finsight.plugins.dependencies as runner_module

    original = runner_module.execution_provenance
    monkeypatch.setattr(
        runner_module,
        "execution_provenance",
        lambda *args: {**original(*args), "dirty_computation": True},
    )
    _, registry, runner, kwargs = platform
    result = runner.run(MeanModel, **kwargs, scope="SYNTHETIC_REFERENCE")
    with pytest.raises(ValueError):
        projection(registry, "a", result["run_id"], allowed_outputs={"momentum_signal"})


def test_registry_restoration_retains_all_attempts_openings_and_failures(
    platform, tmp_path
):
    _, registry, runner, kwargs = platform
    first = runner.run(MeanModel, **kwargs)
    runner.run(MeanModel, **kwargs)
    runner.run(MeanModel, **kwargs, candidates=[{"offset": 0.01}])
    snapshot = registry.snapshot("a")
    fresh = RunRegistry(tmp_path / "restored.sqlite")
    fresh.restore("a", snapshot)
    assert fresh.snapshot("a") == snapshot
    assert fresh.opening_count("a") == 2
    assert fresh.read("b", first["run_id"]) is None
    for family in ("runs", "events"):
        corrupt = deepcopy(snapshot)
        if family == "runs":
            corrupt[family][0]["metrics"]["mse"] = 0.0
        else:
            corrupt[family][0]["tenant_id"] = "b"
        broken = RunRegistry(tmp_path / (family + ".sqlite"))
        with pytest.raises(ValueError):
            broken.restore("a", corrupt)
        assert broken.events("a") == []


def test_artifact_binding_append_only_and_tenant_scoped(platform):
    _, registry, runner, kwargs = platform
    result = runner.run(MeanModel, **kwargs)
    entry = {"url": "/artifacts/replay/test.json", "sha256": "a" * 64, "bytes": 4}
    registry.artifact("a", result["run_id"], entry)
    registry.artifact("a", result["run_id"], entry)
    assert sum(e["event"] == "ARTIFACT_PUBLISHED" for e in registry.events("a")) == 1
    assert registry.read("a", result["run_id"]) == result
    with pytest.raises(ValueError):
        registry.artifact("a", result["run_id"], {**entry, "sha256": "b" * 64})
    with pytest.raises(ValueError):
        registry.artifact("b", result["run_id"], entry)


def test_holdout_index_deletion_cannot_erase_access(platform):
    _, registry, runner, kwargs = platform
    result = runner.run(MeanModel, **kwargs)
    with sqlite3.connect(registry.path) as db:
        db.execute("DELETE FROM openings")
    with pytest.raises(ValueError):
        registry.holdout("a", result["run_id"], "same", "attack")
    assert registry.opening_count("a") == 1


def test_parquet_substitution_fails_closed(platform):
    store, _, _, kwargs = platform
    path = next(store.root.glob("parquet/*/*.parquet"))
    records = pq.read_table(path).to_pylist()
    records[0]["value"] = "1234"
    pq.write_table(pa.Table.from_pylist(records), path)
    with pytest.raises(ValueError):
        store.history("a", as_of=kwargs["as_of"])
