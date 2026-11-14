"""pytest configuration.

The mere presence of this file at the project root makes pytest insert the
project root onto ``sys.path``, so tests can ``import src.*`` without any extra
installation step.
"""

import os

# Under pytest-xdist each worker gets its own runtime data directory, so tests that create the
# SQLite app database or other runtime files never race another worker. Set before any import of
# src.config, which reads FINSIGHT_DATA_DIR once.
_worker = os.environ.get("PYTEST_XDIST_WORKER")
if _worker and os.environ.get("FINSIGHT_DATA_DIR"):
    os.environ["FINSIGHT_DATA_DIR"] = os.path.join(os.environ["FINSIGHT_DATA_DIR"], _worker)
    os.makedirs(os.environ["FINSIGHT_DATA_DIR"], exist_ok=True)
