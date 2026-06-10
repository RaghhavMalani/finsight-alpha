
"""Machine learning models and training helpers.

Provides scikit-learn models for classification and regression tasks,
along with utilities for training, predicting, extracting feature importance,
and saving/loading models locally.
"""

import os
import joblib
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier, GradientBoostingRegressor

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

try:
    import lightgbm as lgb
    HAS_LGB = True
except ImportError:
    HAS_LGB = False


def get_classification_model(model_name: str, random_state: int = 42):
    """Get a scikit-learn classification model by name.
    
    Allowed model names:
    - logistic_regression
    - random_forest
    - gradient_boosting
    
    Args:
        model_name: The name of the model.
        random_state: Random seed for reproducibility.
        
    Returns:
        A scikit-learn classifier instance.
    """
    _CLASSIFICATION_MODELS = {
        "logistic_regression": LogisticRegression(random_state=random_state, max_iter=1000),
        "random_forest": RandomForestClassifier(random_state=random_state, n_estimators=100),
        "gradient_boosting": GradientBoostingClassifier(random_state=random_state, n_estimators=100),
    }

    if HAS_XGB:
        _CLASSIFICATION_MODELS["xgboost"] = xgb.XGBClassifier(random_state=random_state, n_estimators=100, use_label_encoder=False, eval_metric="logloss")
    if HAS_LGB:
        _CLASSIFICATION_MODELS["lightgbm"] = lgb.LGBMClassifier(random_state=random_state, n_estimators=100, verbose=-1)

    name = model_name.lower().strip()
    if name in _CLASSIFICATION_MODELS:
        return _CLASSIFICATION_MODELS[name]
    else:
        raise ValueError(f"Unknown classification model: {model_name}")


def get_regression_model(model_name: str, random_state: int = 42):
    """Get a scikit-learn regression model by name.
    
    Allowed model names:
    - linear_regression
    - random_forest
    - gradient_boosting
    
    Args:
        model_name: The name of the model.
        random_state: Random seed for reproducibility.
        
    Returns:
        A scikit-learn regressor instance.
    """
    _REGRESSION_MODELS = {
        "linear_regression": LinearRegression(),
        "random_forest": RandomForestRegressor(random_state=random_state, n_estimators=100),
        "gradient_boosting": GradientBoostingRegressor(random_state=random_state, n_estimators=100),
    }

    if HAS_XGB:
        _REGRESSION_MODELS["xgboost"] = xgb.XGBRegressor(random_state=random_state, n_estimators=100)
    if HAS_LGB:
        _REGRESSION_MODELS["lightgbm"] = lgb.LGBMRegressor(random_state=random_state, n_estimators=100, verbose=-1)

    name = model_name.lower().strip()
    if name in _REGRESSION_MODELS:
        return _REGRESSION_MODELS[name]
    else:
        raise ValueError(f"Unknown regression model: {model_name}")


def train_model(model, X_train: pd.DataFrame, y_train: pd.Series):
    """Train the given model.
    
    Args:
        model: A scikit-learn model instance.
        X_train: Training features.
        y_train: Training target.
        
    Returns:
        The trained model.
    """
    model.fit(X_train, y_train)
    return model


def make_predictions(model, X_test: pd.DataFrame) -> tuple:
    """Make predictions using the trained model.
    
    Args:
        model: A trained scikit-learn model.
        X_test: Testing features.
        
    Returns:
        A tuple of (predictions, probabilities). Probabilities will be None
        if the model does not support predict_proba.
    """
    preds = model.predict(X_test)
    
    probs = None
    if hasattr(model, "predict_proba"):
        # For binary classification, we usually want the probability of class 1
        probs = model.predict_proba(X_test)
        if probs.shape[1] == 2:
            probs = probs[:, 1]
            
    return preds, probs


def get_feature_importance(model, feature_names: list[str]) -> pd.DataFrame:
    """Extract feature importance from a trained model.
    
    Args:
        model: A trained scikit-learn model.
        feature_names: List of feature names matching the model's expected input.
        
    Returns:
        A DataFrame with 'feature' and 'importance', sorted descending by absolute importance.
    """
    importances = None
    
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    elif hasattr(model, "coef_"):
        # For linear models
        coef = model.coef_
        if coef.ndim > 1:
            coef = coef[0]
        importances = coef
        
    if importances is None:
        # Fallback if the model doesn't expose importances
        return pd.DataFrame({"feature": feature_names, "importance": [0.0] * len(feature_names)})
        
    df = pd.DataFrame({
        "feature": feature_names,
        "importance": importances
    })
    
    # Sort by absolute importance descending
    df["abs_importance"] = df["importance"].abs()
    df = df.sort_values("abs_importance", ascending=False).drop(columns=["abs_importance"]).reset_index(drop=True)
    
    return df


def save_model(model, path: str):
    """Save a model to disk using joblib.
    
    Args:
        model: The model to save.
        path: File path to save the model.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    joblib.dump(model, path)


def load_model(path: str):
    """Load a model from disk using joblib.
    
    Args:
        path: File path of the saved model.
        
    Returns:
        The loaded model.
    """
    return joblib.load(path)
