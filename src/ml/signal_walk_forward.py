import pandas as pd
from src.ml import models, evaluation

def run_signal_walk_forward_validation(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    model_name: str,
    initial_train_size: float = 0.6,
    step_size: int = 30,
    random_state: int = 42,
    ticker: str | None = None
) -> pd.DataFrame:
    """Run generic expanding-window walk-forward validation with fold tracking."""
    total_len = len(df)
    train_end = int(total_len * initial_train_size)
    
    if train_end >= total_len:
        return pd.DataFrame()
        
    # If the user selected the "No reliable edge found" string as model name, we fallback to random forest
    if model_name == "No reliable edge found":
        model_name = "random_forest"
        
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
                "ticker": ticker if ticker else (test_df.loc[idx, "Ticker"] if "Ticker" in test_df.columns else "UNKNOWN"),
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
