"""Local immutable run records and tenant-scoped hash-chained attempts."""

from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import uuid
from src.truth.contracts import canonical_hash


class RunRegistry:
    def __init__(self, path: str | Path):
        self.path = Path(path).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS runs (tenant TEXT, run_id TEXT, payload TEXT, hash TEXT, PRIMARY KEY(tenant,run_id));
            CREATE TABLE IF NOT EXISTS events (tenant TEXT, sequence INTEGER, attempt TEXT, run_id TEXT, event TEXT, payload TEXT, previous TEXT, hash TEXT, PRIMARY KEY(tenant,sequence));
            CREATE TABLE IF NOT EXISTS openings (tenant TEXT, run_id TEXT, family TEXT, attempt TEXT, PRIMARY KEY(tenant,run_id));
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=30)
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def identity(contract: dict) -> str:
        return canonical_hash(contract)

    @staticmethod
    def _tenant(value):
        from finsight.plugins.contracts import tenant

        return tenant(value)

    def _append(self, db, tenant_id, attempt, run_id, event, payload):
        rows = self._verify(db, tenant_id)
        previous = rows[-1]["hash"] if rows else None
        row = {
            "tenant_id": tenant_id,
            "sequence": len(rows),
            "attempt": attempt,
            "run_id": run_id,
            "event": event,
            "at": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
            "previous": previous,
        }
        seal = canonical_hash(row)
        db.execute(
            "INSERT INTO events VALUES (?,?,?,?,?,?,?,?)",
            [
                tenant_id,
                row["sequence"],
                attempt,
                run_id,
                event,
                json.dumps(row, sort_keys=True, allow_nan=False),
                previous,
                seal,
            ],
        )
        return {**row, "hash": seal}

    def _verify(self, db, tenant_id):
        records = db.execute(
            "SELECT sequence,attempt,run_id,event,payload,previous,hash FROM events WHERE tenant=? ORDER BY sequence",
            [tenant_id],
        ).fetchall()
        rows = []
        for sequence, attempt, run_id, event, payload, previous, seal in records:
            row = json.loads(payload)
            if (
                row.get("tenant_id") != tenant_id
                or sequence != len(rows)
                or row["sequence"] != sequence
                or row["attempt"] != attempt
                or row["run_id"] != run_id
                or row["event"] != event
                or canonical_hash(row) != seal
                or previous != (rows[-1]["hash"] if rows else None)
                or row["previous"] != previous
            ):
                raise ValueError("Run-registry attempt chain substitution")
            rows.append({**row, "hash": seal})
        return rows

    def event(self, tenant_id, attempt, run_id, event, payload):
        self._tenant(tenant_id)
        with self.connection() as db:
            return self._append(db, tenant_id, attempt, run_id, event, payload)

    def begin(self, tenant_id, requested: dict):
        attempt = uuid.uuid4().hex
        self.event(tenant_id, attempt, None, "ATTEMPT_STARTED", requested)
        return attempt

    def events(self, tenant_id):
        self._tenant(tenant_id)
        with self.connection() as db:
            return self._verify(db, tenant_id)

    def seal(self, tenant_id, run_id, payload: dict):
        self._tenant(tenant_id)
        if payload.get("tenant_id") != tenant_id or payload.get("run_id") != run_id:
            raise ValueError("Run payload must bind its explicit tenant and identity")
        raw = json.dumps(payload, sort_keys=True, allow_nan=False)
        seal = canonical_hash(payload)
        with self.connection() as db:
            self._verify(db, tenant_id)
            existing = db.execute(
                "SELECT payload,hash FROM runs WHERE tenant=? AND run_id=?",
                [tenant_id, run_id],
            ).fetchone()
            if existing:
                if json.loads(existing[0]) != payload or existing[1] != seal:
                    raise ValueError("Immutable run cannot be replaced")
            else:
                db.execute(
                    "INSERT INTO runs VALUES (?,?,?,?)", [tenant_id, run_id, raw, seal]
                )
                self._append(
                    db, tenant_id, "seal", run_id, "RUN_SEALED", {"payload_hash": seal}
                )

    def read(self, tenant_id, run_id):
        self._tenant(tenant_id)
        with self.connection() as db:
            events = self._verify(db, tenant_id)
            row = db.execute(
                "SELECT payload,hash FROM runs WHERE tenant=? AND run_id=?",
                [tenant_id, run_id],
            ).fetchone()
        if row is None:
            return None
        payload = json.loads(row[0])
        seals = [
            e["payload"].get("payload_hash")
            for e in events
            if e["run_id"] == run_id and e["event"] == "RUN_SEALED"
        ]
        if (
            canonical_hash(payload) != row[1]
            or seals != [row[1]]
            or payload["run_id"] != run_id
            or payload["tenant_id"] != tenant_id
        ):
            raise ValueError("Immutable run payload substitution")
        return payload

    def holdout(self, tenant_id, run_id, family, attempt):
        """Account for model access before it occurs, including later failures."""
        self._tenant(tenant_id)
        with self.connection() as db:
            events = self._verify(db, tenant_id)
            recorded = any(
                e["event"] == "HOLDOUT_OPENED" and e["run_id"] == run_id for e in events
            )
            indexed = bool(
                db.execute(
                    "SELECT 1 FROM openings WHERE tenant=? AND run_id=?",
                    [tenant_id, run_id],
                ).fetchone()
            )
            if recorded != indexed:
                raise ValueError("Holdout index differs from verified attempt history")
            if recorded:
                self._append(
                    db,
                    tenant_id,
                    attempt,
                    run_id,
                    "HOLDOUT_REOPEN_REJECTED",
                    {"family": family},
                )
                # Commit the rejected-access event before raising outside the transaction.
                rejected = True
            else:
                db.execute(
                    "INSERT INTO openings VALUES (?,?,?,?)",
                    [tenant_id, run_id, family, attempt],
                )
                self._append(
                    db, tenant_id, attempt, run_id, "HOLDOUT_OPENED", {"family": family}
                )
                rejected = False
        if rejected:
            raise PermissionError(
                "Holdout already opened; completed results may only be reused"
            )

    def opening_count(self, tenant_id, *, family=None):
        events = self.events(tenant_id)
        return sum(
            r["event"] == "HOLDOUT_OPENED"
            and (family is None or r["payload"]["family"] == family)
            for r in events
        )

    def list_runs(self, tenant_id):
        self._tenant(tenant_id)
        with self.connection() as db:
            ids = [
                r[0]
                for r in db.execute(
                    "SELECT run_id FROM runs WHERE tenant=? ORDER BY run_id",
                    [tenant_id],
                ).fetchall()
            ]
        return [self.read(tenant_id, identity) for identity in ids]

    def artifact(self, tenant_id, run_id, entry):
        """Link publication after sealing, without replacing the computation record."""
        if self.read(tenant_id, run_id) is None:
            raise ValueError("Artifact has no sealed run")
        if (
            not isinstance(entry, dict)
            or not entry.get("sha256")
            or not entry.get("url")
        ):
            raise ValueError("Artifact needs its content address and URL")
        previous = [
            e["payload"]
            for e in self.events(tenant_id)
            if e["run_id"] == run_id and e["event"] == "ARTIFACT_PUBLISHED"
        ]
        if previous:
            if previous != [entry]:
                raise ValueError("Immutable publication binding cannot be replaced")
            return
        self.event(tenant_id, "publication", run_id, "ARTIFACT_PUBLISHED", entry)

    def snapshot(self, tenant_id):
        return {
            "schema_version": "plugin-registry/1",
            "tenant_id": self._tenant(tenant_id),
            "runs": self.list_runs(tenant_id),
            "events": self.events(tenant_id),
        }

    def restore(self, tenant_id, snapshot):
        """Restore checked public history into an empty local registry, retaining every attempt."""
        self._tenant(tenant_id)
        if (
            snapshot.get("schema_version") != "plugin-registry/1"
            or snapshot.get("tenant_id") != tenant_id
        ):
            raise ValueError("Wrong snapshot tenant/schema")
        with self.connection() as db:
            if (
                db.execute(
                    "SELECT 1 FROM events WHERE tenant=?", [tenant_id]
                ).fetchone()
                or db.execute(
                    "SELECT 1 FROM runs WHERE tenant=?", [tenant_id]
                ).fetchone()
            ):
                raise ValueError("Restore requires an empty tenant registry")
            for record in snapshot["events"]:
                row = {k: v for k, v in record.items() if k != "hash"}
                if (
                    row.get("tenant_id") != tenant_id
                    or canonical_hash(row) != record["hash"]
                ):
                    raise ValueError("Snapshot event substitution")
                db.execute(
                    "INSERT INTO events VALUES (?,?,?,?,?,?,?,?)",
                    [
                        tenant_id,
                        row["sequence"],
                        row["attempt"],
                        row["run_id"],
                        row["event"],
                        json.dumps(row, sort_keys=True),
                        row["previous"],
                        record["hash"],
                    ],
                )
                if row["event"] == "HOLDOUT_OPENED":
                    db.execute(
                        "INSERT INTO openings VALUES (?,?,?,?)",
                        [
                            tenant_id,
                            row["run_id"],
                            row["payload"]["family"],
                            row["attempt"],
                        ],
                    )
            events = self._verify(db, tenant_id)
            for payload in snapshot["runs"]:
                seals = [
                    e["payload"].get("payload_hash")
                    for e in events
                    if e["event"] == "RUN_SEALED" and e["run_id"] == payload["run_id"]
                ]
                if payload.get("tenant_id") != tenant_id or seals != [
                    canonical_hash(payload)
                ]:
                    raise ValueError("Snapshot run contract substitution")
                db.execute(
                    "INSERT INTO runs VALUES (?,?,?,?)",
                    [
                        tenant_id,
                        payload["run_id"],
                        json.dumps(payload, sort_keys=True, allow_nan=False),
                        canonical_hash(payload),
                    ],
                )
