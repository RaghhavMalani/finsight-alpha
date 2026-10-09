"""Use the existing chronological splitter and audit actual information clocks."""

from __future__ import annotations
import pandas as pd
from src.ml.point_in_time_modeling import build_signal_splits
from src.data.as_of import AsOfViolation


def nested(frame, names, targets, target_information_at, *, horizon=1, embargo=0):
    if len(targets) != len(frame) or len(target_information_at) != len(frame):
        raise ValueError("Incomplete target family")
    labeled = frame.copy(deep=True)
    labeled["target"] = list(targets)
    labeled["target_information_at"] = pd.to_datetime(target_information_at, utc=True)
    if (
        labeled.target.isna().any()
        or (labeled.target_information_at < labeled.decision_at).any()
    ):
        raise ValueError("Target labels require truthful realization clocks")
    splits = build_signal_splits(
        labeled, list(names), "target", horizon=horizon, embargo=embargo
    )
    groups = {
        "fit": list(splits["X_fit"].index),
        "validation": list(splits["X_validation"].index),
        "development": list(splits["X_train"].index),
        "holdout": list(splits["X_test"].index),
    }
    for before, after in (("fit", "validation"), ("development", "holdout")):
        if not groups[before] or not groups[after]:
            raise ValueError("Empty nested chronological split")
        end = labeled.loc[groups[before], "target_information_at"].max()
        start = labeled.loc[groups[after], "decision_at"].min()
        if end >= start or set(groups[before]) & set(groups[after]):
            raise AsOfViolation(
                "Training target information crosses the next decision boundary"
            )
    contract = {
        "horizon_purge_rows": horizon,
        "embargo_rows": embargo,
        "groups": groups,
        "fit_information_end": labeled.loc[groups["fit"], "target_information_at"]
        .max()
        .isoformat(),
        "validation_start": labeled.loc[groups["validation"], "decision_at"]
        .min()
        .isoformat(),
        "development_information_end": labeled.loc[
            groups["development"], "target_information_at"
        ]
        .max()
        .isoformat(),
        "holdout_start": labeled.loc[groups["holdout"], "decision_at"]
        .min()
        .isoformat(),
        "selection": "validation_only; final holdout access registered before prediction",
    }
    return labeled, contract
