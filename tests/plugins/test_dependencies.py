"""Prospective identity sabotage; immutable v1 archives are never executed."""

import shutil
import subprocess

import pytest

from finsight.plugins.dependencies import manifest
from tests.plugins.test_platform import ROOT, MeanModel
from tests.plugins.test_platform import platform as platform


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
    helper.write_bytes(
        helper.read_bytes().replace(b"tzinfo is None", b"tzinfo is not None")
    )
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


@pytest.mark.parametrize(
    "statement",
    [
        "loader = __import__\n  loader(self.config['module'])",
        "loader = importlib.import_module\n  loader(self.config['module'])",
        "getattr(importlib, 'import_module')(self.config['module'])",
        "getattr(importlib, self.config['loader'])(self.config['module'])",
        "globals()['__import__'](self.config['module'])",
    ],
)
def test_aliased_dynamic_imports_fail_closed(monkeypatch, statement):
    import finsight.plugins.dependencies as module

    monkeypatch.setattr(
        module.inspect,
        "getsource",
        lambda _: "class MeanModel:\n def fit(self, rows):\n  " + statement + "\n",
    )
    with pytest.raises(ValueError, match="Unresolved dynamic import"):
        manifest(MeanModel, ROOT)


def test_real_unrelated_commit_preserves_calls_identity_and_openings(
    platform, tmp_path, monkeypatch
):
    import finsight.plugins.dependencies as module

    _, registry, runner, kwargs = platform
    checkout = tmp_path / "checkout"
    for name in manifest(MeanModel, ROOT)["sources"]:
        path = name.split("#")[0]
        target = checkout / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / path, target)

    def git(*args):
        return subprocess.check_output(["git", *args], cwd=checkout, text=True).strip()

    git("init", "-q")
    git("config", "user.name", "Identity test")
    git("config", "user.email", "identity@example.invalid")
    git("add", ".")
    git("commit", "-qm", "Declared computation")
    monkeypatch.setattr(
        module.inspect,
        "getfile",
        lambda _: str(checkout / "tests/plugins/test_platform.py"),
    )
    runner.root = checkout
    counts = {"fit": 0, "predict": 0}
    for name in counts:
        original = getattr(MeanModel, name)

        def counted(self, rows, _original=original, _name=name):
            counts[_name] += 1
            return _original(self, rows)

        monkeypatch.setattr(MeanModel, name, counted)
    first = runner.run(MeanModel, **kwargs)
    calls = dict(counts)
    assert calls["fit"] > 0 and calls["predict"] > 0
    (checkout / "src/unrelated_adapter.py").write_text("source = 'unrelated'\n")
    git("add", "src/unrelated_adapter.py")
    git("commit", "-qm", "Unrelated adapter")
    second = runner.run(MeanModel, **kwargs)
    assert second == first
    assert counts == calls
    assert registry.opening_count("a") == 1
    assert git("rev-parse", "HEAD") != first["execution"]["commit"]
