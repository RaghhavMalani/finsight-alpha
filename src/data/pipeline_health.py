"""Durable ingestion-run recording and tenant-scoped health summaries."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, text

from src.auth.db import get_session
from src.auth.tenant_models import IngestionRun
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


def _set_tenant(session, organization_id: int) -> None:
    if session.bind and session.bind.dialect.name == "postgresql":
        session.execute(
            text("SELECT set_config('app.organization_id', :org, true)"),
            {"org": str(organization_id)},
        )


def record_run(
    *, organization_id: int, pipeline_key: str, status: str,
    rows_received: int = 0, metrics: dict | None = None, error: str | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    try:
        with get_session() as session:
            _set_tenant(session, organization_id)
            run = IngestionRun(
                organization_id=organization_id,
                pipeline_key=pipeline_key,
                status=status.lower(),
                started_at=now,
                completed_at=now,
                rows_received=max(0, int(rows_received)),
                error_type="upstream_unavailable" if error else None,
                error_message=error,
                metrics=metrics or {},
            )
            session.add(run)
            session.commit()
            session.refresh(run)
            return {"status": "RECORDED", "run_id": run.id}
    except Exception as exc:
        logger.exception("Failed to record pipeline run for %s", pipeline_key)
        return {"status": "UNAVAILABLE", "reason": str(exc)}


def latest_runs(organization_id: int) -> list[dict]:
    with get_session() as session:
        _set_tenant(session, organization_id)
        rows = session.scalars(
            select(IngestionRun)
            .where(IngestionRun.organization_id == organization_id)
            .order_by(IngestionRun.pipeline_key, IngestionRun.completed_at.desc(), IngestionRun.id.desc())
        ).all()
    latest: dict[str, IngestionRun] = {}
    for row in rows:
        latest.setdefault(row.pipeline_key, row)
    return [
        {
            "pipeline": row.pipeline_key,
            "status": row.status.upper(),
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
            "rows_received": row.rows_received,
            "error": row.error_message,
            "metrics": row.metrics,
        }
        for row in latest.values()
    ]
