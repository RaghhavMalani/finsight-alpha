import stat
from types import SimpleNamespace

import pytest

from src.sandbox import cleanup


def test_removes_runner_tree_with_frozen_input(tmp_path):
    root = tmp_path / "runner"
    root.mkdir()
    frozen = root / "input.json"
    frozen.write_text("{}")
    frozen.chmod(stat.S_IREAD)
    cleanup.remove_runner_tree(root)
    assert not root.exists()
    cleanup.remove_runner_tree(root)


@pytest.mark.parametrize("version", [(3, 10), (3, 11), (3, 12)])
@pytest.mark.parametrize("retry_fails", [False, True])
def test_cleanup_callback_contracts(tmp_path, monkeypatch, version, retry_fails):
    original = PermissionError("read-only input")
    calls = []

    def retry(path):
        calls.append(path)
        if retry_fails:
            raise OSError("retry failed")

    def legacy_rmtree(path, *, onerror):
        onerror(retry, path, (PermissionError, original, None))

    def modern_rmtree(path, *, onexc):
        onexc(retry, path, original)

    monkeypatch.setattr(cleanup, "sys", SimpleNamespace(version_info=version))
    monkeypatch.setattr(cleanup.os, "chmod", lambda *args: None)
    monkeypatch.setattr(
        cleanup.shutil, "rmtree",
        modern_rmtree if version >= (3, 12) else legacy_rmtree,
    )
    if retry_fails:
        with pytest.raises(PermissionError) as caught:
            cleanup.remove_runner_tree(tmp_path)
        assert caught.value is original
    else:
        cleanup.remove_runner_tree(tmp_path)
    assert calls == [tmp_path]
