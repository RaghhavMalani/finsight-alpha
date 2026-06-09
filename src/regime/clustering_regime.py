import pandas as pd
import numpy as np
from typing import List
from sklearn.cluster import KMeans
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler

def run_kmeans_regime_detection(
    feature_df: pd.DataFrame,
    feature_cols: List[str],
    n_states: int = 4,
    random_state: int = 42
) -> pd.DataFrame:
    """
    Run KMeans clustering for fallback regime detection.
    """
    out = feature_df.copy()
    
    try:
        X = feature_df[feature_cols].values
        
        # Standardize
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Fit model
        model = KMeans(n_clusters=n_states, random_state=random_state, n_init="auto")
        states = model.fit_predict(X_scaled)
        
        out["kmeans_state"] = states
        # KMeans does not output probabilities, set to NaN or hard 1.0
        out["kmeans_state_probability"] = np.nan
        
    except Exception as e:
        out["kmeans_state"] = np.nan
        out["kmeans_state_probability"] = np.nan
        
    return out

def run_gmm_regime_detection(
    feature_df: pd.DataFrame,
    feature_cols: List[str],
    n_states: int = 4,
    random_state: int = 42
) -> pd.DataFrame:
    """
    Run Gaussian Mixture Model clustering for fallback regime detection.
    This is the preferred fallback because it provides probabilistic states.
    """
    out = feature_df.copy()
    
    try:
        X = feature_df[feature_cols].values
        
        # Standardize
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Fit model
        model = GaussianMixture(
            n_components=n_states, 
            covariance_type="full", 
            random_state=random_state
        )
        model.fit(X_scaled)
        
        # Predict states
        states = model.predict(X_scaled)
        probs = model.predict_proba(X_scaled)
        
        out["gmm_state"] = states
        out["gmm_state_probability"] = probs.max(axis=1)
        
        for i in range(n_states):
            out[f"gmm_state_{i}_prob"] = probs[:, i]
            
    except Exception as e:
        out["gmm_state"] = np.nan
        out["gmm_state_probability"] = np.nan
        for i in range(n_states):
            out[f"gmm_state_{i}_prob"] = np.nan
            
    return out
