import pandas as pd
import numpy as np
import pytest
from src.ml import reliance_modeling

@pytest.fixture
def synthetic_ml_df():
    np.random.seed(42)
    # Generate exactly 100 rows
    df = pd.DataFrame({
        "f1": np.random.randn(100),
        "f2": np.random.randn(100),
    })
    # Create target based on f1 + noise
    df["target"] = (df["f1"] + np.random.randn(100) > 0).astype(int)
    
    return df

def test_train_reliance_model_suite(synthetic_ml_df):
    feature_cols = ["f1", "f2"]
    target_col = "target"
    
    suite_results = reliance_modeling.train_reliance_model_suite(
        synthetic_ml_df, feature_cols, target_col, test_size=0.2, random_state=42
    )
    
    assert "model_results" in suite_results
    assert "best_model_name" in suite_results
    assert "feature_importance" in suite_results
    assert "latest_prediction" in suite_results
    
    res_df = suite_results["model_results"]
    assert not res_df.empty
    
    # Check that at least Logistic Regression and Random Forest ran
    ran_models = res_df["model_name"].tolist()
    assert "logistic_regression" in ran_models
    assert "random_forest" in ran_models
    
    # Check that metrics exist
    assert "roc_auc" in res_df.columns
    assert "f1_score" in res_df.columns
    
    # Feature importance should have the 2 features
    feat_imp = suite_results["feature_importance"]
    assert len(feat_imp) == 2
