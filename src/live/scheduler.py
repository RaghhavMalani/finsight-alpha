"""Asyncio feed scheduler: cadence with jitter, exponential backoff, rate limit, health.

Stdlib only. Each feed runs in its own task; blocking fetches go to a worker
thread. A feed with a missing key is never polled and reports UNAVAILABLE.
"""

from __future__ import annotations

import asyncio
import random
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Awaitable, Callable

from . import model
from .feeds.base import Feed

DOWN_AFTER = 3  # consecutive failures before a feed is DOWN
WINDOW = 20  # attempts in the error-rate window
DEGRADED_ERROR_RATE = 0.25  # a recovering feed stays DEGRADED until its window error rate falls below this
BACKOFF_BASE_S = 30.0
MAX_BACKOFF_S = 3600.0
JITTER = 0.1


@dataclass
class FeedState:
    feed: Feed
    status: str = "STARTING"
    reason: str | None = None
    attempts: int = 0
    failures: int = 0
    consecutive_failures: int = 0
    window: deque = field(default_factory=lambda: deque(maxlen=WINDOW))
    last_attempt_at: datetime | None = None
    last_success_at: datetime | None = None
    last_error: str | None = None
    next_due_at: datetime | None = None
    rows_last: int = 0
    rows_new_last: int = 0
    rejected_last: int = 0
    partial_errors: list[str] = field(default_factory=list)

    def snapshot(self, now: datetime) -> dict:
        f = self.feed
        rate = (sum(1 for ok in self.window if not ok) / len(self.window)) if self.window else None
        return {
            "feed": f.name, "status": self.status, "reason": self.reason,
            "event_type": f.event_type, "cadence_s": f.cadence_s, "min_interval_s": f.min_interval_s,
            "delay": f.delay, "confidence": f.confidence,
            "licence": {"status": f.licence.get("status"), "redistribution": f.licence.get("redistribution"),
                        "terms_url": f.licence.get("terms_url")},
            "attempts": self.attempts, "failures": self.failures,
            "consecutive_failures": self.consecutive_failures,
            "error_rate": round(rate, 4) if rate is not None else None,
            "last_attempt_at": model.iso(self.last_attempt_at) if self.last_attempt_at else None,
            "last_success_at": model.iso(self.last_success_at) if self.last_success_at else None,
            "lag_s": round((now - self.last_success_at).total_seconds(), 3) if self.last_success_at else None,
            "last_error": self.last_error, "partial_errors": list(self.partial_errors),
            "next_due_at": model.iso(self.next_due_at) if self.next_due_at else None,
            "rows_last": self.rows_last, "rows_new_last": self.rows_new_last, "rejected_last": self.rejected_last,
        }


def success_delay(feed: Feed, rng: random.Random) -> float:
    return max(feed.min_interval_s, feed.cadence_s * (1 + rng.uniform(-JITTER, JITTER)))


def failure_delay(feed: Feed, consecutive: int, rng: random.Random, retry_after: float | None = None) -> float:
    """30 s, 60 s, 120 s, ... capped at min(cadence, 1 h), never below the rate limit or Retry-After."""
    cap = min(max(feed.cadence_s, BACKOFF_BASE_S), MAX_BACKOFF_S)
    raw = min(cap, BACKOFF_BASE_S * 2 ** max(consecutive - 1, 0))
    return max(feed.min_interval_s, retry_after or 0.0, raw * (1 + rng.uniform(0, JITTER)))


# on_result(feed, observations) -> (rows_new, rejected); on_health(snapshot)
ResultHook = Callable[[Feed, list], Awaitable[tuple[int, int]]]
HealthHook = Callable[[dict], Awaitable[None]]


class Scheduler:
    def __init__(self, feeds: list[Feed], *, on_result: ResultHook, on_health: HealthHook,
                 clock: Callable[[], datetime] = model.utcnow, rng: random.Random | None = None,
                 last_success: dict[str, datetime] | None = None, fetch_timeout_s: float = 120.0):
        self.states = {f.name: FeedState(f) for f in feeds}
        self.on_result, self.on_health = on_result, on_health
        self.clock, self.rng = clock, rng or random.Random()
        self.fetch_timeout_s = fetch_timeout_s
        self._tasks: list[asyncio.Task] = []
        now = clock()
        for state in self.states.values():
            reason = state.feed.unavailable_reason()
            if reason:
                state.status, state.reason = "UNAVAILABLE", reason
                continue
            previous = (last_success or {}).get(state.feed.name)
            state.last_success_at = previous
            # Respect cadence across restarts (e.g. CelesTrak at most once per two hours).
            due = previous + timedelta(seconds=state.feed.cadence_s) if previous else now
            stagger = timedelta(seconds=self.rng.uniform(0, min(10.0, state.feed.cadence_s * 0.05)))
            state.next_due_at = max(due, now) + stagger

    def health(self) -> list[dict]:
        now = self.clock()
        return [s.snapshot(now) for s in self.states.values()]

    async def run_once(self, name: str) -> dict:
        """One attempt for one feed: fetch, hand rows over, update health, schedule next."""
        state = self.states[name]
        feed = state.feed
        if state.status == "UNAVAILABLE":
            return state.snapshot(self.clock())
        state.attempts += 1
        state.last_attempt_at = self.clock()
        retry_after = None
        try:
            rows = await asyncio.wait_for(asyncio.to_thread(feed.fetch), self.fetch_timeout_s)
            new, rejected = await self.on_result(feed, rows)
        except Exception as error:  # noqa: BLE001 - any failure is a failed attempt, never a dead loop
            state.failures += 1
            state.consecutive_failures += 1
            state.window.append(False)
            state.last_error = (type(error).__name__ + ": " + str(error))[:300]
            retry_after = getattr(error, "retry_after", None)
            state.status = "DOWN" if state.consecutive_failures >= DOWN_AFTER else "DEGRADED"
            delay = failure_delay(feed, state.consecutive_failures, self.rng, retry_after)
        else:
            state.consecutive_failures = 0
            state.window.append(True)
            state.last_success_at = self.clock()
            state.rows_last, state.rows_new_last, state.rejected_last = len(rows), new, rejected
            state.partial_errors = list(getattr(feed, "partial_errors", []) or [])
            partial = bool(state.partial_errors) or rejected > 0
            rate = sum(1 for ok in state.window if not ok) / len(state.window)
            state.status = "DEGRADED" if partial or rate >= DEGRADED_ERROR_RATE else "UP"
            state.last_error = None if not partial else state.last_error
            delay = success_delay(feed, self.rng)
        state.next_due_at = self.clock() + timedelta(seconds=delay)
        snapshot = state.snapshot(self.clock())
        await self.on_health(snapshot)
        return snapshot

    async def _loop(self, name: str, stop: asyncio.Event) -> None:
        state = self.states[name]
        while not stop.is_set():
            wait = max(0.0, (state.next_due_at - self.clock()).total_seconds())
            try:
                await asyncio.wait_for(stop.wait(), timeout=wait)
                return
            except asyncio.TimeoutError:
                pass
            await self.run_once(name)

    async def start(self, stop: asyncio.Event) -> None:
        for state in self.states.values():
            if state.status == "UNAVAILABLE":
                await self.on_health(state.snapshot(self.clock()))
        self._tasks = [asyncio.create_task(self._loop(n, stop), name=f"live-feed-{n}")
                       for n, s in self.states.items() if s.status != "UNAVAILABLE"]

    async def wait(self) -> None:
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
