import pandas as pd
import numpy as np
from typing import Dict, Any, List
from sklearn.preprocessing import StandardScaler

def is_hmmlearn_available() -> bool:
    """Check if hmmlearn is installed."""
    try:
        import hmmlearn.hmm
        return True
    except ImportError:
        return False


def trace_hmm_fit(feature_df, feature_cols, *, n_states=4, max_iter=100,
                  tol=0.01, random_state=42):
    """EM iterations of ONE bounded fit; posterior labels are retrospective."""
    from hmmlearn.hmm import GaussianHMM
    from threadpoolctl import threadpool_limits
    from src.dynamics.market_regime_inputs import digest
    from src.regime.regime_labeling import summarize_regime_states, label_regime_states

    scaler = StandardScaler()
    x = scaler.fit_transform(feature_df[feature_cols])
    if not np.isfinite(x).all():
        raise ValueError("HMM features must be finite")
    model = GaussianHMM(n_components=n_states, covariance_type="full", n_iter=1,
                        init_params="stmc", params="stmc", random_state=random_state)
    frames = []
    with threadpool_limits(limits=1):
        for iteration in range(1, max_iter + 1):
            model.fit(x)
            model.init_params = ""
            likelihood = float(model.score(x))
            delta = likelihood - frames[-1]["loglik"] if frames else None
            converged = delta is not None and abs(delta) < tol
            frames.append({
                "iteration": iteration, "loglik": likelihood,
                "means": model.means_.tolist(),
                "covariance_diagonal": np.diagonal(model.covars_, axis1=1, axis2=2).tolist(),
                "transmat": model.transmat_.tolist(),
                "posterior_tail": model.predict_proba(x)[-250:].tolist(),
                "convergence_delta": delta, "converged": converged,
            })
            if converged:
                break
        labeled = feature_df.copy()
        labeled["hmm_state"] = model.predict(x)
    labels = label_regime_states(summarize_regime_states(labeled, "hmm_state"))
    scaler_params = {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(),
                     "variance": scaler.var_.tolist(), "features": list(feature_cols)}
    return {
        "frames": frames, "labels": {str(i): labels.get(i, f"State {i}") for i in range(n_states)},
        "dates_tail": [d.isoformat() for d in pd.to_datetime(feature_df["Date"].tail(250), utc=True)],
        "feature_names": list(feature_cols), "scaler": scaler_params,
        "scaler_hash": digest(scaler_params), "converged": frames[-1]["converged"],
        "max_iter": max_iter, "tolerance": tol,
        "semantics": "EM optimization of one PIT-bounded fit. Tail particles are posterior states under this fit, not contemporaneously known historical regimes.",
    }

def train_hmm_regime_model(
    feature_df: pd.DataFrame,
    feature_cols: List[str],
    n_states: int = 4,
    covariance_type: str = "full",
    random_state: int = 42
) -> Dict[str, Any]:
    """
    Train a Gaussian Hidden Markov Model for regime detection.
    """
    if not is_hmmlearn_available():
        return {
            "model": None,
            "scaler": None,
            "feature_cols": feature_cols,
            "n_states": n_states,
            "success": False,
            "message": "hmmlearn is not installed. Use Gaussian Mixture fallback."
        }
        
    from hmmlearn.hmm import GaussianHMM
    
    try:
        X = feature_df[feature_cols].values
        
        # Standardize features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Train HMM
        model = GaussianHMM(
            n_components=n_states,
            covariance_type=covariance_type,
            n_iter=100,
            random_state=random_state
        )
        model.fit(X_scaled)
        
        return {
            "model": model,
            "scaler": scaler,
            "feature_cols": feature_cols,
            "n_states": n_states,
            "success": True,
            "message": "HMM model trained successfully."
        }
    except Exception as e:
        return {
            "model": None,
            "scaler": None,
            "feature_cols": feature_cols,
            "n_states": n_states,
            "success": False,
            "message": f"HMM training failed: {str(e)}"
        }

def predict_hmm_regimes(
    model: Any,
    scaler: StandardScaler,
    feature_df: pd.DataFrame,
    feature_cols: List[str]
) -> pd.Series:
    """Predict hidden regime states."""
    X = feature_df[feature_cols].values
    X_scaled = scaler.transform(X)
    
    states = model.predict(X_scaled)
    return pd.Series(states, index=feature_df.index)

def get_hmm_regime_probabilities(
    model: Any,
    scaler: StandardScaler,
    feature_df: pd.DataFrame,
    feature_cols: List[str]
) -> pd.DataFrame:
    """Get probability of each regime state."""
    X = feature_df[feature_cols].values
    X_scaled = scaler.transform(X)
    
    probs = model.predict_proba(X_scaled)
    
    out = pd.DataFrame(index=feature_df.index)
    for i in range(model.n_components):
        out[f"state_{i}_prob"] = probs[:, i]
        
    return out

def run_hmm_regime_detection(
    feature_df: pd.DataFrame,
    feature_cols: List[str],
    n_states: int = 4,
    random_state: int = 42
) -> pd.DataFrame:
    """Run full HMM regime detection pipeline."""
    res = train_hmm_regime_model(
        feature_df, 
        feature_cols, 
        n_states=n_states, 
        random_state=random_state
    )
    
    out = feature_df.copy()
    
    if res["success"]:
        model = res["model"]
        scaler = res["scaler"]
        
        # Predict states
        states = predict_hmm_regimes(model, scaler, feature_df, feature_cols)
        out["hmm_state"] = states
        
        # Predict probabilities
        probs = get_hmm_regime_probabilities(model, scaler, feature_df, feature_cols)
        
        for col in probs.columns:
            out[col] = probs[col]
            
        # Add probability of the chosen state
        out["hmm_state_probability"] = probs.max(axis=1)
    else:
        # Fallback or empty
        out["hmm_state"] = np.nan
        out["hmm_state_probability"] = np.nan
        for i in range(n_states):
            out[f"state_{i}_prob"] = np.nan
            
    return out
