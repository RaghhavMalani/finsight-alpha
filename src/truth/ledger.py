"""Durable analysis-run and forecast issuance ledgers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from src.auth.db import get_session
from src.auth.tenant_models import AnalysisRun, ForecastSignal
from src.data.license_policy import _set_tenant


def _datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def record_analysis_run(
    *,
    organization_id: int,
    user_id: int,
    truth: dict[str, Any],
    result: dict[str, Any],
) -> dict[str, Any]:
    """Idempotently persist a versioned computation result."""

    with get_session() as session:
        _set_tenant(session, organization_id)
        existing = session.scalar(
            select(AnalysisRun).where(
                AnalysisRun.organization_id == organization_id,
                AnalysisRun.run_id == truth["run_id"],
            )
        )
        if existing is None:
            existing = AnalysisRun(
                organization_id=organization_id,
                user_id=user_id,
                run_id=truth["run_id"],
                analysis_type=truth["calculation"],
                epistemic_state=truth["state"],
                as_of=_datetime(truth["as_of"]),
                data_version=truth["data_version"],
                calculation_version=truth["calculation_version"],
                input_hash=truth["input_hash"],
                result_json=result,
            )
            session.add(existing)
            session.commit()
        return {"id": existing.id, "run_id": existing.run_id, "status": "RECORDED"}


def record_forecast_signal(
    *,
    organization_id: int,
    user_id: int,
    ticker: str,
    horizon_days: int,
    truth: dict[str, Any],
    probability_up: float | None,
    signal_label: str | None,
) -> dict[str, Any]:
    """Record a forecast at issue time so it can be scored after its horizon."""

    signal_date = _datetime(f"{truth['signal_date']}T23:59:59Z")
    executable_from = _datetime(truth["executable_from"])
    with get_session() as session:
        _set_tenant(session, organization_id)
        existing = session.scalar(
            select(ForecastSignal).where(
                ForecastSignal.organization_id == organization_id,
                ForecastSignal.ticker == ticker,
                ForecastSignal.signal_date == signal_date,
                ForecastSignal.horizon_days == horizon_days,
                ForecastSignal.model_version == truth["model_version"],
            )
        )
        if existing is None:
            existing = ForecastSignal(
                organization_id=organization_id,
                user_id=user_id,
                ticker=ticker,
                signal_date=signal_date,
                executable_from=executable_from,
                horizon_days=horizon_days,
                model_version=truth["model_version"],
                data_version=truth["data_version"],
                probability_up=probability_up,
                signal_label=signal_label,
                status="issued",
            )
            session.add(existing)
            session.commit()
        return {"id": existing.id, "status": existing.status.upper()}
