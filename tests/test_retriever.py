from src.rag.retriever import hybrid_retrieve

class MockVectorStore:
    def __init__(self, chunks):
        self.chunks = chunks
    def search(self, emb, top_k):
        return [{"chunk_id": "1", "score": 0.9}]

def test_hybrid_retrieve(monkeypatch):
    # Mock embedding so it doesn't need to load the model
    monkeypatch.setattr("src.rag.embeddings.embed_query", lambda x: [0.1])
    
    chunks = [{"chunk_id": "1", "text": "revenue growth"}, {"chunk_id": "2", "text": "random text"}]
    vs = MockVectorStore(chunks)
    
    results = hybrid_retrieve("revenue", chunks, vector_store=vs, top_k=1)
    
    assert len(results) == 1
    assert results[0]["chunk_id"] == "1"
