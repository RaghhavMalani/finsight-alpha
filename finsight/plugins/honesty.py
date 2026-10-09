"""Small automatic engineering controls; never an inference certificate."""

from __future__ import annotations
import copy
import numpy as np
import pandas as pd
from src.data.as_of import AsOfViolation
from .contracts import validate_inputs, validate_outputs


def diagnostic(prediction, target):
    a = np.asarray(prediction, dtype=float)
    b = np.asarray(target, dtype=float)
    if a.shape != b.shape or not np.isfinite(a).all() or not np.isfinite(b).all():
        raise ValueError("Invalid diagnostic family")
    correlation = (
        float(np.corrcoef(a, b)[0, 1]) if a.std() > 0 and b.std() > 0 else None
    )
    return {
        "mse": float(np.mean((a - b) ** 2)),
        "correlation": correlation,
        "rows": len(a),
        "semantics": "descriptive; no p-value, calibration or alpha claim",
    }


def controls(model_type, config, seed, input_specs, output_specs):
    reports = {}
    rng = np.random.default_rng(seed ^ 0x4E535631)
    if any(
        s.kind != "float" for s in (*input_specs, *output_specs)
    ) or model_type.task not in {"regression", "classification"}:
        for name in ("null_world", "planted_effect"):
            reports[name] = {
                "status": "UNAVAILABLE",
                "reason": "Generic numeric supervised controls do not match this adapter's task/types",
            }
    else:
        clocks = pd.date_range("2001-01-01", periods=96, tz="UTC")
        frame = pd.DataFrame({s.name: rng.normal(size=96) for s in input_specs})
        frame["decision_at"] = clocks
        frame["information_at"] = clocks
        for name, target in (
            ("null_world", rng.normal(size=96)),
            (
                "planted_effect",
                frame[input_specs[0].name].to_numpy() + rng.normal(scale=0.1, size=96),
            ),
        ):
            if model_type.task == "classification":
                target = (target > 0).astype(float)
            try:
                candidate = model_type(seed=seed, **copy.deepcopy(config))
                train = frame.iloc[:64].copy()
                train["target"] = target[:64]
                train["target_information_at"] = clocks[:64]
                candidate.fit(train)
                rows = validate_inputs(frame.iloc[64:].copy(), input_specs)
                output = validate_outputs(
                    candidate.predict(rows.copy()), rows, output_specs
                )
                reports[name] = {
                    "status": "MEASURED",
                    "evidence_scope": "ENGINEERING_CONTROL_ONLY",
                    "worlds": 1,
                    "type_i_error_estimated": False,
                    "certificate": False,
                    "metrics": diagnostic(output.iloc[:, 0], target[64:]),
                }
            except Exception as error:
                reports[name] = {
                    "status": "UNAVAILABLE",
                    "reason": str(error),
                    "certificate": False,
                }
    # Probe the *same boundary validator* before any estimator can see data.
    probe = pd.DataFrame({s.name: [0.0] for s in input_specs})
    probe["decision_at"] = pd.to_datetime(["2001-01-01T00:00:00Z"])
    probe["information_at"] = pd.to_datetime(["2001-01-02T00:00:00Z"])
    try:
        validate_inputs(probe, input_specs)
    except AsOfViolation:
        reports["leakage_sabotage"] = {
            "status": "REJECTED_AS_REQUIRED",
            "case": "feature published after decision",
        }
    else:
        raise AssertionError("Future feature sabotage escaped the platform boundary")
    return reports


def factor_exposure(prediction, factors: pd.DataFrame | None):
    if factors is None or factors.empty:
        return {
            "status": "UNAVAILABLE",
            "reason": "No availability-admitted factor matrix supplied; neutrality is unestablished",
        }
    y = np.asarray(prediction, dtype=float)
    x = factors.to_numpy(dtype=float)
    if len(x) != len(y) or not np.isfinite(x).all():
        raise ValueError("Invalid admitted factor matrix")
    x = np.column_stack([np.ones(len(x)), x])
    if np.linalg.matrix_rank(x) < x.shape[1] or len(y) <= x.shape[1]:
        return {
            "status": "UNAVAILABLE",
            "reason": "Factor regression is rank deficient or too short",
        }
    coefficients = np.linalg.lstsq(x, y, rcond=None)[0]
    residual = y - x @ coefficients
    total = float(np.sum((y - y.mean()) ** 2))
    return {
        "status": "MEASURED",
        "coefficients": dict(
            zip(["intercept", *factors.columns], coefficients.tolist())
        ),
        "r_squared": 1 - float(residual @ residual) / total if total else None,
        "semantics": "OLS point exposure only; no certified inference, confidence intervals or neutrality verdict",
    }
