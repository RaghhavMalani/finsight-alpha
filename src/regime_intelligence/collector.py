"""Forward-only local receive evidence from the free Alpaca IEX WebSocket."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import time

from src.dynamics.market_regime_inputs import digest, utc
from src.regime_intelligence.contracts import ASSETS, Observation
from src.regime_intelligence.alpaca import NY

URL = "wss://stream.data.alpaca.markets/v2/iex"
MARKET_TYPES = {"t", "q", "b", "d", "u", "c", "x"}


def receive_datetime(ns: int) -> datetime:
    # Preserve exact nanoseconds in raw evidence; CEIL at the microsecond
    # datetime boundary so replay cannot admit a record before its receipt.
    return datetime.fromtimestamp(ns // 1_000_000_000, timezone.utc) + timedelta(
        microseconds=((ns % 1_000_000_000) + 999) // 1000
    )


def archive_frame(root: Path, frame: str, *, received_ns: int) -> list[dict]:
    messages = json.loads(frame)
    if not isinstance(messages, list):
        raise ValueError("Alpaca WebSocket frame must be a list")
    market = [m for m in messages if m.get("T") in MARKET_TYPES]
    if not market:
        return []  # Auth/subscription responses never enter the market archive.
    if any(m.get("S") not in ASSETS or not m.get("t") for m in market):
        raise ValueError("Unexpected symbol or missing provider timestamp")
    for message in market:
        utc(message["t"])
    raw_hash = hashlib.sha256(frame.encode("utf-8")).hexdigest()
    captured = receive_datetime(received_ns).isoformat()
    document = {
        "schema_version": "alpaca-iex-capture/1", "feed": "iex", "source": "ALPACA_IEX",
        "quality": "RECEIVE_TIMESTAMP_CAPTURED", "coverage": "IEX ONLY",
        "local_receive_ns": received_ns, "local_receive_at": captured,
        "capture_timestamp": captured, "raw_message": frame, "content_hash": raw_hash,
        "clock_note": "Local host UTC clock; no claim of provider capture-clock accuracy.",
        "messages": [{"symbol": m["S"], "provider_event_timestamp": m["t"],
                      "message_hash": digest(m), "message": m} for m in market],
    }
    capture_id = digest(document)
    directory = root / captured[:10]
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / (capture_id + ".json")
    if not target.exists():
        with target.open("x", encoding="utf-8") as handle:
            json.dump(document, handle, sort_keys=True, allow_nan=False)
    return [{**item, "capture_id": capture_id, "frame_hash": raw_hash,
             "received_ns": received_ns, "captured_at": captured} for item in document["messages"]]


def captured_bar(record: dict, calendar: dict) -> Observation | None:
    message = record["message"]
    # Daily bars are evolving partial-day updates, not completed sessions.
    # Updated bars/corrections stay in raw history; never rewrite original bars.
    if message["T"] != "b":
        return None
    start = utc(message["t"])
    day = start.astimezone(NY).date()
    end = start + timedelta(minutes=1)
    if day not in calendar or not calendar[day][0] <= start < end <= calendar[day][1]:
        return None
    received = receive_datetime(record["received_ns"])
    if received < end:
        raise ValueError("Received a bar before its completed interval")
    return Observation(
        stream="intraday", observed_at=end, available_at=received,
        as_of=record["captured_at"], source="ALPACA_IEX",
        revision="captured-message:" + record["message_hash"], quality="RECEIVE_TIMESTAMP_CAPTURED",
        publication_evidence=json.dumps({
            "capture_id": record["capture_id"], "content_hash": record["frame_hash"],
            "message_hash": record["message_hash"], "provider_event_timestamp": message["t"],
            "local_receive_ns": record["received_ns"], "coverage": "IEX ONLY",
        }, sort_keys=True),
        values={"open": message["o"], "high": message["h"], "low": message["l"],
                "close": message["c"], "volume": message["v"], "trade_count": message["n"]},
    )


def replay_captures(root: Path, *, asset: str, cutoff: str, calendar: dict) -> list[Observation]:
    """Rehydrate the first witnessed completed bar; receipt survives replay."""
    if asset not in ASSETS:
        raise ValueError("Unsupported capture asset")
    end = utc(cutoff)
    bars = {}
    for path in sorted(root.glob("*/*.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        if (document.get("feed") != "iex" or document.get("source") != "ALPACA_IEX"
                or document.get("quality") != "RECEIVE_TIMESTAMP_CAPTURED"
                or digest(document) != path.stem
                or hashlib.sha256(document["raw_message"].encode("utf-8")).hexdigest() != document["content_hash"]):
            raise ValueError("Local IEX capture integrity failed")
        received = receive_datetime(document["local_receive_ns"])
        if document["local_receive_at"] != received.isoformat() or document["capture_timestamp"] != received.isoformat():
            raise ValueError("Local receipt metadata changed")
        if received > end:
            continue
        raw_messages = json.loads(document["raw_message"])
        for item in document["messages"]:
            if item["message"] not in raw_messages or digest(item["message"]) != item["message_hash"]:
                raise ValueError("Captured message hash mismatch")
            if item["symbol"] != asset:
                continue
            row = captured_bar({**item, "capture_id": path.stem, "frame_hash": document["content_hash"],
                                "received_ns": document["local_receive_ns"], "captured_at": document["capture_timestamp"]}, calendar)
            if row is not None and row.observed_at <= end and row.available_at <= end:
                old = bars.get(row.observed_at)
                if old is None or row.available_at < old.available_at:
                    bars[row.observed_at] = row
    return sorted(bars.values(), key=lambda row: row.observed_at)


def collect(root: Path, *, duration_seconds: int = 60, max_messages: int = 100000) -> dict:
    """Bounded smoke capture or duration=0 operator-owned continuous collector."""
    import os
    from websocket import create_connection, WebSocketTimeoutException

    key, secret = os.getenv("APCA_API_KEY_ID"), os.getenv("APCA_API_SECRET_KEY")
    if not key or not secret:
        raise ValueError("Alpaca credentials are not configured")
    if duration_seconds < 0 or not 1 <= max_messages <= 10_000_000:
        raise ValueError("Invalid collector bounds")
    count, authenticated, subscribed = 0, False, False
    started = time.monotonic()
    connection = create_connection(URL, timeout=10, enable_multithread=True)
    try:
        connection.send(json.dumps({"action": "auth", "key": key, "secret": secret}))
        while duration_seconds == 0 or time.monotonic() - started < duration_seconds:
            try:
                frame = connection.recv()
                received_ns = time.time_ns()  # Immediately after recv, before parsing or disk I/O.
            except WebSocketTimeoutException:
                continue
            if not frame:
                raise RuntimeError("IEX stream disconnected")
            messages = json.loads(frame)
            if any(m.get("T") == "error" for m in messages):
                codes = sorted({m.get("code") for m in messages if m.get("T") == "error"})
                raise RuntimeError(f"IEX stream rejected request, codes={codes}")
            if any(m.get("T") == "success" and m.get("msg") == "authenticated" for m in messages):
                authenticated = True
                connection.send(json.dumps({"action": "subscribe", "trades": list(ASSETS),
                                            "quotes": list(ASSETS), "bars": list(ASSETS),
                                            "updatedBars": list(ASSETS), "dailyBars": list(ASSETS)}))
            subscribed |= any(m.get("T") == "subscription" for m in messages)
            count += len(archive_frame(root, frame, received_ns=received_ns))
            if count >= max_messages:
                break
        return {"feed": "iex", "coverage": "IEX ONLY", "authenticated": authenticated,
                "subscribed": subscribed, "market_messages": count,
                "quality": "RECEIVE_TIMESTAMP_CAPTURED", "elapsed_seconds": round(time.monotonic() - started, 2)}
    finally:
        connection.close()
