"""Append-only live store with full provenance.

Storage: one JSONL segment per UTC day of ``available_at`` (chosen over SQLite
because a day file is append-only by construction, diffable, and replays by
reading lines in order). ``seal_day`` copies a closed day to a content-addressed
file plus a manifest, and replay reads only verified sealed bytes.

Invariants enforced here, not by feeds:
- ``available_at`` is the store's ingestion clock. Anything a feed claims is
  overwritten (the claim is kept in provenance for audit); stamps never go
  backwards, so a day file is ordered by ``available_at`` and ``seq``.
- Idempotent by ``(source, source_id, revision)``: a repeat is not written.
- Every record carries every field in ``model.REQUIRED_FIELDS``.
- The root is outside the repository.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterable, Iterator, Mapping

from . import model
from .model import Observation

MANIFEST_SCHEMA = "live-segment-manifest/1"
# A feed may report an observation slightly after our clock (its clock runs fast);
# beyond this it is refused rather than stored as a future fact.
FUTURE_SKEW = timedelta(minutes=10)
PROJECT_ROOT = Path(__file__).resolve().parents[2]


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


class LiveStore:
    def __init__(self, root: Path | str | None = None, *, clock: Callable[[], datetime] = model.utcnow):
        self.root = Path(root) if root is not None else default_root()
        if _inside_repo(self.root):
            raise StoreError(f"live store must live outside the repository: {self.root}")
        self.segments = self.root / "segments"
        self.sealed = self.root / "sealed"
        self.segments.mkdir(parents=True, exist_ok=True)
        self.sealed.mkdir(parents=True, exist_ok=True)
        self._clock = clock
        self._lock = threading.Lock()
        self._keys: set[str] = set()
        self._seq = 0
        self._last_stamp: datetime | None = None
        self._load()

    # -- startup -----------------------------------------------------------
    def _load(self) -> None:
        for path in sorted(self.segments.glob("*.jsonl")):
            for record in self._read_lines(path):
                self._keys.add(record["id"])
                self._seq = max(self._seq, int(record["seq"]))
                stamp = model.parse_iso(record["available_at"])
                if self._last_stamp is None or stamp > self._last_stamp:
                    self._last_stamp = stamp

    @staticmethod
    def _read_lines(path: Path) -> Iterator[dict]:
        with path.open("rb") as handle:
            for line in handle:
                if line.strip():
                    yield json.loads(line)

    # -- writes ------------------------------------------------------------
    def _stamp(self) -> datetime:
        now = self._clock()
        if now.tzinfo is None:
            raise StoreError("store clock must be timezone-aware")
        if self._last_stamp is not None and now < self._last_stamp:
            now = self._last_stamp  # wall clock stepped back; never stamp earlier than history
        return now

    def append(self, item: Observation | Mapping) -> dict | None:
        """Store one observation; returns the record, or None for a duplicate."""
        records = self.append_many([item])
        return records[0] if records else None

    def append_many(self, items: Iterable[Observation | Mapping]) -> list[dict]:
        written: list[dict] = []
        with self._lock:
            lines_by_day: dict[str, list[str]] = {}
            for item in items:
                fields = dict(item.as_dict() if isinstance(item, Observation) else item)
                stamp = self._stamp()
                record = self._build(fields, stamp)
                if record["id"] in self._keys:
                    continue
                day = record["available_at"][:10]
                if self._manifest_path(day).exists():
                    raise StoreError(f"day {day} is sealed; refusing to append")
                self._seq += 1
                record["seq"] = self._seq
                self._keys.add(record["id"])
                self._last_stamp = stamp
                lines_by_day.setdefault(day, []).append(model.canonical(record))
                written.append(record)
            for day, lines in lines_by_day.items():
                with (self.segments / f"{day}.jsonl").open("a", encoding="utf-8", newline="\n") as handle:
                    handle.write("\n".join(lines) + "\n")
                    handle.flush()
                    os.fsync(handle.fileno())
        return written

    def _build(self, fields: dict, stamp: datetime) -> dict:
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
        observed = model.parse_iso(fields["observed_at"])
        if observed > stamp + FUTURE_SKEW:
            raise StoreError(f"observed_at {fields['observed_at']} is after ingestion time")
        provenance = dict(fields["provenance"])
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
            "observed_at": model.iso(observed),
            "available_at": claimed,
            "effective_at": model.normalize_iso(fields.get("effective_at")),
            "licence": fields["licence"],
            "confidence": fields["confidence"],
            "provenance": provenance,
            "payload": fields.get("payload") or {},
        }
        record["available_at"] = model.iso(stamp)  # backdating guard: ingestion time, always
        model.canonical(record)  # refuses NaN/Infinity before anything is written
        return record

    # -- reads -------------------------------------------------------------
    def has(self, source: str, source_id: str, revision: str) -> bool:
        return model.record_id(source, source_id, revision) in self._keys

    def days(self) -> list[str]:
        return sorted(p.stem for p in self.segments.glob("*.jsonl"))

    def sealed_days(self) -> list[str]:
        return sorted(p.name.split(".")[0] for p in self.sealed.glob("*.manifest.json"))

    def read_day(self, day: str) -> list[dict]:
        """Sealed bytes (hash-verified) when the day is sealed, else the open segment."""
        manifest_path = self._manifest_path(day)
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            raw = (self.sealed / manifest["file"]).read_bytes()
            if model.sha256_hex(raw) != manifest["sha256"]:
                raise StoreError(f"sealed segment {day} does not match its manifest")
            return [json.loads(line) for line in raw.splitlines() if line.strip()]
        path = self.segments / f"{day}.jsonl"
        return list(self._read_lines(path)) if path.exists() else []

    def since(self, available_after: str | None = None, *, types: set[str] | None = None,
              limit: int = 500, lookback_days: int = 2) -> list[dict]:
        today = self._clock().astimezone(timezone.utc).date()
        days = [(today - timedelta(days=n)).isoformat() for n in range(lookback_days, -1, -1)]
        cutoff = model.parse_iso(available_after) if available_after else None
        out = []
        for day in days:
            for record in self.read_day(day):
                if types and record["type"] not in types:
                    continue
                if cutoff and model.parse_iso(record["available_at"]) <= cutoff:
                    continue
                out.append(record)
        return out[-limit:]

    # -- sealing -----------------------------------------------------------
    def _manifest_path(self, day: str) -> Path:
        return self.sealed / f"{day}.manifest.json"

    def seal_day(self, day: str | date) -> dict | None:
        """Seal a closed UTC day: content-addressed copy + manifest. Idempotent."""
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
            records = [json.loads(line) for line in raw.splitlines() if line.strip()]
            seqs = [r["seq"] for r in records]
            if seqs != sorted(seqs) or len(set(seqs)) != len(seqs):
                raise StoreError(f"segment {day} is not in append order")
            for r in records:
                missing = [k for k in model.REQUIRED_FIELDS if k not in r]
                if missing or r["available_at"][:10] != day:
                    raise StoreError(f"segment {day} has a malformed record {r.get('seq')}")
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
                "schema_version": MANIFEST_SCHEMA,
                "day": day,
                "file": name,
                "sha256": digest,
                "bytes": len(raw),
                "rows": len(records),
                "first_seq": seqs[0] if seqs else None,
                "last_seq": seqs[-1] if seqs else None,
                "first_available_at": records[0]["available_at"] if records else None,
                "last_available_at": records[-1]["available_at"] if records else None,
                "sources": counts["sources"],
                "types": counts["types"],
                "sealed_at": model.iso(self._clock()),
            }
            tmp = manifest_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            os.replace(tmp, manifest_path)
            return manifest

    def seal_closed_days(self) -> list[dict]:
        today = self._clock().astimezone(timezone.utc).date().isoformat()
        return [m for d in self.days() if d < today for m in [self.seal_day(d)] if m]
