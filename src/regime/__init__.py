"""Market Regime Detection Engine.

This module provides tools for identifying latent market regimes using Hidden Markov Models
(HMM) and clustering techniques (Gaussian Mixture, KMeans).
"""

from .regime_features import create_regime_features, get_regime_feature_columns
from .hmm_regime import is_hmmlearn_available, train_hmm_regime_model, predict_hmm_regimes, get_hmm_regime_probabilities, run_hmm_regime_detection
from .clustering_regime import run_kmeans_regime_detection, run_gmm_regime_detection
from .regime_labeling import summarize_regime_states, label_regime_states, map_regime_labels_to_rows, classify_current_regime_risk
from .regime_analysis import calculate_regime_transition_matrix, calculate_regime_duration, calculate_current_regime_summary, calculate_regime_performance_summary, generate_regime_interpretation, analyze_transition_matrix
from .regime_integration import add_regime_features_to_ml_dataset, adjust_signal_for_regime

__all__ = [
    "create_regime_features",
    "get_regime_feature_columns",
    "is_hmmlearn_available",
    "train_hmm_regime_model",
    "predict_hmm_regimes",
    "get_hmm_regime_probabilities",
    "run_hmm_regime_detection",
    "run_kmeans_regime_detection",
    "run_gmm_regime_detection",
    "summarize_regime_states",
    "label_regime_states",
    "map_regime_labels_to_rows",
    "classify_current_regime_risk",
    "calculate_regime_transition_matrix",
    "calculate_regime_duration",
    "calculate_current_regime_summary",
    "calculate_regime_performance_summary",
    "generate_regime_interpretation",
    "analyze_transition_matrix",
    "add_regime_features_to_ml_dataset",
    "adjust_signal_for_regime",
]

