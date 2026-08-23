from __future__ import annotations

from src.execution.workers.external import ExternalWorkerSpec, execute_external
from src.execution.workers.protocol import serve


SPEC = ExternalWorkerSpec("hftbacktest", "hftbacktest", "finsight_hftbacktest_worker_backend")


if __name__ == "__main__":
    raise SystemExit(serve(SPEC.engine_id, lambda request: execute_external(SPEC, request)))
