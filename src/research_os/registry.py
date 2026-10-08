"""Tenant-scoped immutable objects and append-only attempts, using SQLite locally."""
from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import uuid

from src.eval.canonical import canonical_json_bytes, sha256_bytes
from .contracts import Contract, Digest, OBJECT_TYPES, now, utc


class Registry:
    def __init__(self, path: Path, organization: int):
        if isinstance(organization, bool) or organization < 1:
            raise ValueError("Organization is required")
        self.path, self.organization = path, organization
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS objects (
              organization INTEGER NOT NULL, hash TEXT NOT NULL, kind TEXT NOT NULL,
              payload BLOB NOT NULL, PRIMARY KEY (organization, hash));
            CREATE TABLE IF NOT EXISTS events (
              sequence INTEGER PRIMARY KEY AUTOINCREMENT, organization INTEGER NOT NULL,
              event_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, attempt TEXT,
              at TEXT NOT NULL, payload BLOB NOT NULL, previous TEXT NOT NULL, hash TEXT NOT NULL);
            CREATE TRIGGER IF NOT EXISTS objects_no_update BEFORE UPDATE ON objects
              BEGIN SELECT RAISE(ABORT, 'Immutable object'); END;
            CREATE TRIGGER IF NOT EXISTS objects_no_delete BEFORE DELETE ON objects
              BEGIN SELECT RAISE(ABORT, 'Immutable object'); END;
            CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
              BEGIN SELECT RAISE(ABORT, 'Append-only event'); END;
            CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
              BEGIN SELECT RAISE(ABORT, 'Append-only event'); END;
            """)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        return db

    def put(self, obj: Contract) -> str:
        payload, identity = canonical_json_bytes(obj.model_dump(mode="json")), obj.identity
        parent = getattr(obj, "parent", None)
        if parent:
            original = self.get(parent)
            if type(original) is not type(obj):
                raise ValueError("Revision parent has different contract type")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload,kind FROM objects WHERE organization=? AND hash=?",
                             (self.organization, identity)).fetchone()
            if row and (row["payload"] != payload or row["kind"] != type(obj).__name__):
                raise ValueError("Immutable identity substitution")
            db.execute("INSERT OR IGNORE INTO objects VALUES (?,?,?,?)",
                       (self.organization, identity, type(obj).__name__, payload))
        return identity

    def get(self, identity: str) -> Contract:
        if len(identity) != 64 or any(c not in "0123456789abcdef" for c in identity):
            raise ValueError("Malformed object identity")
        with self.connect() as db:
            row = db.execute("SELECT kind,payload FROM objects WHERE organization=? AND hash=?",
                             (self.organization, identity)).fetchone()
        if row is None:
            raise ValueError("Object not available in this organization")
        if sha256_bytes(row["payload"]) != identity:
            raise ValueError("Object bytes failed content hash")
        return OBJECT_TYPES[row["kind"]].model_validate_json(row["payload"])

    def append(self, kind: str, payload: dict, attempt: str | None = None) -> str:
        if kind not in {"FREEZE", "START", "HOLDOUT_OPEN", "SUCCESS", "ERROR", "ABORT", "LEDGER_BIND"}:
            raise ValueError("Unknown lifecycle event")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            rows = db.execute("SELECT * FROM events WHERE organization=? ORDER BY sequence",
                              (self.organization,)).fetchall()
            self._verify(rows)
            if kind in {"HOLDOUT_OPEN", "SUCCESS", "ERROR", "ABORT", "LEDGER_BIND"}:
                events = [r["kind"] for r in rows if r["attempt"] == attempt]
                if "START" not in events:
                    raise ValueError("Attempt must be recorded before computation")
                if kind in {"SUCCESS", "ERROR", "ABORT"} and any(k in events for k in ("SUCCESS", "ERROR", "ABORT")):
                    raise ValueError("Attempt already terminal")
                if kind == "HOLDOUT_OPEN" and ("HOLDOUT_OPEN" in events or any(k in events for k in ("SUCCESS", "ERROR", "ABORT"))):
                    raise ValueError("Invalid holdout opening")
            previous = rows[-1]["hash"] if rows else "0" * 64
            at, event_id = now(), uuid.uuid4().hex
            if rows and utc(at) < utc(rows[-1]["at"]):
                raise ValueError("Receipt clock moved backward")
            content = canonical_json_bytes({"id": event_id, "kind": kind, "attempt": attempt,
                "at": at, "payload": payload, "previous": previous, "organization": self.organization})
            db.execute("INSERT INTO events (organization,event_id,kind,attempt,at,payload,previous,hash) VALUES (?,?,?,?,?,?,?,?)",
                (self.organization, event_id, kind, attempt, at, canonical_json_bytes(payload), previous, sha256_bytes(content)))
        return event_id

    def _verify(self, rows):
        previous = "0" * 64
        for r in rows:
            content = {"id": r["event_id"], "kind": r["kind"], "attempt": r["attempt"],
                "at": r["at"], "payload": json.loads(r["payload"]), "previous": previous,
                "organization": self.organization}
            if r["previous"] != previous or r["hash"] != sha256_bytes(canonical_json_bytes(content)):
                raise ValueError("Attempt ledger chain failed")
            previous = r["hash"]

    def events(self) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM events WHERE organization=? ORDER BY sequence",
                              (self.organization,)).fetchall()
        self._verify(rows)
        return [{**dict(r), "payload": json.loads(r["payload"])} for r in rows]

    def holdout_openings(self, preregistration: str) -> int:
        return sum(e["kind"] == "HOLDOUT_OPEN" and e["payload"]["preregistration_hash"] == preregistration for e in self.events())
