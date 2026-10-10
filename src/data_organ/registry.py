"""Tenant-local append-only journal. Every read verifies its hash chain."""

import json
import threading
from contextlib import contextmanager
from pathlib import Path

import duckdb

from finsight.plugins.contracts import tenant
from src.truth.contracts import canonical_hash

_locks, _guard = {}, threading.Lock()


class Registry:
    def __init__(self, path):
        self.path = Path(path).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with _guard:
            self.lock = _locks.setdefault(str(self.path), threading.RLock())
        with self.connection() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS journal(tenant VARCHAR, sequence BIGINT, kind VARCHAR, identity VARCHAR, payload VARCHAR, previous VARCHAR, hash VARCHAR, PRIMARY KEY(tenant,sequence), UNIQUE(tenant,kind,identity))"
            )

    @contextmanager
    def connection(self):
        with self.lock:
            db = duckdb.connect(str(self.path))
            try:
                yield db
            finally:
                db.close()

    def entries(self, tenant_id, kind=None):
        tenant(tenant_id)
        with self.connection() as db:
            records = db.execute(
                "SELECT sequence,kind,identity,payload,previous,hash FROM journal WHERE tenant=? ORDER BY sequence",
                [tenant_id],
            ).fetchall()
        previous, results = "0" * 64, []
        for sequence, entry_kind, identity, payload, parent, digest in records:
            value = json.loads(payload)
            body = {
                "tenant_id": tenant_id,
                "sequence": sequence,
                "kind": entry_kind,
                "identity": identity,
                "payload": value,
                "previous": parent,
            }
            if (
                sequence != len(results)
                or parent != previous
                or canonical_hash(body) != digest
            ):
                raise ValueError("Data Organ journal tampering or missing history")
            results.append(body | {"hash": digest})
            previous = digest
        return [r for r in results if kind is None or r["kind"] == kind]

    def append(self, tenant_id, kind, identity, payload):
        tenant(tenant_id)
        with self.lock:
            records = self.entries(tenant_id)
            old = next(
                (r for r in records if r["kind"] == kind and r["identity"] == identity),
                None,
            )
            if old:
                if canonical_hash(old["payload"]) != canonical_hash(payload):
                    raise ValueError("Immutable admission identity conflict")
                return old
            body = {
                "tenant_id": tenant_id,
                "sequence": len(records),
                "kind": kind,
                "identity": identity,
                "payload": payload,
                "previous": records[-1]["hash"] if records else "0" * 64,
            }
            digest = canonical_hash(body)
            with self.connection() as db:
                db.execute(
                    "INSERT INTO journal VALUES (?,?,?,?,?,?,?)",
                    [
                        tenant_id,
                        len(records),
                        kind,
                        identity,
                        json.dumps(payload, sort_keys=True, allow_nan=False),
                        body["previous"],
                        digest,
                    ],
                )
            return body | {"hash": digest}

    def get(self, tenant_id, kind, identity):
        return next(
            (e for e in self.entries(tenant_id, kind) if e["identity"] == identity),
            None,
        )

    def append_many(self, tenant_id, kind, values):
        """Seal a batch atomically; avoids repeated journal reads during ingestion."""
        tenant(tenant_id)
        with self.lock:
            records = self.entries(tenant_id)
            existing = {(e["kind"], e["identity"]): e for e in records}
            previous = records[-1]["hash"] if records else "0" * 64
            inserts = []
            for identity, payload in values:
                old = existing.get((kind, identity))
                if old:
                    if canonical_hash(old["payload"]) != canonical_hash(payload):
                        raise ValueError("Immutable admission identity conflict")
                    continue
                sequence = len(records) + len(inserts)
                body = {
                    "tenant_id": tenant_id,
                    "sequence": sequence,
                    "kind": kind,
                    "identity": identity,
                    "payload": payload,
                    "previous": previous,
                }
                digest = canonical_hash(body)
                existing[(kind, identity)] = body
                inserts.append(
                    [
                        tenant_id,
                        sequence,
                        kind,
                        identity,
                        json.dumps(payload, sort_keys=True, allow_nan=False),
                        previous,
                        digest,
                    ]
                )
                previous = digest
            if inserts:
                with self.connection() as db:
                    db.execute("BEGIN TRANSACTION")
                    try:
                        db.executemany(
                            "INSERT INTO journal VALUES (?,?,?,?,?,?,?)", inserts
                        )
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
