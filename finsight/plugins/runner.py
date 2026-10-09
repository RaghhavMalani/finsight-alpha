"""Platform-owned nested selection, accounting, traces and diagnostic hooks."""

from __future__ import annotations
from dataclasses import asdict
from copy import deepcopy
import importlib.metadata
import inspect
import json
from pathlib import Path
import subprocess
import platform
import numpy as np
import pandas as pd
from src.truth.contracts import canonical_hash
from src.truth.run_registry import RunRegistry
from src.data.as_of import AsOfContext, AsOfViolation
from .contracts import tenant, validate_inputs, validate_outputs
from .splits import nested
from .honesty import controls, diagnostic, factor_exposure

CLAIMS = {
    "inference_certified": False,
    "market_claim_eligible": False,
    "causal_claim_eligible": False,
    "validated_alpha": False,
}
DEPENDENCIES = (
    "numpy",
    "pandas",
    "duckdb",
    "pyarrow",
    "scikit-learn",
    "scipy",
    "statsmodels",
    "hmmlearn",
)


def runtime_identity():
    return {
        "python": platform.python_version(),
        "system": platform.system(),
        "machine": platform.machine(),
    }


def code_identity(model_type, root: Path):
    commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=root, text=True
    ).strip()
    files = sorted((root / "finsight/plugins").glob("*.py")) + sorted(
        (root / "src").rglob("*.py")
    )
    module = Path(inspect.getfile(model_type)).resolve()
    from hashlib import sha256

    return {
        "commit": commit,
        "plugin": model_type.__module__ + "." + model_type.__qualname__,
        "plugin_source_sha256": sha256(
            inspect.getsource(model_type).encode()
        ).hexdigest(),
        "plugin_module_sha256": sha256(module.read_bytes()).hexdigest(),
        "platform_source_sha256": canonical_hash(
            {
                p.relative_to(root).as_posix(): sha256(p.read_bytes()).hexdigest()
                for p in files
            }
        ),
        "dependencies": {
            name: importlib.metadata.version(name) for name in DEPENDENCIES
        },
        "runtime": runtime_identity(),
        "dirty_computation": not module.is_relative_to(root)
        or bool(
            subprocess.check_output(
                [
                    "git",
                    "status",
                    "--porcelain",
                    "--",
                    "finsight",
                    "src",
                    str(module.relative_to(root))
                    if module.is_relative_to(root)
                    else "examples",
                ],
                cwd=root,
                text=True,
            ).strip()
        ),
    }


