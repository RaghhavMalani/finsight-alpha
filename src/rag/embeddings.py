import os
import numpy as np

# Disable TensorFlow in transformers to avoid SystemError on Windows with numpy 2.x
os.environ["USE_TF"] = "NO"

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

_model_cache = {}

def get_embedding_model(model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
    """Get or load the embedding model."""
    if SentenceTransformer is None:
        raise ImportError("sentence-transformers is missing. Please install it.")
        
    if model_name not in _model_cache:
        try:
            print(f"Loading embedding model: {model_name}...")
            _model_cache[model_name] = SentenceTransformer(model_name)
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
