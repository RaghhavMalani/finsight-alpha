# Phase 8: Financial Document Intelligence

## Overview
Phase 8 introduces a local-first RAG (Retrieval-Augmented Generation) engine to FinSight Alpha. This module enables the platform to ingest financial documents (e.g., annual reports, earnings transcripts), semantically search through them, and extract structured financial factors.

## Key Features
1. **Local-First RAG**: All embedding generation and vector search is done locally using `sentence-transformers` and `faiss`/`scikit-learn`.
2. **Hybrid Retrieval**: Combines semantic vector search with keyword-based (BM25) search for optimal precision and recall.
3. **Factor Extraction**: Supports rule-based and LLM-assisted extraction of quantitative factors (e.g., Sentiment, Growth, Risk, Debt) from unstructured text.
4. **ML Integration**: Extracted factors are merged with market data and forward-filled, acting as new features for the Quantitative Signal Research Lab.

## Modules
- `src/rag/document_discovery.py`: Orchestrates discovery across all sources.
- `src/rag/screener_discovery.py`: Extracts documents from Screener.in for Indian stocks.
- `src/rag/exchange_discovery.py`: Searches official NSE/BSE filings.
- `src/rag/company_ir_discovery.py`: Locates direct Investor Relations PDFs.
- `src/rag/web_search_discovery.py`: Falls back to Google/DuckDuckGo for missing documents.
- `src/rag/source_policy.py`: Enforces robots.txt compliance and rate limits.
- `src/rag/download_manager.py`: Safely downloads files and creates metadata JSONs.
- `src/rag/document_loader.py`: Handles PDF, TXT, DOCX files.
- `src/rag/chunker.py`: Splits text and attaches metadata.
- `src/rag/embeddings.py`: Generates dense embeddings locally.
- `src/rag/vector_store.py`: FAISS/scikit-learn backend for vector storage and retrieval.
- `src/rag/retriever.py`: Hybrid search (Semantic + BM25).
- `src/rag/reranker.py`: Custom financial reranking.
- `src/rag/factor_extractor.py`: Extracts scores and summarizes insights.
- `src/rag/factor_store.py`: Manages persistence and integration with market datasets.

## Auto Document Discovery
FinSight Alpha now supports **Auto Document Discovery**. Instead of manually downloading PDFs, you can ask the system to find them automatically:
1. It searches Screener.in, official company IR pages, NSE, and BSE.
2. It ranks candidates, preferring official sources and direct PDF links.
3. It enforces strict compliance (respects `robots.txt`, no CAPTCHA bypassing, polite rate limiting).
4. Selected documents are downloaded to `data/documents/<ticker>` along with JSON metadata.
5. You can then process these automatically downloaded files into the RAG engine for semantic search and factor extraction.

## How to Use
1. Navigate to the **Financial Document Intelligence** page.
2. Upload a document (e.g., an annual report PDF).
3. Click "Process Documents" to build the vector index.
4. Use the search bar to query the document semantically.
5. Click "Extract Financial Factors" to generate structured scores.
6. Once saved, these scores will be available in the **Signal Research Lab** by toggling "Use Document Factor Features".