class Runner:
    def __init__(self, store, registry: RunRegistry, *, root: Path | str):
        self.store, self.registry, self.root = store, registry, Path(root).resolve()

    def run(
        self,
        model_type,
        *,
        tenant_id: str,
        asset: str,
        decisions: list,
        as_of,
        targets: list | None = None,
        target_information_at: list | None = None,
        seed: int = 42,
        candidates: list[dict] | None = None,
        horizon: int = 1,
        embargo: int = 0,
        scope: str = "LOCAL_ONLY",
        factors: pd.DataFrame | None = None,
    ):
        tenant(tenant_id)
        attempt = self.registry.begin(
            tenant_id,
            {
                "plugin": model_type.__name__,
                "asset": asset,
                "as_of": str(as_of),
                "seed": seed,
                "candidates": candidates if candidates is not None else [{}],
            },
        )
        run_id = None
        opened = False
        try:
            input_specs, output_specs = model_type.declarations()
            candidate_configs = deepcopy(candidates) if candidates is not None else [{}]
            if not candidate_configs or len(candidate_configs) > 32:
                raise ValueError(
                    "Declare between one and 32 finite candidate configurations"
                )
            json.dumps(candidate_configs, sort_keys=True, allow_nan=False)
            if any(not isinstance(c, dict) or "seed" in c for c in candidate_configs):
                raise ValueError(
                    "Candidate configurations are objects; the seed belongs to the run"
                )
            cutoff = AsOfContext.bind(as_of)
            features, lineage = self.store.frame(
                tenant_id, asset, input_specs, decisions, as_of=cutoff.cutoff
            )
            computation = model_type.task == "computation"
            if computation:
                if (
                    len(candidate_configs) != 1
                    or targets is not None
                    or target_information_at is not None
                ):
                    raise ValueError(
                        "Computation adapters take one declared configuration and no invented target/ranking"
                    )
                # Only the existing split helper needs a placeholder; it is never passed to an engine.
                targets = [0.0] * len(features)
                target_information_at = features.decision_at.tolist()
            elif targets is None or target_information_at is None:
                raise ValueError(
                    "Supervised adapters require targets and realization clocks"
                )
            if any(
                pd.isna(t) or pd.Timestamp(t).tzinfo is None
                for t in target_information_at
            ):
                raise ValueError("Target clocks require explicit timezones")
            if any(pd.Timestamp(t) > cutoff.cutoff for t in target_information_at):
                raise AsOfViolation("Future target supplied at the run cutoff")
            labeled, split = nested(
                features,
                model_type.inputs,
                targets,
                target_information_at,
                horizon=horizon,
                embargo=embargo,
            )
            if not np.isfinite(np.asarray(targets, dtype=float)).all():
                raise TypeError("Target values must be finite numeric scalars")
            if factors is not None:
                # Factors carry their own row information clocks; no bare array is accepted.
                if (
                    not factors.index.equals(features.index)
                    or "information_at" not in factors
                ):
                    raise ValueError(
                        "Factor exposure needs matching rows and explicit information_at"
                    )
                if any(
                    pd.isna(t) or pd.Timestamp(t).tzinfo is None
                    for t in factors.information_at
                ):
                    raise ValueError("Factor information needs finite, explicit clocks")
                if (
                    pd.to_datetime(factors.information_at, utc=True)
                    > features.decision_at
                ).any():
                    raise AsOfViolation("Future factor information")
            contract = {
                "tenant_id": tenant_id,
                "asset": asset,
                "as_of": cutoff.isoformat,
                "seed": seed,
                "plugin_version": model_type.version,
                "declarations": {
                    "inputs": [asdict(s) for s in input_specs],
                    "outputs": [asdict(s) for s in output_specs],
                },
                "code": code_identity(model_type, self.root),
                "configs": candidate_configs,
                "splits": split,
                "scope": scope,
                "data_hash": canonical_hash(
                    [r.payload() for r in sorted(lineage, key=lambda r: r.identity)]
                ),
                "target_hash": None
                if computation
                else canonical_hash(
                    {
                        "values": list(targets),
                        "information_at": [
                            pd.Timestamp(t).isoformat() for t in target_information_at
                        ],
                    }
                ),
                "factor_hash": canonical_hash(factors.to_dict("list"))
                if factors is not None
                else None,
            }
            run_id = self.registry.identity(contract)
            self.registry.event(
                tenant_id, attempt, run_id, "RUN_BOUND", {"contract": contract}
            )
            old = self.registry.read(tenant_id, run_id)
            if old:
                self.registry.event(
                    tenant_id,
                    attempt,
                    run_id,
                    "RESULT_REUSED",
                    {"status": old["status"], "holdout_reopened": False},
                )
                return old
            groups = split["groups"]
            ranking = []
            traces = []
            for index, config in enumerate(candidate_configs):
                self.registry.event(
                    tenant_id,
                    attempt,
                    run_id,
                    "CANDIDATE_STARTED",
                    {"candidate": index, "config": config},
                )
                candidate = model_type(seed=seed, **deepcopy(config))
                candidate.fit(
                    (features if computation else labeled)
                    .loc[groups["fit"]]
                    .copy(deep=True)
                )
                rows = validate_inputs(features.loc[groups["validation"]], input_specs)
                output = validate_outputs(
                    candidate.predict(rows.copy(deep=True)), rows, output_specs
                )
                if not computation and output_specs[0].kind not in {
                    "float",
                    "int",
                    "bool",
                }:
                    raise TypeError(
                        "A numeric first output is required for supervised validation ranking"
                    )
                metrics = (
                    {
                        "status": "UNAVAILABLE",
                        "reason": "Computation output has no supervised target or validation ranking",
                        "rows": len(rows),
                    }
                    if computation
                    else diagnostic(
                        output.iloc[:, 0], labeled.loc[groups["validation"], "target"]
                    )
                )
                ranking.append(
                    {"candidate": index, "config": config, "validation": metrics}
                )
                traces.append(
                    {
                        "step": index,
                        "stage": "validation",
                        "rows": len(rows),
                        "metrics": metrics,
                    }
                )
                self.registry.event(
                    tenant_id, attempt, run_id, "CANDIDATE_COMPLETED", ranking[-1]
                )
            selected = (
                ranking[0]
                if computation
                else min(
                    ranking, key=lambda r: (r["validation"]["mse"], r["candidate"])
                )
            )
            self.registry.event(
                tenant_id, attempt, run_id, "SELECTION_FROZEN", selected
            )
            winner = model_type(seed=seed, **deepcopy(selected["config"]))
            winner.fit(
                (features if computation else labeled)
                .loc[groups["development"]]
                .copy(deep=True)
            )
            family = canonical_hash(
                {
                    "data": contract["data_hash"],
                    "target": contract["target_hash"],
                    "holdout": groups["holdout"],
                }
            )
            self.registry.holdout(tenant_id, run_id, family, attempt)
            opened = True
            rows = validate_inputs(features.loc[groups["holdout"]], input_specs)
            prediction = validate_outputs(
                winner.predict(rows.copy(deep=True)), rows, output_specs
            )
            metrics = (
                {
                    "status": "UNAVAILABLE",
                    "reason": "No ground truth target for this computation adapter",
                    "rows": len(rows),
                }
                if computation
                else diagnostic(
                    prediction.iloc[:, 0], labeled.loc[groups["holdout"], "target"]
                )
            )
            traces.append(
                {
                    "step": len(traces),
                    "stage": "holdout",
                    "rows": len(rows),
                    "metrics": metrics,
                }
            )
            honesty = controls(
                model_type, selected["config"], seed, input_specs, output_specs
            )
            factor_rows = (
                factors.loc[groups["holdout"]].drop(columns="information_at")
                if factors is not None
                else None
            )
            honesty["factor_neutrality"] = (
                factor_exposure(prediction.iloc[:, 0], factor_rows)
                if output_specs[0].kind in {"float", "int", "bool"}
                else {
                    "status": "UNAVAILABLE",
                    "reason": "Categorical output has no numeric factor exposure",
                }
            )
            issue = []
            for name, result in honesty.items():
                self.registry.event(
                    tenant_id, attempt, run_id, "HONESTY_HOOK", {"hook": name, **result}
                )
                if result["status"] == "UNAVAILABLE":
                    issue.append(
                        {
                            "id": canonical_hash([run_id, name]),
                            "severity": "INFO",
                            "kind": "UNSUPPORTED_EVIDENCE",
                            "hook": name,
                            "reason": result["reason"],
                            "run_id": run_id,
                            "status": "OPEN",
                        }
                    )
            if self.registry.opening_count(tenant_id, family=family) > 1:
                issue.append(
                    {
                        "id": canonical_hash([family, "openings"]),
                        "severity": "HIGH",
                        "kind": "REPEATED_HOLDOUT_OPENING",
                        "run_id": run_id,
                        "status": "OPEN",
                        "reason": "Another registered run contract has already opened this data/split family",
                    }
                )
            extension = winner.trace()
            if extension is not None:
                json.dumps(extension, allow_nan=False)
            result = {
                "schema_version": "plugin-run/1",
                "run_id": run_id,
                "tenant_id": tenant_id,
                "status": "COMPUTED",
                "computation_ready": True,
                "claims": dict(CLAIMS),
                "inference_capability": asdict(model_type.capability),
                "contract": contract,
                "source_lineage": [
                    {"source": r.source, "licence": r.licence, "version": r.version}
                    for r in lineage
                ],
                "arena": {
                    "ranking": ranking,
                    "selected": selected,
                    "selection_scope": "declared_computation; no ranking"
                    if computation
                    else "validation_only",
                },
                "metrics": metrics,
                "honesty": honesty,
                "issues": issue,
                "observatory": {
                    "frames": traces,
                    "extension": extension,
                    "semantics": "Actual platform selection/evaluation events; no invented model stages",
                },
                "predictions": [
                    {
                        "decision_at": pd.Timestamp(
                            rows.loc[i, "decision_at"]
                        ).isoformat(),
                        "signals": {
                            name: prediction.loc[i, name].item()
                            if hasattr(prediction.loc[i, name], "item")
                            else prediction.loc[i, name]
                            for name in prediction
                        },
                    }
                    for i in rows.index
                ],
                "holdout_openings": 1,
                "artifacts": [],
            }
            result = json.loads(json.dumps(result, allow_nan=False))
            self.registry.seal(tenant_id, run_id, result)
            self.registry.event(
                tenant_id, attempt, run_id, "ATTEMPT_COMPLETED", {"status": "COMPUTED"}
            )
            return result
        except Exception as error:
            if run_id and self.registry.read(tenant_id, run_id) is None:
                self.registry.seal(
                    tenant_id,
                    run_id,
                    {
                        "schema_version": "plugin-run/1",
                        "run_id": run_id,
                        "tenant_id": tenant_id,
                        "contract": contract,
                        "status": "UNAVAILABLE",
                        "computation_ready": False,
                        "claims": dict(CLAIMS),
                        "reason": str(error),
                        "holdout_openings": int(opened),
                        "issues": [
                            {
                                "kind": "PLUGIN_RUN_FAILED",
                                "severity": "HIGH",
                                "reason": str(error),
                                "run_id": run_id,
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
                    "holdout_opened": opened,
                },
            )
            raise
