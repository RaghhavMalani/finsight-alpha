"""Wires store, bus, scheduler, Risk adapter and triggers into one live service.

Online: feeds -> store (stamps available_at) -> bus; each stored input also runs
the triggers, each health snapshot is stored and runs the Risk adapter, and their
outputs are stored and published the same way. Offline: recorded segments are
replayed onto the bus in stored order; nothing is fetched or written.

The bus only ever carries stored records, so the live stream and its replay are
the same sequence of the same bytes.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta

from . import model
from .bus import Bus
from .feeds import all_feeds
from .feeds.base import Feed
from .risk_live import LiveRisk
from .scheduler import Scheduler
from .store import LiveStore, StoreError
from .triggers import Triggers

logger = logging.getLogger("finsight.live")

_service: "LiveService | None" = None


def get_service() -> "LiveService | None":
    return _service


def set_service(service: "LiveService | None") -> None:
    global _service
    _service = service


class LiveService:
    def __init__(self, store: LiveStore | None, bus: Bus | None = None, feeds: list[Feed] | None = None,
                 *, mode: str = "online", risk: LiveRisk | None = None, triggers: Triggers | None = None,
                 clock=model.utcnow):
        self.store, self.bus, self.mode, self.clock = store, bus or Bus(), mode, clock
        self.feeds = feeds if feeds is not None else (all_feeds() if mode == "online" else [])
        self.risk = risk if risk is not None else (LiveRisk() if mode == "online" else None)
        self.triggers = triggers if triggers is not None else Triggers()
        self.scheduler: Scheduler | None = None
        self.replay_status: dict = {}
        self.started_at = clock()
        self._stop = asyncio.Event()
        self._tasks: list[asyncio.Task] = []

    # -- ingestion (also used directly by tests) ---------------------------
    def ingest(self, observations) -> tuple[list[dict], int]:
        """Append, publish, then run triggers on each new input. Returns (records, rejected)."""
        stored, rejected = [], 0
        for obs in observations:
            try:
                record = self.store.append(obs)
            except (StoreError, ValueError, TypeError, KeyError, AttributeError) as error:
                rejected += 1  # one bad row is rejected; it never poisons the rest of the batch
                logger.warning("live store rejected a row: %s", error)
                continue
            if record is None:
                continue
            self.bus.publish(record)
            stored.append(record)
            try:
                for suggestion in self.triggers.evaluate(record):
                    derived = self.store.append(suggestion)
                    if derived is not None:
                        self.bus.publish(derived)
            except (StoreError, ValueError, TypeError, KeyError) as error:
                logger.warning("research trigger failed on %s: %s", record["id"], error)
        return stored, rejected

    def record_health(self, snapshot: dict) -> dict | None:
        obs = model.Observation(
            type="feed.health", source="finsight:scheduler", source_id=snapshot["feed"],
            # One row per attempt per service run; a restart re-announces UNAVAILABLE feeds.
            revision=f"{model.iso(self.started_at)}:{snapshot['attempts']}:{snapshot['status']}",
            observed_at=model.iso(self.clock()), effective_at=None,
            licence=model.licence("INTERNAL_DERIVED", "FinSight Forge live scheduler",
                                  "https://github.com/RaghhavMalani/finsight-alpha", "PUBLIC"),
            confidence="DERIVED",
            provenance={"feed": "scheduler", "url": "internal:src/live/scheduler.py",
                        "fetched_at": model.iso(self.clock()),
                        "content_sha256": model.sha256_hex(model.canonical(snapshot)),
                        "parser": "live-health/1", "delay": "DERIVED: written after each feed attempt"},
            payload=snapshot,
        )
        record = self.store.append(obs)
        if record is None:
            return None
        self.bus.publish(record)
        if self.risk is not None:
            for alert in self.risk.evaluate(snapshot, record):
                stored = self.store.append(alert)
                if stored is not None:
                    self.bus.publish(stored)
        return record

    # -- scheduler hooks ---------------------------------------------------
    async def _on_result(self, feed: Feed, observations: list) -> tuple[int, int]:
        stored, rejected = self.ingest(observations)
        return len(stored), rejected

    async def _on_health(self, snapshot: dict) -> None:
        self.record_health(snapshot)

    def _last_successes(self) -> dict[str, datetime]:
        out: dict[str, datetime] = {}
        for record in self.store.since(None, types={"feed.health"}, limit=100000):
            at = record["payload"].get("last_success_at")
            if at:
                out[record["source_id"]] = model.parse_iso(at)
        return out

    # -- lifecycle -----------------------------------------------------------
    async def start(self) -> None:
        if self.mode == "online":
            for manifest in self.store.seal_closed_days():
                logger.info("sealed live day %s (%s rows)", manifest["day"], manifest["rows"])
            if self.risk is not None:
                self.risk.restore(self.store.records({"risk.alert"}))
            self.scheduler = Scheduler(self.feeds, on_result=self._on_result, on_health=self._on_health,
                                       clock=self.clock, last_success=self._last_successes())
            await self.scheduler.start(self._stop)
            self._tasks.append(asyncio.create_task(self._seal_loop(), name="live-seal"))
        else:
            self._tasks.append(asyncio.create_task(self.replay(), name="live-replay"))

    async def stop(self) -> None:
        self._stop.set()
        if self.scheduler:
            await self.scheduler.wait()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        if self.store is not None:
            self.store.close()

    def backlog(self, after_seq: int, types: set[str] | None = None) -> tuple[list[dict], int | None]:
        """Events after ``after_seq`` and, if some cannot be served, the first seq still held."""
        if self.store is not None and self.mode == "online":
            return self.store.since(None, types=types, after_seq=after_seq, limit=100000), None
        held = self.bus.recent(limit=1)
        events = self.bus.recent(types=types, after_seq=after_seq, limit=100000)
        first = self.bus.first_seq()
        return events, first if first is not None and held and first > after_seq + 1 else None

    async def _seal_loop(self) -> None:
        while not self._stop.is_set():
            now = self.clock()
            tomorrow = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), now.tzinfo)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=(tomorrow - now).total_seconds() + 5)
                return
            except asyncio.TimeoutError:
                try:
                    self.store.seal_closed_days()  # per-day failures land in store.seal_errors
                except Exception as error:  # noqa: BLE001 - the loop must survive to seal tomorrow
                    self.store.seal_errors["*"] = f"{type(error).__name__}: {error}"
                    logger.exception("live seal loop failed")

    async def replay(self, days: list[str] | None = None, *, speed: float = 60.0, max_gap_s: float = 2.0) -> int:
        """Publish recorded days in stored order, pacing gaps by ``speed`` (capped)."""
        days = days or sorted(set(self.store.sealed_days()) | set(self.store.days()))
        self.replay_status = {"days": days, "published": 0, "state": "RUNNING"}
        previous = None
        for day in days:
            for record in self.store.read_day(day):
                if self._stop.is_set():
                    return self.replay_status["published"]
                at = model.parse_iso(record["available_at"])
                if previous is not None and speed > 0:
                    await asyncio.sleep(min(max_gap_s, max(0.0, (at - previous).total_seconds() / speed)))
                previous = at
                self.bus.publish(record)
                self.replay_status["published"] += 1
        self.replay_status["state"] = "DONE"
        return self.replay_status["published"]

    def health(self) -> dict:
        feeds = self.scheduler.health() if self.scheduler else []
        return {
            "schema_version": "live-health/1", "mode": self.mode, "now": model.iso(self.clock()),
            "started_at": model.iso(self.started_at),
            "store": {"root_configured": True, "days": self.store.days() if self.store else [],
                      "sealed_days": self.store.sealed_days() if self.store else [],
                      "seal_errors": dict(self.store.seal_errors) if self.store else {}},
            "bus": {"subscribers": self.bus.subscribers},
            "feeds": feeds,
            "replay": self.replay_status or None,
            "risk_coverage": self.risk.coverage() if self.risk else None,
        }


async def start_from_env() -> LiveService | None:
    """Started by the API lifespan when ``FINSIGHT_LIVE`` is ``online`` or ``offline``."""
    mode = (os.getenv("FINSIGHT_LIVE") or "").strip().lower()
    if mode not in ("online", "offline"):
        return None
    names = {n.strip() for n in os.getenv("FINSIGHT_LIVE_FEEDS", "").split(",") if n.strip()} or None
    store = LiveStore(readonly=mode == "offline")  # replay never writes, so it never takes the writer lock
    service = LiveService(store, mode=mode, feeds=all_feeds(names) if mode == "online" else [])
    set_service(service)
    await service.start()
    logger.info("live spine started (%s) at %s", mode, store.root)
    return service


async def stop() -> None:
    service = get_service()
    if service is not None:
        await service.stop()
        set_service(None)
