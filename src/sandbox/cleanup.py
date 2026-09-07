"""Safe cleanup for runner-owned trees containing read-only frozen inputs."""

from __future__ import annotations

import os
import shutil
import stat
import sys
from pathlib import Path


def remove_runner_tree(root: str | Path) -> None:
    target = Path(root)
    if not target.exists():
        return

    def make_writable(function, path, error):
        try:
            os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
            function(path)
        except OSError:
            raise error

    if sys.version_info >= (3, 12):
        shutil.rmtree(target, onexc=make_writable)
    else:
        # Python 3.10/3.11 supply sys.exc_info(), rather than the exception.
        def onerror(function, path, excinfo):
            make_writable(function, path, excinfo[1])

        shutil.rmtree(target, onerror=onerror)
