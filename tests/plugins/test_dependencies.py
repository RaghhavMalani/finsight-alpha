"""Prospective identity sabotage; immutable v1 archives are never executed."""

import shutil

import pytest

from finsight.plugins.dependencies import manifest
from tests.plugins.test_platform import ROOT, MeanModel


def test_selected_engine_closure_and_unrelated_file(tmp_path, monkeypatch):
    import finsight.plugins.dependencies as module

    original = manifest(MeanModel, ROOT)
    for name in original["sources"]:
        source = ROOT / name.split("#")[0]
        target = tmp_path / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    monkeypatch.setattr(
        module.inspect,
        "getfile",
        lambda _: str(tmp_path / "tests/plugins/test_platform.py"),
    )
    before = manifest(MeanModel, tmp_path)
    (tmp_path / "src/unrelated_data_view.py").write_text("unrelated = 1\n")
    assert manifest(MeanModel, tmp_path) == before
    helper = tmp_path / "src/data/as_of.py"
    helper.write_bytes(helper.read_bytes() + b"\n# changed declared clock helper\n")
    assert manifest(MeanModel, tmp_path) != before
    assert "src/data_organ/service.py" not in before["sources"]


def test_unresolved_dynamic_import_fails_before_execution(monkeypatch):
    import finsight.plugins.dependencies as module

    monkeypatch.setattr(
        module.inspect,
        "getsource",
        lambda _: (
            "class MeanModel:\n def fit(self, rows):\n  __import__(self.config['module'])\n"
        ),
    )
    with pytest.raises(ValueError, match="Unresolved dynamic import"):
        manifest(MeanModel, ROOT)


def test_execution_head_does_not_reopen_holdout(platform, monkeypatch):
    import finsight.plugins.dependencies as module

    _, registry, runner, kwargs = platform
    first = runner.run(MeanModel, **kwargs)
    original = module.execution_provenance
    monkeypatch.setattr(
        module,
        "execution_provenance",
        lambda *args: {**original(*args), "commit": "f" * 40},
    )
    second = runner.run(MeanModel, **kwargs)
    assert second == first
    assert registry.opening_count("a") == 1
    bound = [e for e in registry.events("a") if e["event"] == "RUN_BOUND"]
    assert bound[-1]["payload"]["execution"]["commit"] == "f" * 40
