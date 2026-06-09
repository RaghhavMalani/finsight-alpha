"""Time-series aware validation tools.

Includes strict non-shuffling train/test splits and walk-forward validation
to evaluate models in a realistic chronological manner and prevent data leakage.
"""

import pandas as pd
import numpy as np

from src.ml.models import get_classification_model, get_regression_model, train_model, make_predictions


def time_series_train_test_split(
    df: pd.DataFrame, feature_cols: list[str], target_col: str, test_size: float = 0.2
) -> tuple:
    """Split data into train and test sets chronologically.
    
    Rules:
    - Preserve chronological order.
    - Do not shuffle.
    - First (1-test_size) portion as training, last test_size as test.
    
    Args:
        df: Input DataFrame sorted by date.
        feature_cols: List of feature column names.
        target_col: Name of the target column.
        test_size: Proportion of dataset to include in the test split.
        
    Returns:
        Tuple of (X_train, X_test, y_train, y_test).
    """
    n = len(df)
    split_idx = int(n * (1 - test_size))
    
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]
    
    X_train = train_df[feature_cols]
    y_train = train_df[target_col]
    X_test = test_df[feature_cols]
    y_test = test_df[target_col]
    
    return X_train, X_test, y_train, y_test


def walk_forward_validation(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    model_type: str,
    model_name: str,
    initial_train_size: float = 0.6,
    step_size: int = 20,
    random_state: int = 42
) -> pd.DataFrame:
    """Perform walk-forward validation over a time series.
    
    Logic:
    - Start with first initial_train_size portion as training set.
    - Train model.
    - Predict next step_size observations.
    - Move the training window forward (expanding window).
    - Repeat until end of data.
    
    Args:
        df: Input DataFrame, sorted by date.
        feature_cols: List of feature column names.
        target_col: Name of the target column.
        model_type: 'classification' or 'regression'.
        model_name: Name of the model to use.
        initial_train_size: Proportion of data to use for the first training set.
        step_size: Number of steps to predict at each iteration.
        random_state: Random seed for model initialization.
        
    Returns:
        DataFrame containing walk-forward predictions.
    """
    n = len(df)
    start_idx = int(n * initial_train_size)
    
    if start_idx >= n:
        raise ValueError("initial_train_size is too large, leaving no data for validation.")
        
    results = []
    
    # We use an expanding window approach
    for fold, current_idx in enumerate(range(start_idx, n, step_size)):
        train_df = df.iloc[:current_idx]
        
        # Determine the end of the test window for this fold
        end_idx = min(current_idx + step_size, n)
        test_df = df.iloc[current_idx:end_idx]
        
        X_train = train_df[feature_cols]
        y_train = train_df[target_col]
        X_test = test_df[feature_cols]
        y_test = test_df[target_col]
        
        # Instantiate model fresh for each fold to avoid leakage of learned state
        if model_type == "classification":
            model = get_classification_model(model_name, random_state=random_state)
        elif model_type == "regression":
            model = get_regression_model(model_name, random_state=random_state)
        else:
            raise ValueError("model_type must be 'classification' or 'regression'")
            
        model = train_model(model, X_train, y_train)
        preds, probs = make_predictions(model, X_test)
        
        fold_results = pd.DataFrame({
            "Date": test_df.get("Date", test_df.index),
            "y_true": y_test.values,
            "y_pred": preds,
            "fold": fold
        })
        
        if probs is not None:
            fold_results["y_pred_proba"] = probs
            
        results.append(fold_results)
        
    if not results:
        return pd.DataFrame()
        
    final_results = pd.concat(results, ignore_index=True)
    return final_results
