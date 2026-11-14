"""In-process pub/sub for live events.

Publishing is thread-safe and never blocks: each async subscriber has a bounded
queue, and a slow subscriber loses its oldest events (counted in ``dropped``)
rather than stalling ingestion. A ring buffer backs ``/live/recent`` and lets an
SSE client resume from ``Last-Event-ID``.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from collections import deque
from typing import Callable

logger = logging.getLogger("finsight.live.bus")


class Subscription:
    def __init__(self, bus: "Bus", loop: asyncio.AbstractEventLoop, maxsize: int, types: set[str] | None):
        self._bus, self._loop, self.types = bus, loop, types
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self.dropped = 0

    def wants(self, event: dict) -> bool:
        return not self.types or event["type"] in self.types

    def _offer(self, event: dict) -> None:
        if self.queue.full():
            self.queue.get_nowait()
            self.dropped += 1
        self.queue.put_nowait(event)

    async def get(self, timeout: float | None = None) -> dict | None:
        try:
            return await asyncio.wait_for(self.queue.get(), timeout)
        except asyncio.TimeoutError:
            return None

    def close(self) -> None:
        self._bus._remove(self)


class Bus:
    def __init__(self, history: int = 2000):
        self._lock = threading.Lock()
        self._subs: list[Subscription] = []
        self._callbacks: list[Callable[[dict], None]] = []
        self._history: deque[dict] = deque(maxlen=history)

    def publish(self, event: dict) -> None:
        with self._lock:
            self._history.append(event)
            subs = list(self._subs)
            callbacks = list(self._callbacks)
        for sub in subs:
            if sub.wants(event):
                try:
                    sub._loop.call_soon_threadsafe(sub._offer, event)
                except RuntimeError:
                    self._remove(sub)  # its loop has closed
        for callback in callbacks:
            try:
                callback(event)
            except Exception:  # noqa: BLE001 - a listener must never break ingestion
                logger.exception("live bus listener failed")

    def subscribe(self, *, types: set[str] | None = None, maxsize: int = 1000) -> Subscription:
        sub = Subscription(self, asyncio.get_running_loop(), maxsize, types)
        with self._lock:
            self._subs.append(sub)
        return sub

    def on_event(self, callback: Callable[[dict], None]) -> None:
        with self._lock:
            self._callbacks.append(callback)

    def _remove(self, sub: Subscription) -> None:
        with self._lock:
            if sub in self._subs:
                self._subs.remove(sub)

    def recent(self, *, types: set[str] | None = None, after_seq: int | None = None,
               limit: int = 500) -> list[dict]:
        with self._lock:
            items = list(self._history)
        if types:
            items = [e for e in items if e["type"] in types]
        if after_seq is not None:
            items = [e for e in items if e["seq"] > after_seq]
        return items[-limit:]

    def first_seq(self) -> int | None:
        with self._lock:
            return self._history[0]["seq"] if self._history else None

    @property
    def subscribers(self) -> int:
        return len(self._subs)
