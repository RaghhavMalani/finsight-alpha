"""Explicit stage adapters; unsupported estimators never get invented stages."""
from __future__ import annotations

from typing import Protocol
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import log_loss, roc_auc_score


class ModelTraceAdapter(Protocol):
    def stages(self, model, x_validation, y_validation, feature_names): ...


class SklearnGradientBoostingTrace:
    def stages(self, model, x_validation, y_validation, feature_names):
        if not isinstance(model, GradientBoostingClassifier):
            raise TypeError("Adapter requires sklearn GradientBoostingClassifier")
        cumulative = np.zeros(len(feature_names), dtype=np.float64)
        for stage, probabilities in enumerate(model.staged_predict_proba(x_validation), 1):
            for tree in model.estimators_[stage - 1]:
                cumulative += tree.tree_.compute_feature_importances(normalize=False)
            total = cumulative.sum()
            importance = cumulative / total if total else cumulative
            yield {
                "stage": stage,
                "val_logloss": float(log_loss(y_validation, probabilities, labels=[0, 1])),
                "val_auc": float(roc_auc_score(y_validation, probabilities[:, 1]))
                if len(set(y_validation)) == 2 else None,
                "feature_importance": importance.tolist(),
            }


def adapter_for(model_name: str):
    return SklearnGradientBoostingTrace() if model_name == "gradient_boosting" else None
