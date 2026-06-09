import pandas as pd
from src.ml import models, walk_forward, evaluation

def train_reliance_model_suite(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    test_size: float = 0.2,
    random_state: int = 42
) -> dict:
    """Train and compare multiple models to find the best signal edge.
    
    Args:
        df: Feature and target DataFrame.
        feature_cols: List of features to use.
        target_col: Target column to predict.
        test_size: Proportion of recent data to use for testing.
        random_state: Random state for reproducibility.
        
    Returns:
        Dictionary containing the best model, metrics, feature importance, and raw outputs.
    """
    X_train, X_test, y_train, y_test = walk_forward.time_series_train_test_split(
        df, feature_cols, target_col, test_size=test_size
    )
    
    # We will test these classification models
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
        
        results.append({
            "model_name": name,
            "accuracy": eval_metrics.get("accuracy", 0),
            "precision": eval_metrics.get("precision", 0),
            "recall": eval_metrics.get("recall", 0),
            "f1_score": eval_metrics.get("f1_score", 0),
            "roc_auc": eval_metrics.get("roc_auc", 0),
        })
        
        trained_models[name] = {
            "model": model,
            "preds": preds,
            "probs": probs
        }
        
    results_df = pd.DataFrame(results)
    
    # Select best model
    # Primary: ROC-AUC, Secondary: F1 Score
    # Sort descending
    results_df = results_df.sort_values(by=["roc_auc", "f1_score"], ascending=[False, False])
    best_model_name = results_df.iloc[0]["model_name"]
    best_model_data = trained_models[best_model_name]
    best_model = best_model_data["model"]
    
    # Extract feature importance from the best model
    # For pipelines (logistic regression), we extract from the 'clf' step
    actual_model = best_model.named_steps["clf"] if best_model_name == "logistic_regression" else best_model
    feature_importance = models.get_feature_importance(actual_model, feature_cols)
    
    # Latest prediction on the absolute latest available features (which is the last row of df)
    # Wait, df has target_col, so rows with missing target were dropped.
    # To get the true 'latest', we typically use the very last row of X_test since that's the most recent known label.
    # Actually, in Streamlit app, we usually pass the full feature df to get the absolute latest row where target is NaN.
    # But here, we will just provide a function to predict on the latest row, or just return the model and the app does it.
    
    # Let's get prediction for the most recent test row as a sample of "latest"
    latest_X = X_test.iloc[[-1]]
    latest_pred, latest_prob = models.make_predictions(best_model, latest_X)
    
    latest_confidence = latest_prob[0] if latest_prob is not None else None
    
    return {
        "model_results": results_df,
        "best_model_name": best_model_name,
        "best_model": best_model,
        "best_model_metrics": results_df.iloc[0].to_dict(),
        "feature_importance": feature_importance,
        "latest_prediction": latest_pred[0],
        "latest_confidence": latest_confidence,
        "X_train": X_train,
        "X_test": X_test,
        "y_train": y_train,
        "y_test": y_test,
        "y_pred": best_model_data["preds"],
        "y_pred_proba": best_model_data["probs"]
    }
