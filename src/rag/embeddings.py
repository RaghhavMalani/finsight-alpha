import os
import sys
import threading

import numpy as np

# Disable TensorFlow in transformers to avoid SystemError on Windows with numpy 2.x
os.environ["USE_TF"] = "NO"
sys.modules["tensorflow"] = None

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

_model_cache = {}
_model_lock = threading.Lock()

def get_embedding_model(model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
    """Get or load the embedding model (thread-safe singleton).

    The lock matters: the agent runs tools in parallel, and loading the same
    torch model concurrently from several threads corrupts initialization
    ("Cannot copy out of meta tensor"). One thread loads; the rest reuse it.
    """
    if SentenceTransformer is None:
        raise ImportError("sentence-transformers is missing. Please install it.")

    with _model_lock:
        if model_name not in _model_cache:
            try:
                print(f"Loading embedding model: {model_name}...")
                _model_cache[model_name] = SentenceTransformer(model_name, device="cpu")
            except Exception as e:
                print(f"Failed to load model {model_name}: {e}")
                raise
        return _model_cache[model_name]

def embed_texts(
    texts: list[str],
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
    batch_size: int = 32
) -> np.ndarray:
    """Embed a list of texts."""
    if not texts:
        return np.array([])
        
    model = get_embedding_model(model_name)
    embeddings = model.encode(texts, batch_size=batch_size, show_progress_bar=False)
    return np.array(embeddings)

def embed_query(
    query: str,
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
) -> np.ndarray:
    """Embed a single query."""
    model = get_embedding_model(model_name)
    embedding = model.encode(query, show_progress_bar=False)
    return np.array(embedding)
