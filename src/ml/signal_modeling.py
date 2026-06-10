import pandas as pd
import numpy as np
from sklearn.metrics import brier_score_loss
from src.ml import models, walk_forward, evaluation

def train_signal_model_suite(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    test_size: float = 0.2,
    random_state: int = 42,
    ticker: str | None = None
) -> dict:
    """Train and compare multiple models to find the best generic signal edge."""
    X_train, X_test, y_train, y_test = walk_forward.time_series_train_test_split(
        df, feature_cols, target_col, test_size=test_size
    )
    
    baseline_acc = evaluation.calculate_baseline_accuracy(y_test)
    
    candidate_models = ["logistic_regression", "random_forest", "gradient_boosting"]
    if getattr(models, "HAS_XGB", False):
        candidate_models.append("xgboost")
    if getattr(models, "HAS_LGB", False):
        candidate_models.append("lightgbm")
        
    results = []
    trained_models = {}
    
    for name in candidate_models:
        model = models.get_classification_model(name, random_state=random_state)
        
        # Scale only for logistic regression
        if name == "logistic_regression":
            from sklearn.preprocessing import StandardScaler
            from sklearn.pipeline import Pipeline
            model = Pipeline([
                ("scaler", StandardScaler()),
                ("clf", model)
            ])
            
        model = models.train_model(model, X_train, y_train)
        preds, probs = models.make_predictions(model, X_test)
        
        eval_metrics = evaluation.evaluate_classification_model(y_test, preds, probs)
        
        if probs is not None:
            # y_test might have nans if not cleaned, but assume cleaned before calling this
            brier = brier_score_loss(y_test, probs)
        else:
            brier = np.nan
            
        acc = eval_metrics.get("accuracy", 0)
        
        results.append({
            "model_name": name,
            "accuracy": acc,
            "precision": eval_metrics.get("precision", 0),
            "recall": eval_metrics.get("recall", 0),
            "f1_score": eval_metrics.get("f1_score", 0),
            "roc_auc": eval_metrics.get("roc_auc", 0),
            "brier_score": brier,
            "model_edge": acc - baseline_acc
        })
        
        trained_models[name] = {
            "model": model,
            "preds": preds,
            "probs": probs
        }
        
    results_df = pd.DataFrame(results)
    
    # Sort: Primary ROC-AUC (desc), Secondary Brier (asc), Third F1 (desc)
    results_df = results_df.sort_values(
        by=["roc_auc", "brier_score", "f1_score"],
        ascending=[False, True, False]
    )
    
    diagnostic_model_name = results_df.iloc[0]["model_name"]
    best_model_data = trained_models[diagnostic_model_name]
    diagnostic_model = best_model_data["model"]
    
    # If all models have ROC-AUC below 0.52
    if results_df["roc_auc"].max() < 0.52:
        best_model_name = "No reliable edge found"
    else:
        best_model_name = diagnostic_model_name
    
    actual_model = diagnostic_model.named_steps["clf"] if diagnostic_model_name == "logistic_regression" else diagnostic_model
    feature_importance = models.get_feature_importance(actual_model, feature_cols)
    
    latest_X = X_test.iloc[[-1]]
    latest_pred, latest_prob = models.make_predictions(diagnostic_model, latest_X)
    
    raw_prob = latest_prob[0] if latest_prob is not None else None
    
    from src.ml import signal_engine
    
    inst_signal = signal_engine.generate_institutional_signal(
        probability_up=raw_prob,
        roc_auc=results_df.iloc[0]["roc_auc"],
        model_edge=results_df.iloc[0]["model_edge"]
    )
    
    return {
        "ticker": ticker,
        "model_results": results_df,
        "best_model_name": best_model_name,
        "best_model": diagnostic_model,
        "diagnostic_model_name": diagnostic_model_name,
        "best_model_metrics": results_df.iloc[0].to_dict(),
        "baseline_accuracy": baseline_acc,
        "model_edge": results_df.iloc[0]["model_edge"],
        "raw_probability_up": raw_prob,
        "calibrated_probability_up": raw_prob, 
        "shrunk_probability_up": raw_prob, 
        "institutional_signal": inst_signal,
        "calibration_table": None,
        "brier_score": results_df.iloc[0]["brier_score"],
        "feature_importance": feature_importance,
        "X_train": X_train,
        "X_test": X_test,
        "y_train": y_train,
        "y_test": y_test,
        "y_pred": best_model_data["preds"],
        "y_pred_proba": best_model_data["probs"]
    }
