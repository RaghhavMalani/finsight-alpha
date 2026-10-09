"""Append-only Parquet signals with a tenant-scoped DuckDB admission index."""

from __future__ import annotations
from contextlib import contextmanager
import json
from pathlib import Path
import threading
import uuid

import duckdb
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from src.data.as_of import AsOfContext
from src.truth.contracts import canonical_hash
from .contracts import Signal, SignalType, tenant, utc, validate_inputs

_locks: dict[str, threading.RLock] = {}
_locks_guard = threading.Lock()


class SignalStore:
    def __init__(self, root: Path | str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        with _locks_guard:
            self.lock = _locks.setdefault(str(self.root), threading.RLock())
        with self.connection() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS signal_types (tenant VARCHAR, name VARCHAR, kind VARCHAR, unit VARCHAR, PRIMARY KEY(tenant,name))"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS signals (tenant VARCHAR, identity VARCHAR, payload VARCHAR, content_hash VARCHAR, file VARCHAR, PRIMARY KEY(tenant,identity))"
            )

    @contextmanager
    def connection(self):
        with self.lock:
            db = duckdb.connect(str(self.root / "signals.duckdb"))
            try:
                yield db
            finally:
                db.close()

    def append(self, tenant_id: str, rows: list[Signal]):
        tenant(tenant_id)
        if not rows or any(r.tenant_id != tenant_id for r in rows):
            raise PermissionError("An append requires one explicit matching tenant")
        unique: dict[str, Signal] = {}
        for row in rows:
            if row.identity in unique and unique[row.identity] != row:
                raise ValueError("Conflicting signal identity in one batch")
            unique[row.identity] = row
        with self.connection() as db:
            db.execute("BEGIN TRANSACTION")
            try:
                pending = []
                for row in unique.values():
                    spec = db.execute(
                        "SELECT kind,unit FROM signal_types WHERE tenant=? AND name=?",
                        [tenant_id, row.name],
                    ).fetchone()
                    if spec and spec != (row.kind, row.unit):
                        raise TypeError("Signal schema is immutable within a tenant")
                    if not spec:
                        db.execute(
                            "INSERT INTO signal_types VALUES (?,?,?,?)",
                            [tenant_id, row.name, row.kind, row.unit],
                        )
                    content = canonical_hash(row.payload())
                    old = db.execute(
                        "SELECT content_hash FROM signals WHERE tenant=? AND identity=?",
                        [tenant_id, row.identity],
                    ).fetchone()
                    if old and old[0] != content:
                        raise ValueError(
                            "Existing signal version cannot be overwritten"
                        )
                    if not old:
                        pending.append(row)
                if pending:
                    pending.sort(key=lambda r: r.identity)
                    batch = canonical_hash([r.payload() for r in pending])
                    directory = self.root / "parquet" / canonical_hash(tenant_id)
                    directory.mkdir(parents=True, exist_ok=True)
                    path = directory / (batch + ".parquet")
                    table = pa.Table.from_pylist(
                        [
                            {
                                **r.payload(),
                                "value": json.dumps(r.value, allow_nan=False),
                                "identity": r.identity,
                                "content_hash": canonical_hash(r.payload()),
                            }
                            for r in pending
                        ]
                    )
                    table = table.replace_schema_metadata(
                        {b"finsight.batch": batch.encode()}
                    )
                    if not path.exists():
                        temporary = path.with_suffix("." + uuid.uuid4().hex + ".tmp")
                        pq.write_table(table, temporary, compression="zstd")
                        temporary.replace(path)
                    for row in pending:
                        db.execute(
                            "INSERT INTO signals VALUES (?,?,?,?,?)",
                            [
                                tenant_id,
                                row.identity,
                                json.dumps(row.payload(), sort_keys=True),
                                canonical_hash(row.payload()),
                                str(path.relative_to(self.root)),
                            ],
                        )
                db.execute("COMMIT")
                return len(pending)
            except BaseException:
                db.execute("ROLLBACK")
                raise

    def history(
        self,
        tenant_id: str,
        *,
        as_of,
        names: list[str] | None = None,
        asset: str | None = None,
    ) -> list[Signal]:
        tenant(tenant_id)
        cutoff = AsOfContext.bind(as_of)
        with self.connection() as db:
            admitted = db.execute(
                "SELECT identity,payload,content_hash,file FROM signals WHERE tenant=? ORDER BY identity",
                [tenant_id],
            ).fetchall()
            files = {r[3] for r in admitted}
            disk = {}
            for file in files:
                path = (self.root / file).resolve()
                if not path.is_relative_to(
                    self.root / "parquet" / canonical_hash(tenant_id)
                ):
                    raise PermissionError("Parquet tenant/path substitution")
                for record in db.read_parquet(str(path)).fetchdf().to_dict("records"):
                    payload = {
                        k: v
                        for k, v in record.items()
                        if k not in {"identity", "content_hash"}
                    }
                    payload["value"] = json.loads(payload["value"])
                    if (
                        payload["tenant_id"] != tenant_id
                        or canonical_hash(payload) != record["content_hash"]
                    ):
                        raise ValueError("Parquet payload substitution")
                    disk[record["identity"]] = payload
        result = []
        for identity, payload, content, file in admitted:
            data = json.loads(payload)
            if canonical_hash(data) != content or disk.get(identity) != data:
                raise ValueError("Signal admission/Parquet binding changed")
            row = Signal(**data)
            if (
                row.observed_at <= cutoff.cutoff
                and row.available_at <= cutoff.cutoff
                and (names is None or row.name in names)
                and (asset is None or row.asset == asset)
            ):
                result.append(row)
        return sorted(
            result,
            key=lambda r: (r.observed_at, r.available_at, r.name, r.source, r.version),
        )

    def read(
        self, tenant_id: str, name: str, asset: str, *, as_of, source: str | None = None
    ) -> Signal | None:
        rows = [
            r
            for r in self.history(tenant_id, as_of=as_of, names=[name], asset=asset)
            if source is None or r.source == source
        ]
        if not rows:
            return None
        stamp = max((r.observed_at, r.available_at) for r in rows)
        latest = [r for r in rows if (r.observed_at, r.available_at) == stamp]
        if len(latest) != 1:
            raise ValueError(
                "Ambiguous predecessor: specify source or resolve the vintage conflict"
            )
        return latest[0]

    def frame(
        self,
        tenant_id: str,
        asset: str,
        specs: tuple[SignalType, ...],
        decisions: list,
        *,
        as_of,
    ) -> tuple[pd.DataFrame, list[Signal]]:
        cutoff = AsOfContext.bind(as_of)
        stamps = [utc(d) for d in decisions]
        if (
            not stamps
            or any(t > cutoff.cutoff for t in stamps)
            or stamps != sorted(set(stamps))
        ):
            raise ValueError("Invalid decision grid/cutoff")
        history = self.history(
            tenant_id, as_of=cutoff.cutoff, names=[s.name for s in specs], asset=asset
        )
        by_name = {s.name: [r for r in history if r.name == s.name] for s in specs}
        values = []
        lineage = {}
        for decision in stamps:
            row = {"decision_at": decision}
            used = []
            for spec in specs:
                candidates = [
                    r
                    for r in by_name[spec.name]
                    if r.observed_at <= decision and r.available_at <= decision
                ]
                if not candidates:
                    raise ValueError(
                        f"Unavailable {spec.name} at {decision.isoformat()}"
                    )
                maximum = max((r.observed_at, r.available_at) for r in candidates)
                latest = [
                    r for r in candidates if (r.observed_at, r.available_at) == maximum
                ]
                if len(latest) != 1:
                    raise ValueError("Ambiguous same-time input vintage")
                point = latest[0]
                if (point.kind, point.unit) != (spec.kind, spec.unit):
                    raise TypeError(
                        "Plugin declaration differs from stored signal schema"
                    )
                row[spec.name] = point.value
                used.append(point.available_at)
                lineage[point.identity] = point
            row["information_at"] = max(used)
            values.append(row)
        return validate_inputs(pd.DataFrame(values), specs), list(lineage.values())
