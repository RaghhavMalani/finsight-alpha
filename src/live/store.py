"""Append-only live store with full provenance.

Storage: one JSONL segment per UTC day of ``available_at`` (chosen over SQLite
because a day file is append-only by construction, diffable, and replays by
reading lines in order). ``seal_day`` copies a closed day to a content-addressed
file plus a manifest, and replay reads only verified sealed bytes.

Invariants enforced here, not by feeds:
- ``available_at`` is the store's ingestion clock. Anything a feed claims is
  overwritten (the claim is kept in provenance for audit); stamps never go
  backwards, so a day file is ordered by ``available_at`` and ``seq``.
- ``observed_at``, ``effective_at`` and ``provenance.fetched_at`` never exceed the
  stamp: within clock skew they are clamped and flagged, beyond it refused.
- Idempotent by ``(source, source_id, revision)``. For content-hash revisions
  (``provenance.revision_basis == "CONTENT_HASH"``) only a repeat of the LATEST
  revision is a duplicate, so A -> B -> A stores the return as ``A~1``.
- Every record carries every field in ``model.REQUIRED_FIELDS``.
- One writer process per root (exclusive OS lock); in-memory state changes only
  after the bytes are written and fsynced; a torn tail from a crash is quarantined.
- The root is outside the repository.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import threading
import time
from collections import deque
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterable, Iterator, Mapping

from . import model
from .model import Observation

MANIFEST_SCHEMA = "live-segment-manifest/1"
# Feed clocks may run slightly ahead of ours; within this a future time is clamped and flagged.
FUTURE_SKEW = timedelta(minutes=10)
CLOCK_JUMP = timedelta(seconds=60)  # wall clock advancing faster than monotonic by more than this is flagged
RECENT_CACHE = 50000
PROJECT_ROOT = Path(__file__).resolve().parents[2]
logger = logging.getLogger("finsight.live.store")


class StoreError(ValueError):
    pass


def default_root() -> Path:
    """``FINSIGHT_LIVE_DIR``, else ``$FINSIGHT_DATA_DIR/live``, else ``~/.finsight-forge/live``."""
    explicit = os.getenv("FINSIGHT_LIVE_DIR")
    if explicit:
        return Path(explicit).expanduser()
    data = os.getenv("FINSIGHT_DATA_DIR")
    if data:
        base = Path(data).expanduser()
        return (base if base.is_absolute() else PROJECT_ROOT / base) / "live"
    return Path.home() / ".finsight-forge" / "live"


def _inside_repo(path: Path) -> bool:
    try:
        path.resolve().relative_to(PROJECT_ROOT.resolve())
        return True
    except ValueError:
        return False


def _finite(value) -> bool:
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, dict):
        return all(_finite(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return all(_finite(v) for v in value)
    return True


class _RootLock:
    """Exclusive OS lock on ``<root>/store.lock``; released by the OS if the process dies."""

    def __init__(self, path: Path):
        self.handle = open(path, "a+b")
        try:
            if os.name == "nt":
                import msvcrt

                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.handle.close()
            raise StoreError(f"live store {path.parent} is held by another writer process") from None
        self.handle.truncate(0)
        self.handle.write(str(os.getpid()).encode())
        self.handle.flush()

    def release(self) -> None:
        if self.handle.closed:
            return
        try:
            if os.name == "nt":
                import msvcrt

                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
        except OSError:
            pass
        self.handle.close()


class LiveStore:
    def __init__(self, root: Path | str | None = None, *, clock: Callable[[], datetime] = model.utcnow,
                 readonly: bool = False):
        self.root = Path(root) if root is not None else default_root()
        if _inside_repo(self.root):
            raise StoreError(f"live store must live outside the repository: {self.root}")
        self.segments = self.root / "segments"
        self.sealed = self.root / "sealed"
        self.quarantine = self.root / "quarantine"
        self.readonly = readonly
        self._clock = clock
        self._lock = threading.RLock()
        self._keys: set[str] = set()
        self._latest: dict[tuple[str, str], str] = {}  # (source, source_id) -> latest stored revision
        self._seq = 0
        self._last_stamp: datetime | None = None
        self._last_mono: float | None = None
        self._recent: deque[dict] = deque(maxlen=RECENT_CACHE)
        self.seal_errors: dict[str, str] = {}
        self._root_lock = None
        if not readonly:
            for d in (self.segments, self.sealed, self.quarantine):
                d.mkdir(parents=True, exist_ok=True)
            self._root_lock = _RootLock(self.root / "store.lock")
        self._load()

    def close(self) -> None:
        if self._root_lock is not None:
            self._root_lock.release()
            self._root_lock = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # -- startup -----------------------------------------------------------
    def _repair_tail(self, path: Path) -> None:
        """A crash mid-append leaves a line without its newline: move it aside, truncate."""
        raw = path.read_bytes()
        if not raw or raw.endswith(b"\n"):
            return
        keep = raw.rfind(b"\n") + 1
        torn = raw[keep:]
        if self.readonly:
            return
        target = self.quarantine / f"{path.stem}.{int(time.time() * 1000)}.torn"
        target.write_bytes(torn)
        with path.open("r+b") as handle:
            handle.truncate(keep)
            handle.flush()
            os.fsync(handle.fileno())
        logger.warning("quarantined a torn tail of %s bytes from %s to %s", len(torn), path.name, target.name)

    def _load(self) -> None:
        if not self.segments.exists():
            return
        recent_from = (self._clock().astimezone(timezone.utc).date() - timedelta(days=2)).isoformat()
        for path in sorted(self.segments.glob("*.jsonl")):
            self._repair_tail(path)
            raw = path.read_bytes()
            bad = 0
            for line in raw[: raw.rfind(b"\n") + 1].split(b"\n"):
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                    self._index(record)
                except (ValueError, KeyError, TypeError):
                    bad += 1  # one damaged day must not stop the store; it is reported and never sealed
                    continue
                if path.stem >= recent_from:
                    self._recent.append(record)
            if bad:
                self.seal_errors[path.stem] = f"{bad} corrupt line(s); day cannot be sealed until repaired"
                logger.error("live segment %s has %s corrupt line(s)", path.name, bad)

    def _index(self, record: dict) -> None:
        self._keys.add(record["id"])
        self._latest[(record["source"], record["source_id"])] = record["revision"]
        self._seq = max(self._seq, int(record["seq"]))
        stamp = model.parse_iso(record["available_at"])
        if self._last_stamp is None or stamp > self._last_stamp:
            self._last_stamp = stamp

    @staticmethod
    def _read_lines(path: Path) -> Iterator[dict]:
        raw = path.read_bytes()
        complete = raw[: raw.rfind(b"\n") + 1]  # a reader never sees a half-written line
        for number, line in enumerate(complete.split(b"\n"), 1):
            if line.strip():
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    raise StoreError(f"{path.name} line {number} is corrupt") from None

    # -- writes ------------------------------------------------------------
    def _stamp(self) -> tuple[datetime, dict]:
        now = self._clock()
        flags = {}
        if now.tzinfo is None:
            raise StoreError("store clock must be timezone-aware")
        mono = time.monotonic()
        if self._clock is model.utcnow and self._last_stamp is not None and self._last_mono is not None:
            jump = (now - self._last_stamp) - timedelta(seconds=mono - self._last_mono)
            if jump > CLOCK_JUMP:
                flags["clock_jump_forward_s"] = round(jump.total_seconds(), 3)
                logger.warning("wall clock stepped forward %.1f s beyond monotonic time", jump.total_seconds())
        if self._last_stamp is not None and now < self._last_stamp:
            flags["clock_stepped_back_s"] = round((self._last_stamp - now).total_seconds(), 6)
            now = self._last_stamp  # never stamp earlier than history
        return now, flags

    def append(self, item: Observation | Mapping) -> dict | None:
        """Store one observation; returns the record, or None for a duplicate."""
        records = self.append_many([item])
        return records[0] if records else None

    def append_many(self, items: Iterable[Observation | Mapping]) -> list[dict]:
        """All-or-nothing: an invalid item or a failed write stores nothing."""
        if self.readonly:
            raise StoreError("store is read-only")
        with self._lock:
            seq, keys, latest = self._seq, set(), dict()
            last_stamp, records = self._last_stamp, []
            for item in items:
                fields = dict(item.as_dict() if isinstance(item, Observation) else item)
                stamp, flags = self._stamp()
                if last_stamp is not None and stamp < last_stamp:
                    stamp = last_stamp
                record = self._build(fields, stamp, flags)
                pair = (record["source"], record["source_id"])
                known = lambda rid: rid in self._keys or rid in keys  # noqa: E731
                if record["provenance"].get("revision_basis") == "CONTENT_HASH":
                    current = latest.get(pair, self._latest.get(pair))
                    if current is not None and current.split("~")[0] == record["revision"]:
                        continue  # unchanged since the latest stored revision
                    base, n = record["revision"], 0
                    while known(model.record_id(pair[0], pair[1], record["revision"])):
                        n += 1
                        record["revision"] = f"{base}~{n}"  # a return to an earlier value is a new fact
                    record["id"] = model.record_id(pair[0], pair[1], record["revision"])
                elif known(record["id"]):
                    continue
                day = record["available_at"][:10]
                if self._manifest_path(day).exists():
                    raise StoreError(f"day {day} is sealed; refusing to append")
                seq += 1
                record["seq"] = seq
                keys.add(record["id"])
                latest[pair] = record["revision"]
                last_stamp = stamp
                records.append(record)
            if not records:
                return []
            self._write(records)
            for record in records:  # commit in-memory state only after the bytes are durable
                self._index(record)
                self._recent.append(record)
            self._last_mono = time.monotonic()
            return records

    def _write(self, records: list[dict]) -> None:
        by_day: dict[str, list[str]] = {}
        for record in records:
            by_day.setdefault(record["available_at"][:10], []).append(model.canonical(record))
        written: list[tuple[Path, int]] = []
        try:
            for day, lines in by_day.items():
                path = self.segments / f"{day}.jsonl"
                size = path.stat().st_size if path.exists() else 0
                written.append((path, size))
                with path.open("ab") as handle:
                    handle.write(("\n".join(lines) + "\n").encode("utf-8"))
                    handle.flush()
                    os.fsync(handle.fileno())
        except OSError as error:
            for path, size in written:  # roll every touched segment back to its prior length
                try:
                    with path.open("r+b") as handle:
                        handle.truncate(size)
                except OSError:
                    logger.error("could not roll back %s after a failed write", path)
            raise StoreError(f"write failed: {type(error).__name__}: {error}") from None

    def _bounded(self, name: str, value, stamp: datetime, provenance: dict) -> str | None:
        """Times a feed reports must not be after ingestion: clamp small skew (flagged), refuse more."""
        if value is None:
            return None
        try:
            when = model.parse_iso(value) if not isinstance(value, datetime) else value
        except (TypeError, ValueError) as error:
            raise StoreError(f"{name} is not a timestamp: {error}") from None
        if when > stamp + FUTURE_SKEW:
            raise StoreError(f"{name} {value} is after ingestion time")
        if when > stamp:
            provenance[f"{name}_clamped_from"] = model.iso(when)
            when = stamp
        return model.iso(when)

    def _build(self, fields: dict, stamp: datetime, flags: dict) -> dict:
        for name in ("type", "source", "source_id", "revision", "observed_at", "licence",
                     "confidence", "provenance"):
            if fields.get(name) in (None, "", {}):
                raise StoreError(f"observation is missing {name}")
        if fields["type"] not in model.EVENT_TYPES:
            raise StoreError(f"unknown event type {fields['type']!r}")
        if fields["confidence"] not in model.CONFIDENCE:
            raise StoreError(f"unknown confidence {fields['confidence']!r}")
        missing_licence = [k for k in model.LICENCE_FIELDS if not fields["licence"].get(k)]
        if missing_licence:
            raise StoreError(f"licence is missing {missing_licence}")
        missing_prov = [k for k in model.PROVENANCE_FIELDS if k not in fields["provenance"]]
        if missing_prov:
            raise StoreError(f"provenance is missing {missing_prov}")
        provenance = {**fields["provenance"], **flags}
        observed = self._bounded("observed_at", fields["observed_at"], stamp, provenance)
        effective = self._bounded("effective_at", fields.get("effective_at"), stamp, provenance)
        provenance["fetched_at"] = self._bounded("fetched_at", provenance["fetched_at"], stamp, provenance)
        if provenance["fetched_at"] is None:
            raise StoreError("provenance.fetched_at is missing")
        claimed = fields.get("available_at")
        if claimed is not None:
            # A feed does not decide when we learned something. Keep its claim for audit only.
            provenance["feed_claimed_available_at"] = str(claimed)
        record = {
            "schema_version": model.SCHEMA,
            "seq": 0,
            "id": model.record_id(str(fields["source"]), str(fields["source_id"]), str(fields["revision"])),
            "type": fields["type"],
            "source": str(fields["source"]),
            "source_id": str(fields["source_id"]),
            "revision": str(fields["revision"]),
            "observed_at": observed,
            "available_at": claimed,
            "effective_at": effective,
            "licence": fields["licence"],
            "confidence": fields["confidence"],
            "provenance": provenance,
            "payload": fields.get("payload") or {},
        }
        record["available_at"] = model.iso(stamp)  # backdating guard: ingestion time, always
        if not _finite(record["payload"]) or not _finite(record["provenance"]):
            raise StoreError("payload holds a number that is not finite (NaN/Infinity); missing is not a number")
        return record

    # -- reads -------------------------------------------------------------
    def has(self, source: str, source_id: str, revision: str) -> bool:
        return model.record_id(source, source_id, revision) in self._keys

    def days(self) -> list[str]:
        return sorted(p.stem for p in self.segments.glob("*.jsonl")) if self.segments.exists() else []

    def sealed_days(self) -> list[str]:
        if not self.sealed.exists():
            return []
        return sorted(p.name.split(".")[0] for p in self.sealed.glob("*.manifest.json"))

    def read_day(self, day: str) -> list[dict]:
        """Sealed bytes (hash-verified) when the day is sealed, else the open segment."""
        with self._lock:
            manifest_path = self._manifest_path(day)
            if manifest_path.exists():
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                name = str(manifest.get("file", ""))
                if not re.fullmatch(re.escape(day) + r"\.[0-9a-f]{16}\.jsonl", name) or \
                        not name.startswith(day + "." + str(manifest.get("sha256", ""))[:16]):
                    raise StoreError(f"manifest for {day} names an unexpected file {name!r}")
                raw = (self.sealed / name).read_bytes()
                if model.sha256_hex(raw) != manifest["sha256"]:
                    raise StoreError(f"sealed segment {day} does not match its manifest")
                return [json.loads(line) for line in raw.splitlines() if line.strip()]
            path = self.segments / f"{day}.jsonl"
            return list(self._read_lines(path)) if path.exists() else []

    def records(self, types: set[str] | None = None) -> list[dict]:
        """Every stored record (all days), read under the writer lock."""
        with self._lock:
            out = [r for d in self.days() for r in self.read_day(d)]
        return [r for r in out if not types or r["type"] in types]

    def since(self, available_after: str | None = None, *, types: set[str] | None = None,
              limit: int = 500, after_seq: int | None = None) -> list[dict]:
        """Recent records from memory (last two days at open, plus everything appended since)."""
        cutoff = model.parse_iso(available_after) if available_after else None
        with self._lock:
            items = list(self._recent)
            older = after_seq is not None and items and after_seq < items[0]["seq"] - 1
        if older:  # asked for history older than the cache: read it from disk
            items = self.records()
        out = [r for r in items
               if (not types or r["type"] in types)
               and (after_seq is None or r["seq"] > after_seq)
               and (cutoff is None or model.parse_iso(r["available_at"]) > cutoff)]
        return out[-limit:]

    # -- sealing -----------------------------------------------------------
    def _manifest_path(self, day: str) -> Path:
        return self.sealed / f"{day}.manifest.json"

    def seal_day(self, day: str | date) -> dict | None:
        """Seal a closed UTC day: content-addressed copy + manifest. Idempotent."""
        if self.readonly:
            raise StoreError("store is read-only")
        day = day.isoformat() if isinstance(day, date) else str(day)
        date.fromisoformat(day)
        if day >= self._clock().astimezone(timezone.utc).date().isoformat():
            raise StoreError(f"day {day} is still open; only past days can be sealed")
        segment = self.segments / f"{day}.jsonl"
        if not segment.exists():
            return None
        with self._lock:
            raw = segment.read_bytes()
            digest = model.sha256_hex(raw)
            manifest_path = self._manifest_path(day)
            if manifest_path.exists():
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                if manifest["sha256"] != digest:
                    raise StoreError(f"segment {day} changed after it was sealed")
                return manifest
            records = list(self._read_lines(segment))
            seqs = [r["seq"] for r in records]
            if any(b <= a for a, b in zip(seqs, seqs[1:])):
                raise StoreError(f"segment {day} is not in strict append order")
            for r in records:
                missing = [k for k in model.REQUIRED_FIELDS if k not in r]
                if missing:
                    raise StoreError(f"segment {day} record {r.get('seq')} lacks {missing}")
                if r["available_at"][:10] != day:
                    raise StoreError(f"segment {day} holds record {r['seq']} available on another day")
            name = f"{day}.{digest[:16]}.jsonl"
            target = self.sealed / name
            if not target.exists():
                tmp = target.with_suffix(".tmp")
                tmp.write_bytes(raw)
                os.replace(tmp, target)
            counts: dict[str, dict[str, int]] = {"sources": {}, "types": {}}
            for r in records:
                counts["sources"][r["source"]] = counts["sources"].get(r["source"], 0) + 1
                counts["types"][r["type"]] = counts["types"].get(r["type"], 0) + 1
            manifest = {
                "schema_version": MANIFEST_SCHEMA, "day": day, "file": name, "sha256": digest,
                "bytes": len(raw), "rows": len(records),
                "first_seq": seqs[0] if seqs else None, "last_seq": seqs[-1] if seqs else None,
                "first_available_at": records[0]["available_at"] if records else None,
                "last_available_at": records[-1]["available_at"] if records else None,
                "sources": counts["sources"], "types": counts["types"],
                "sealed_at": model.iso(self._clock()),
            }
            tmp = manifest_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            os.replace(tmp, manifest_path)
            self.seal_errors.pop(day, None)
            return manifest

    def seal_closed_days(self) -> list[dict]:
        """Seal every past day; a bad day is logged and reported, never blocks the others."""
        today = self._clock().astimezone(timezone.utc).date().isoformat()
        out = []
        for day in self.days():
            if day >= today:
                continue
            try:
                manifest = self.seal_day(day)
            except (StoreError, OSError, ValueError) as error:
                self.seal_errors[day] = str(error)
                logger.error("could not seal live day %s: %s", day, error)
                continue
            if manifest:
                out.append(manifest)
        return out
