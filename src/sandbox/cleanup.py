"""Safe cleanup for runner-owned trees containing read-only frozen inputs."""

from __future__ import annotations

import os
import shutil
import stat
from pathlib import Path


def remove_runner_tree(root: str | Path) -> None:
    target = Path(root)
    if not target.exists():
        return

    def make_writable(function, path, excinfo):
        try:
            os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
            function(path)
        except OSError:
            raise excinfo

    shutil.rmtree(target, onexc=make_writable)
