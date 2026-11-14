"""Live spine: Server-Sent Events, feed health and a polling fallback.

Every event is a stored record (``live-observation/1``) carrying its provenance
and ``available_at``. Local only, like the other runtime routes: start it with
``python -m finsight live``; public visitors use checked Replay instead.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from src import config
from src.live import model, runtime

router = APIRouter(prefix="/live", tags=["live"])

NOT_RUNNING = "UNAVAILABLE: live spine not running (start it with `python -m finsight live`)"


def _gate(request: Request) -> None:
    if config.APP_ENV == "production":
        raise HTTPException(503, "Live spine is local only; public views use checked Replay")
    org = getattr(request.state, "organization_id", None)
    if type(org) is not int or org < 1 or not getattr(request.state, "user_id", None):
        raise HTTPException(401, "Authenticated organization required")


def _types(value: str | None) -> set[str] | None:
    if not value:
        return None
    wanted = {t.strip() for t in value.split(",") if t.strip()}
    unknown = wanted - set(model.EVENT_TYPES)
    if unknown:
        raise HTTPException(422, f"unknown event types {sorted(unknown)}; known: {list(model.EVENT_TYPES)}")
    return wanted


def _frame(event: dict) -> str:
    return f"id: {event['seq']}\nevent: {event['type']}\ndata: {model.canonical(event)}\n\n"


@router.get("/health")
def health(request: Request) -> dict:
    _gate(request)
    service = runtime.get_service()
    if service is None:
        return {"schema_version": "live-health/1", "mode": "NOT_RUNNING", "reason": NOT_RUNNING, "feeds": []}
    return service.health()


@router.get("/recent")
def recent(request: Request, type: str | None = None, since: str | None = None,
           limit: int = Query(200, ge=1, le=2000)) -> dict:
    """Polling fallback. ``since`` is a ``seq`` (digits) or an ISO ``available_at``."""
    _gate(request)
    service = runtime.get_service()
    if service is None:
        raise HTTPException(503, NOT_RUNNING)
    types = _types(type)
    after_seq = int(since) if since and since.isdigit() else None
    after_at = since if since and after_seq is None else None
    if after_at:
        try:
            model.parse_iso(after_at)
        except ValueError as error:
            raise HTTPException(422, f"since must be a seq or an ISO timestamp: {error}") from error
    if service.store is not None and service.mode == "online":
        events = service.store.since(after_at, types=types, limit=100000, after_seq=after_seq)
    else:
        events = service.bus.recent(types=types, after_seq=after_seq, limit=100000)
        if after_at:
            cutoff = model.parse_iso(after_at)
            events = [e for e in events if model.parse_iso(e["available_at"]) > cutoff]
    events = events[-limit:]
    return {"mode": service.mode, "count": len(events),
            "last_seq": events[-1]["seq"] if events else after_seq, "events": events}


@router.get("/stream")
async def stream(request: Request, type: str | None = None, since_seq: int | None = Query(None, ge=0),
                 max_events: int | None = Query(None, ge=1, le=100000),
                 heartbeat_s: float = Query(15.0, ge=0.05, le=60.0)) -> StreamingResponse:
    """SSE. Resumes after ``since_seq`` or ``Last-Event-ID``; an ``event: gap`` frame reports lost events."""
    _gate(request)
    service = runtime.get_service()
    if service is None:
        raise HTTPException(503, NOT_RUNNING)
    types = _types(type)
    header = request.headers.get("last-event-id")
    if since_seq is None and header and header.isdigit():
        since_seq = int(header)
    subscription = service.bus.subscribe(types=types)  # before the backlog, so nothing falls between

    def gap(reason: str, **counts) -> str:
        body = {"type": "gap", "reason": reason, **counts}
        return f"event: gap\ndata: {model.canonical(body)}\n\n"

    async def events():
        sent, last, dropped = 0, since_seq if since_seq is not None else -1, 0
        try:
            yield "retry: 5000\n\n"
            if since_seq is not None:
                backlog, first_held = service.backlog(since_seq, types)
                if first_held is not None:
                    yield gap("history before this seq is no longer held", missing_after_seq=since_seq,
                              first_available_seq=first_held)
                for event in backlog:
                    yield _frame(event)
                    last, sent = event["seq"], sent + 1
                    if max_events and sent >= max_events:
                        return
            while True:
                if await request.is_disconnected():
                    return
                event = await subscription.get(timeout=heartbeat_s)
                if subscription.dropped > dropped:
                    yield gap("client too slow; events dropped", dropped=subscription.dropped - dropped)
                    dropped = subscription.dropped
                if event is None:
                    yield ": keep-alive\n\n"
                    continue
                if event["seq"] <= last:
                    continue  # already sent from the backlog
                yield _frame(event)
                last, sent = event["seq"], sent + 1
                if max_events and sent >= max_events:
                    return
        finally:
            subscription.close()

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
