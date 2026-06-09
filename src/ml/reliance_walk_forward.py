import pandas as pd
from src.ml import models, evaluation

def run_reliance_walk_forward_validation(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    model_name: str,
    initial_train_size: float = 0.6,
    step_size: int = 30,
    random_state: int = 42
) -> pd.DataFrame:
    """Run expanding-window walk-forward validation with fold tracking.
    
    Args:
        df: DataFrame sorted chronologically.
        feature_cols: List of feature columns.
        target_col: Target column.
        model_name: Name of the model to use.
        initial_train_size: Initial fraction of data to train on.
        step_size: Number of rows to test in each fold.
        random_state: Random state.
        
    Returns:
        DataFrame with true, predicted, and fold metadata for each test row.
    """
    total_len = len(df)
    train_end = int(total_len * initial_train_size)
    
    if train_end >= total_len:
        return pd.DataFrame()
        
    model_base = models.get_classification_model(model_name, random_state=random_state)
    
    if model_name == "logistic_regression":
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline
        model = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", model_base)
        ])
    else:
        model = model_base
        
    results = []
    fold = 1
    
    while train_end < total_len:
        test_end = min(train_end + step_size, total_len)
        
        train_df = df.iloc[:train_end]
        test_df = df.iloc[train_end:test_end]
        
        X_train = train_df[feature_cols]
        y_train = train_df[target_col]
        
        X_test = test_df[feature_cols]
        y_test = test_df[target_col]
        
        model.fit(X_train, y_train)
        
        preds, probs = models.make_predictions(model, X_test)
        
        eval_metrics = evaluation.evaluate_classification_model(y_test, preds, probs)
        
        for i in range(len(test_df)):
            idx = test_df.index[i]
            row_data = {
                "Date": test_df.loc[idx, "Date"] if "Date" in test_df.columns else idx,
                "y_true": y_test.iloc[i],
                "y_pred": preds[i],
                "y_pred_proba": probs[i] if probs is not None else None,
                "fold": fold,
                "train_start": train_df.index[0],
                "train_end": train_df.index[-1],
                "test_start": test_df.index[0],
                "test_end": test_df.index[-1],
                "fold_accuracy": eval_metrics.get("accuracy"),
                "fold_f1": eval_metrics.get("f1_score"),
                "fold_roc_auc": eval_metrics.get("roc_auc")
            }
            results.append(row_data)
            
        train_end = test_end
        fold += 1
        
    return pd.DataFrame(results)
