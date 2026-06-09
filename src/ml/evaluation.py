"""Model evaluation metrics.

Provides functions to evaluate both classification and regression models
using scikit-learn metrics.
"""

import pandas as pd
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    classification_report
)


def evaluate_classification_model(y_true, y_pred, y_pred_proba=None) -> dict:
    """Evaluate a classification model.
    
    Args:
        y_true: True target values.
        y_pred: Predicted target values.
        y_pred_proba: Predicted probabilities (optional, for ROC-AUC).
        
    Returns:
        A dictionary containing classification metrics.
    """
    metrics = {
        "accuracy": accuracy_score(y_true, y_pred),
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "f1_score": f1_score(y_true, y_pred, zero_division=0)
    }
    
    if y_pred_proba is not None:
        try:
            metrics["roc_auc"] = roc_auc_score(y_true, y_pred_proba)
        except ValueError:
            # Can happen if y_true has only one class in the test set
            metrics["roc_auc"] = np.nan
            
    return metrics

def calculate_baseline_accuracy(y_true: pd.Series) -> float:
    """Calculate the accuracy of predicting the majority class.
    
    Args:
        y_true: True labels.
        
    Returns:
        Baseline accuracy (float).
    """
    if len(y_true) == 0:
        return 0.0
    majority_class_count = pd.Series(y_true).value_counts().max()
    return majority_class_count / len(y_true)

def calculate_model_edge(model_metric: float, baseline_metric: float) -> float:
    """Calculate the absolute edge of the model over the baseline.
    
    Args:
        model_metric: Performance of the model (e.g., accuracy).
        baseline_metric: Performance of the baseline.
        
    Returns:
        Edge (model - baseline).
    """
    return model_metric - baseline_metric

def calculate_rolling_hit_rate(y_true: pd.Series, y_pred: pd.Series, window: int = 60) -> pd.Series:
    """Calculate rolling hit rate (accuracy) over time.
    
    Args:
        y_true: True labels.
        y_pred: Predicted labels.
        window: Rolling window size.
        
    Returns:
        Series of rolling hit rate.
    """
    hits = (np.array(y_true) == np.array(y_pred)).astype(int)
    hits_series = pd.Series(hits, index=y_true.index if hasattr(y_true, "index") else None)
    return hits_series.rolling(window=window).mean()

def calculate_precision_recall_threshold_table(y_true: pd.Series, y_pred_proba: pd.Series) -> pd.DataFrame:
    """Evaluate precision, recall, and F1 across various probability thresholds.
    
    Args:
        y_true: True labels.
        y_pred_proba: Predicted probabilities for the positive class.
        
    Returns:
        DataFrame with threshold, precision, recall, f1, and number_of_signals.
    """
    results = []
    # Test thresholds from 0.5 to 0.9 in steps of 0.05
    thresholds = np.arange(0.5, 0.95, 0.05)
    
    for t in thresholds:
        preds = (np.array(y_pred_proba) >= t).astype(int)
        
        # calculate precision, recall, f1 safely
        tp = np.sum((preds == 1) & (np.array(y_true) == 1))
        fp = np.sum((preds == 1) & (np.array(y_true) == 0))
        fn = np.sum((preds == 0) & (np.array(y_true) == 1))
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        
        results.append({
            "threshold": t,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "number_of_signals": int(np.sum(preds))
        })
        
    return pd.DataFrame(results)

def evaluate_regression_model(y_true, y_pred) -> dict:
    """Evaluate a regression model.
    
    Args:
        y_true: True target values.
        y_pred: Predicted target values.
        
    Returns:
        A dictionary containing regression metrics.
    """
    metrics = {
        "mae": mean_absolute_error(y_true, y_pred),
        "rmse": np.sqrt(mean_squared_error(y_true, y_pred)),
        "r2_score": r2_score(y_true, y_pred)
    }
    
    # Directional Accuracy: Do the predictions have the same sign as the actuals?
    # We ignore zeros to avoid ambiguity, or we can treat >=0 as positive.
    true_direction = np.sign(y_true)
    pred_direction = np.sign(y_pred)
    
    # Where signs match, it's correct. Exclude cases where true_direction is 0 if needed.
    # For simplicity, just check strict equality of sign
    correct_direction = (true_direction == pred_direction).sum()
    metrics["directional_accuracy"] = correct_direction / len(y_true) if len(y_true) > 0 else 0.0
    
    return metrics


def create_classification_report_df(y_true, y_pred) -> pd.DataFrame:
    """Generate a DataFrame version of the scikit-learn classification report.
    
    Args:
        y_true: True target values.
        y_pred: Predicted target values.
        
    Returns:
        DataFrame containing precision, recall, f1, and support for each class.
    """
    report_dict = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    df = pd.DataFrame(report_dict).transpose()
    return df


def calculate_prediction_summary(predictions, probabilities=None) -> dict:
    """Calculate summary statistics of the predictions themselves.
    
    Args:
        predictions: Array of model predictions.
        probabilities: Array of predicted probabilities (optional).
        
    Returns:
        Dictionary of summary stats.
    """
    preds = np.array(predictions)
    summary = {
        "average_prediction": float(preds.mean()),
    }
    
    # If binary classification (0 and 1)
    if set(np.unique(preds)).issubset({0, 1}):
        summary["positive_prediction_rate"] = float((preds == 1).mean())
        
    if probabilities is not None:
        probs = np.array(probabilities)
        summary["average_confidence"] = float(probs.mean())
        
    return summary
