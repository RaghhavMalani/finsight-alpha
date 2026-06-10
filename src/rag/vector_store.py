import json
import numpy as np
from pathlib import Path
from typing import List, Dict, Any

try:
    import faiss
except ImportError:
    faiss = None

from sklearn.metrics.pairwise import cosine_similarity

class LocalVectorStore:
    """A local vector store wrapping FAISS (if available) or falling back to scikit-learn."""
    
    def __init__(self, use_faiss: bool = True):
        self.use_faiss = use_faiss and (faiss is not None)
        self.index = None
        self.embeddings = None
        self.chunks = []
        
    def build_index(self, chunks: List[Dict[str, Any]], embeddings: np.ndarray):
        """Build the vector index from embeddings."""
        if not chunks or len(chunks) == 0:
            return
            
        self.chunks = chunks
        
        if self.use_faiss:
            # We use Inner Product after L2 normalization for cosine similarity
            dimension = embeddings.shape[1]
            self.index = faiss.IndexFlatIP(dimension)
            
            # Normalize embeddings for cosine similarity
            normalized_embeddings = np.copy(embeddings).astype('float32')
            faiss.normalize_L2(normalized_embeddings)
            self.index.add(normalized_embeddings)
        else:
            self.embeddings = embeddings

    def search(self, query_embedding: np.ndarray, top_k: int = 5) -> List[Dict[str, Any]]:
        """Search the index for the top_k most similar chunks."""
        if not self.chunks:
            return []
            
        # Ensure query is 2D float32
        q_emb = np.copy(query_embedding).astype('float32')
        if len(q_emb.shape) == 1:
            q_emb = q_emb.reshape(1, -1)
            
        results = []
        
        if self.use_faiss:
            faiss.normalize_L2(q_emb)
            distances, indices = self.index.search(q_emb, min(top_k, len(self.chunks)))
            
            for dist, idx in zip(distances[0], indices[0]):
                if idx != -1:
                    chunk = self.chunks[idx].copy()
                    chunk["score"] = float(dist)
                    results.append(chunk)
        else:
            if self.embeddings is None:
                return []
                
            similarities = cosine_similarity(q_emb, self.embeddings)[0]
            top_indices = np.argsort(similarities)[::-1][:min(top_k, len(self.chunks))]
            
            for idx in top_indices:
                chunk = self.chunks[idx].copy()
                chunk["score"] = float(similarities[idx])
                results.append(chunk)
                
        return results

    def save(self, index_dir: str):
        """Save the vector store to disk."""
        path = Path(index_dir)
        path.mkdir(parents=True, exist_ok=True)
        
        with open(path / "chunks.json", "w", encoding="utf-8") as f:
            json.dump(self.chunks, f, indent=2)
            
        if self.use_faiss and self.index is not None:
            faiss.write_index(self.index, str(path / "faiss.index"))
        elif self.embeddings is not None:
            np.save(path / "embeddings.npy", self.embeddings)

    def load(self, index_dir: str) -> bool:
        """Load the vector store from disk."""
        path = Path(index_dir)
        
        if not (path / "chunks.json").exists():
            return False
            
        with open(path / "chunks.json", "r", encoding="utf-8") as f:
            self.chunks = json.load(f)
            
        if self.use_faiss and (path / "faiss.index").exists():
            self.index = faiss.read_index(str(path / "faiss.index"))
        elif (path / "embeddings.npy").exists():
            self.embeddings = np.load(path / "embeddings.npy")
            self.use_faiss = False
        else:
            return False
            
        return True
