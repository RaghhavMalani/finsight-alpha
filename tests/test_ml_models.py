import pandas as pd
import numpy as np
import pytest
from src.ml import models, evaluation, walk_forward

@pytest.fixture
def synthetic_data():
    np.random.seed(42)
    # 100 samples, 3 features
    X = pd.DataFrame({
        "f1": np.random.randn(100),
        "f2": np.random.randn(100),
        "f3": np.random.randn(100)
    })
    # y for regression: f1 + f2 + noise
    y_reg = X["f1"] + X["f2"] + np.random.randn(100) * 0.1
    # y for classification: 1 if f1 + f2 > 0 else 0
    y_clf = (X["f1"] + X["f2"] > 0).astype(int)
    
    return X, y_reg, y_clf

def test_classification_model_training(synthetic_data):
    X, _, y_clf = synthetic_data
    model = models.get_classification_model("logistic_regression", random_state=42)
    
    # Simple split
    X_train, X_test = X.iloc[:80], X.iloc[80:]
    y_train, y_test = y_clf.iloc[:80], y_clf.iloc[80:]
    
    trained_model = models.train_model(model, X_train, y_train)
    preds, probs = models.make_predictions(trained_model, X_test)
    
    assert len(preds) == len(X_test)
    assert probs is not None
    assert len(probs) == len(X_test)

def test_regression_model_training(synthetic_data):
    X, y_reg, _ = synthetic_data
    model = models.get_regression_model("linear_regression", random_state=42)
    
    X_train, X_test = X.iloc[:80], X.iloc[80:]
    y_train, y_test = y_reg.iloc[:80], y_reg.iloc[80:]
    
    trained_model = models.train_model(model, X_train, y_train)
    preds, probs = models.make_predictions(trained_model, X_test)
    
    assert len(preds) == len(X_test)
    assert probs is None

def test_time_series_train_test_split(synthetic_data):
    X, y_reg, _ = synthetic_data
    df = X.copy()
    df["target"] = y_reg
    
    X_train, X_test, y_train, y_test = walk_forward.time_series_train_test_split(
        df, feature_cols=["f1", "f2", "f3"], target_col="target", test_size=0.2
    )
    
    assert len(X_train) == 80
    assert len(X_test) == 20
    # Check no shuffle: first item in test should be 80th in original
    assert X_test.iloc[0]["f1"] == df.iloc[80]["f1"]

def test_evaluation_outputs(synthetic_data):
    X, y_reg, y_clf = synthetic_data
    
    # Classification
    eval_clf = evaluation.evaluate_classification_model(y_clf[:20], y_clf[:20])
    assert "accuracy" in eval_clf
    assert "precision" in eval_clf
    
    # Regression
    eval_reg = evaluation.evaluate_regression_model(y_reg[:20], y_reg[:20])
    assert "mae" in eval_reg
    assert "rmse" in eval_reg
    assert "directional_accuracy" in eval_reg
