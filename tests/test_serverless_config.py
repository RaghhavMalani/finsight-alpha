"""Regression checks for the Vercel serverless deployment contract."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def test_vercelignore_only_excludes_root_data_directory() -> None:
    rules = (PROJECT_ROOT / ".vercelignore").read_text(encoding="utf-8").splitlines()
    assert "/data/" in rules
    assert "data/" not in rules
    assert "/legacy-frontend/" not in rules


def test_vercel_import_uses_writable_runtime_data_dir(tmp_path: Path) -> None:
    env = os.environ.copy()
    env["VERCEL"] = "1"
    env["FINSIGHT_DATA_DIR"] = str(tmp_path)
    env.pop("DATABASE_URL", None)

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from backend.main import app; "
                "from src import config; "
                "from src.auth import db; "
                "assert config.DATA_DIR.exists(); "
                "assert config.DATA_DIR.as_posix() in db._URL; "
                "print(app.title, flush=True); "
                "__import__('os')._exit(0)"
            ),
        ],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "FinSight Alpha API" in result.stdout
