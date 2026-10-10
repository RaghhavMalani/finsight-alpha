"""Time-series computations over point-in-time signal windows.

A series computation reads every admitted observation visible at one cutoff and
returns the state at that cutoff plus bounded paths. There is no target, ranking,
nested split or holdout: unsupervised and descriptive computations never record a
holdout opening. Identity reuses the scoped static dependency manifest; Git HEAD
stays execution provenance outside identity.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import ClassVar

import pandas as pd

from src.data.as_of import AsOfContext, AsOfViolation
from src.truth.contracts import canonical_hash
from src.truth.run_registry import RunRegistry

from .contracts import InferenceCapability, SignalType, tenant, utc

CLAIMS = {
    "inference_certified": False,
    "market_claim_eligible": False,
    "causal_claim_eligible": False,
    "validated_alpha": False,
}
STATUSES = {"COMPUTED", "PARTIAL", "UNAVAILABLE"}
SEVERITIES = {"INFO", "LOW", "MEDIUM", "HIGH"}
SERIES_KERNEL = ("finsight.plugins.series", "finsight.plugins.derived")
MAX_RESULT_BYTES = 16 * 1024 * 1024


class SeriesUnavailable(ValueError):
    """Expected evidence insufficiency: sealed as UNAVAILABLE, never a crash."""


@dataclass(frozen=True)
class SeriesInput:
    name: str
    kind: str = "float"
    unit: str = "dimensionless"
    role: str = "primary"
    minimum: int = 1

    @property
    def spec(self):
        return SignalType(self.name, self.kind, self.unit)


class SeriesModel(ABC):
    """Declare windows and outputs; the platform owns reads, lineage and sealing."""

    name: ClassVar[str] = ""
    series_inputs: ClassVar[tuple[SeriesInput, ...]] = ()
    outputs: ClassVar[tuple[SignalType, ...]] = ()
    derived_outputs: ClassVar[tuple[SignalType, ...]] = ()
    config_keys: ClassVar[frozenset[str]] = frozenset()
    version: ClassVar[str] = "1"
    capability: ClassVar[InferenceCapability] = InferenceCapability()
    computation_dependencies: ClassVar[tuple[str, ...]] = ()
    dynamic_imports: ClassVar[dict[str, str]] = {}

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        declared = tuple(cls.__dict__.get("computation_dependencies", ()))
        cls.computation_dependencies = SERIES_KERNEL + tuple(
            d for d in declared if d not in SERIES_KERNEL
        )

    def __init__(self, *, seed: int = 42, **config):
        if type(seed) is not int or not 0 <= seed < 2**32:
            raise ValueError("Seed must be an unsigned 32-bit integer")
        unknown = set(config) - set(self.config_keys)
        if unknown:
            raise ValueError(f"Unknown configuration for {self.name}: {sorted(unknown)}")
        json.dumps(config, sort_keys=True, allow_nan=False)
        self.seed, self.config = seed, dict(config)

    @classmethod
    def declarations(cls):
        if not cls.name or not cls.series_inputs or not cls.outputs:
            raise ValueError("A series plugin declares a name, inputs and outputs")
        names = [i.name for i in cls.series_inputs]
        if len(set((i.role, i.name) for i in cls.series_inputs)) != len(names):
            raise ValueError("Duplicate series input declaration")
        if any(
            n.startswith("target") or n in {"label", "future_return"} for n in names
        ):
            raise ValueError("Targets cannot be declared as series inputs")
        outputs = [o.name for o in cls.outputs + cls.derived_outputs]
        if len(set(outputs)) != len(outputs):
            raise ValueError("Duplicate output declaration")
        return {
            "inputs": [
                {**asdict(i.spec), "role": i.role, "minimum": i.minimum}
                for i in cls.series_inputs
            ],
            "outputs": [asdict(o) for o in cls.outputs],
            "derived_outputs": [asdict(o) for o in cls.derived_outputs],
        }

    @abstractmethod
    def compute(self, windows: dict[str, pd.DataFrame], context: dict) -> dict:
        """Return status, state_at, current, paths, diagnostics, issues, derived."""


def latest_vintages(rows, spec):
    """One value per observation: the latest vintage visible at the cutoff."""
    by_observation = {}
    for row in rows:
        if (row.kind, row.unit) != (spec.kind, spec.unit):
            raise TypeError(
                f"Series declaration differs from stored schema for {spec.name}"
            )
        key = row.observed_at
        current = by_observation.get(key)
        if current is None or row.available_at > current.available_at:
            by_observation[key] = row
        elif row.available_at == current.available_at and row != current:
            raise ValueError(
                f"Ambiguous same-time vintage for {spec.name} at {key.isoformat()}"
            )
    return [by_observation[k] for k in sorted(by_observation)]


def window_frame(rows):
    return pd.DataFrame(
        {
            "observed_at": pd.to_datetime([r.observed_at for r in rows], utc=True),
            "available_at": pd.to_datetime([r.available_at for r in rows], utc=True),
            "value": [r.value for r in rows],
        }
    )


def _bindings(store, tenant_id, rows):
    """Batch admission lookup. Unmapped inputs fail closed for series runs."""
    with store.connection() as db:
        records = db.execute(
            "SELECT identity,payload,hash FROM signal_admissions WHERE tenant=?",
            [tenant_id],
        ).fetchall()
    admitted = {identity: (payload, digest) for identity, payload, digest in records}
    result = {}
    for row in rows:
        found = admitted.get(row.identity)
        if found is None:
            raise ValueError(
                f"LEGACY_UNMAPPED input {row.name}@{row.observed_at.isoformat()}: "
                "series computations require Data Organ or plugin-output admission"
            )
        payload = json.loads(found[0])
        if (
            canonical_hash(payload) != found[1]
            or payload["signal_id"] != row.identity
            or payload["signal_sha256"] != canonical_hash(row.payload())
            or payload["source_version_id"] != row.version
        ):
            raise ValueError("Signal admission substitution")
        result[row.identity] = payload
    return result


def _validate_result(model_type, value, cutoff):
    if not isinstance(value, dict) or value.get("status") not in STATUSES:
        raise TypeError("Series result requires a declared status")
    allowed = {
        "status",
        "state_at",
        "current",
        "paths",
        "diagnostics",
        "issues",
        "derived",
        "reason",
        "missing",
    }
    if set(value) - allowed:
        raise TypeError("Undeclared series result fields: " + str(set(value) - allowed))
    current = value.get("current", {})
    if set(current) != {o.name for o in model_type.outputs}:
        raise TypeError("Series current outputs differ from declarations")
    checked = {}
    for spec in model_type.outputs:
        item = current[spec.name]
        checked[spec.name] = None if item is None else spec.validate(item)
    state_at = value.get("state_at")
    if state_at is not None and utc(state_at) > cutoff:
        raise AsOfViolation("State timestamp is after the computation cutoff")
    derived = {}
    declared = {o.name: o for o in model_type.derived_outputs}
    for name, series in (value.get("derived") or {}).items():
        if name not in declared:
            raise TypeError("Undeclared derived output " + name)
        points = []
        for stamp, item in series:
            clock = utc(stamp)
            if clock > cutoff:
                raise AsOfViolation("Derived observation after the cutoff")
            if item is not None:
                points.append([clock.isoformat(), declared[name].validate(item)])
        derived[name] = points
    issues = []
    for issue in value.get("issues") or []:
        if (
            not isinstance(issue, dict)
            or not isinstance(issue.get("kind"), str)
            or issue.get("severity") not in SEVERITIES
            or not isinstance(issue.get("reason"), str)
        ):
            raise TypeError("Series issues need kind, severity and reason")
        issues.append(issue)
    result = {
        "status": value["status"],
        "state_at": utc(state_at).isoformat() if state_at is not None else None,
        "current": checked,
        "paths": value.get("paths") or {},
        "diagnostics": value.get("diagnostics") or {},
        "issues": issues,
        "derived": derived,
        "missing": list(value.get("missing") or []),
    }
    if value.get("reason") is not None:
        result["reason"] = str(value["reason"])
    if value["status"] == "COMPUTED" and any(v is None for v in checked.values()):
        raise ValueError("COMPUTED results cannot carry missing current outputs")
    return result


class SeriesRunner:
    """Seal descriptive series computations with zero holdout accounting."""

    def __init__(self, store, registry: RunRegistry, *, root: Path | str):
        self.store, self.registry, self.root = store, registry, Path(root).resolve()
        self._history = {}

    def _visible(self, tenant_id, cutoff, names, assets):
        with self.store.connection() as db:
            count = db.execute(
                "SELECT count(*) FROM signals WHERE tenant=?", [tenant_id]
            ).fetchone()[0]
        key = (tenant_id, cutoff.isoformat(), count)
        if key not in self._history:
            self._history = {
                key: self.store.history(tenant_id, as_of=cutoff)
            }
        return [
            r
            for r in self._history[key]
            if r.name in names and r.asset in assets
        ]

    def compute(
        self,
        model_type,
        *,
        tenant_id: str,
        asset: str,
        as_of,
        assets: dict | None = None,
        config: dict | None = None,
        seed: int = 42,
        context: dict | None = None,
        scope: str = "LOCAL_ONLY",
    ):
        from .dependencies import execution_provenance, manifest

        if not (isinstance(model_type, type) and issubclass(model_type, SeriesModel)):
            raise TypeError("SeriesRunner only computes registered SeriesModel plugins")
        tenant(tenant_id)
        cutoff = AsOfContext.bind(as_of)
        roles = {"primary": asset, **(assets or {})}
        config = dict(config or {})
        context = dict(context or {})
        json.dumps([roles, config, context], sort_keys=True, allow_nan=False)
        openings_before = self.registry.opening_count(tenant_id)
        attempt = self.registry.begin(
            tenant_id,
            {
                "plugin": model_type.name,
                "asset": asset,
                "as_of": cutoff.isoformat,
                "seed": seed,
                "config": config,
                "mode": "SERIES_COMPUTATION",
            },
        )
        run_id, contract, execution = None, None, None
        try:
            declarations = model_type.declarations()
            model = model_type(seed=seed, **config)
            missing_roles = {i.role for i in model_type.series_inputs} - set(roles)
            if missing_roles:
                raise ValueError("Unbound series input roles: " + str(missing_roles))
            visible = self._visible(
                tenant_id,
                cutoff.cutoff,
                {i.name for i in model_type.series_inputs},
                {roles[i.role] for i in model_type.series_inputs},
            )
            windows, used = {}, []
            for item in model_type.series_inputs:
                rows = latest_vintages(
                    [
                        r
                        for r in visible
                        if r.name == item.name and r.asset == roles[item.role]
                    ],
                    item.spec,
                )
                used.extend(rows)
                key = item.name if item.role == "primary" else f"{item.role}.{item.name}"
                windows[key] = window_frame(rows)
            bindings = _bindings(self.store, tenant_id, used)
            from .derived import verify_bindings

            verify_bindings(self.registry, tenant_id, bindings, used)
            ordered = sorted(used, key=lambda r: r.identity)
            lineage = {
                "data_hash": canonical_hash([r.payload() for r in ordered]),
                "lineage_digest": canonical_hash(
                    [bindings[r.identity] for r in ordered]
                ),
                "admissions": sorted(
                    {b["admission_id"] for b in bindings.values() if "admission_id" in b}
                ),
                "source_versions": sorted(
                    {b["source_version_id"] for b in bindings.values()}
                ),
                "producer_runs": sorted(
                    {
                        b["producer_run_id"]
                        for b in bindings.values()
                        if b.get("kind") == "PLUGIN_OUTPUT"
                    }
                ),
                "licences": sorted({r.licence for r in used}),
                "sources": sorted({r.source for r in used}),
                "windows": {
                    key: {
                        "observations": len(frame),
                        "first_observed": frame.observed_at.min().isoformat()
                        if len(frame)
                        else None,
                        "last_observed": frame.observed_at.max().isoformat()
                        if len(frame)
                        else None,
                    }
                    for key, frame in windows.items()
                },
            }
            code = manifest(model_type, self.root)
            execution = execution_provenance(self.root, code)
            contract = {
                "schema_version": "plugin-series-computation/1",
                "tenant_id": tenant_id,
                "plugin": model_type.name,
                "asset": asset,
                "assets": roles,
                "as_of": cutoff.isoformat,
                "seed": seed,
                "plugin_version": model_type.version,
                "declarations": declarations,
                "code": code,
                "config": config,
                "context": context,
                "scope": scope,
                "lineage": lineage,
            }
            run_id = self.registry.identity(contract)
            self.registry.event(
                tenant_id,
                attempt,
                run_id,
                "RUN_BOUND",
                {"contract": contract, "execution": execution},
            )
            old = self.registry.read(tenant_id, run_id)
            if old:
                self.registry.event(
                    tenant_id,
                    attempt,
                    run_id,
                    "RESULT_REUSED",
                    {"status": old["status"], "holdout_opened": False},
                )
                return old
            self.registry.event(
                tenant_id, attempt, run_id, "COMPUTATION_STARTED", {"holdout": None}
            )
            short = [
                f"{key}: {len(windows[key])} < {i.minimum}"
                for i in model_type.series_inputs
                for key in [i.name if i.role == "primary" else f"{i.role}.{i.name}"]
                if len(windows[key]) < i.minimum
            ]
            if short:
                raise SeriesUnavailable(
                    "Insufficient visible observations at the cutoff: " + "; ".join(short)
                )
            produced = _validate_result(
                model_type,
                model.compute(
                    {k: v.copy(deep=True) for k, v in windows.items()},
                    {**context, "asset": asset, "assets": roles, "as_of": cutoff.isoformat},
                ),
                cutoff.cutoff,
            )
            result = {
                "schema_version": "plugin-series-run/1",
                "run_id": run_id,
                "tenant_id": tenant_id,
                "contract": contract,
                "execution": execution,
                "computation_ready": produced["status"] != "UNAVAILABLE",
                "claims": dict(CLAIMS),
                "inference_capability": asdict(model_type.capability),
                "holdout_openings": 0,
                **produced,
            }
            result = json.loads(json.dumps(result, allow_nan=False))
            if len(json.dumps(result)) > MAX_RESULT_BYTES:
                raise ValueError("Series result exceeds the sealed-payload bound")
            self.registry.seal(tenant_id, run_id, result)
            self.registry.event(
                tenant_id,
                attempt,
                run_id,
                "ATTEMPT_COMPLETED",
                {"status": result["status"], "holdout_opened": False},
            )
            return result
        except Exception as error:
            expected = isinstance(error, SeriesUnavailable)
            if run_id and self.registry.read(tenant_id, run_id) is None:
                self.registry.seal(
                    tenant_id,
                    run_id,
                    {
                        "schema_version": "plugin-series-run/1",
                        "run_id": run_id,
                        "tenant_id": tenant_id,
                        "contract": contract,
                        "execution": execution,
                        "status": "UNAVAILABLE",
                        "computation_ready": False,
                        "claims": dict(CLAIMS),
                        "holdout_openings": 0,
                        "reason": str(error),
                        "state_at": None,
                        "current": {o.name: None for o in model_type.outputs},
                        "paths": {},
                        "diagnostics": {},
                        "derived": {},
                        "missing": [],
                        "issues": [
                            {
                                "kind": "SERIES_UNAVAILABLE"
                                if expected
                                else "PLUGIN_RUN_FAILED",
                                "severity": "INFO" if expected else "HIGH",
                                "reason": str(error),
                            }
                        ],
                    },
                )
            self.registry.event(
                tenant_id,
                attempt,
                run_id,
                "ATTEMPT_FAILED",
                {
                    "type": type(error).__name__,
                    "reason": str(error),
                    "holdout_opened": False,
                },
            )
            if expected and run_id:
                return self.registry.read(tenant_id, run_id)
            raise
        finally:
            if self.registry.opening_count(tenant_id) != openings_before:
                raise RuntimeError("A series computation must never open a holdout")
