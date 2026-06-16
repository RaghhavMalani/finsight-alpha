# RAG Setup — make the AI Equity Research Terminal actually answer

The terminal needs two things to work end to end:

1. **An LLM** to synthesize answers (we use **local Ollama**, free).
2. **Documents** in the index to answer from.

Auto-discovery often returns *links* it can't download (exchanges block
scrapers — "Downloaded 0 documents"). The reliable workflow below skips scraping:
you supply the PDFs, we index them.

---

## 1. Install and run Ollama (free, local, no API key)

1. Download Ollama: https://ollama.com/download (Windows/macOS/Linux).
2. Pull a model (one-time):

   ```bash
   ollama pull llama3.1
   ```

   Smaller/faster option: `ollama pull llama3.2:3b`. Better quality: `llama3.1:8b` (default).
3. Make sure it's serving (usually automatic after install):

   ```bash
   ollama serve
   ```

   Ollama listens on `http://localhost:11434`. The app auto-detects it.

> Prefer a cloud model instead? Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or
> `GOOGLE_API_KEY` in your environment / `.env` and pick that provider in the
> dashboard's **Answer engine** selector. No code changes needed.

---

## 2. Add documents

Put annual reports / investor presentations / transcripts (PDF, TXT, or DOCX)
into a folder, e.g.:

```
data/documents/RELIANCE/
  reliance_annual_report_fy24.pdf
  reliance_investor_ppt_q3.pdf
```

You can download these from the company's Investor Relations page or Screener's
"Documents" section in your browser, then drop them in. (The dashboard's
**Manual Upload** tab does the same thing.)

---

## 3. Build the index

```bash
python scripts/build_rag_index.py --docs data/documents/RELIANCE --ticker RELIANCE.NS
```

This loads → chunks → tags with the ticker → embeds (first run downloads the
~80 MB MiniLM model once) → saves a FAISS index to `data/rag_index`.

---

## 4. Ask questions

CLI:

```bash
python scripts/ask_rag.py --index data/rag_index --q "What are the key risks?"
# or interactive:
python scripts/ask_rag.py --index data/rag_index
```

You'll get a **grounded** answer with inline `[n]` citations mapping to source
file + page. If no LLM is reachable it degrades to extractive evidence and tells
you so.

Dashboard: open the **AI Equity Research Terminal** page, Build Workspace →
Process Documents → set **Answer engine = ollama** → ask.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Answer engine: none" only option | Ollama not running / no API key | `ollama serve`; confirm `http://localhost:11434` responds |
| "Downloaded 0 documents" | Source blocked the scraper | Use manual upload / `build_rag_index.py` instead |
| "No indexed documents found" | Nothing processed, or ticker mismatch | Process docs first; ingest now force-tags the ticker |
| Answer ignores a fact in the PDF | Scanned/image PDF → no extractable text | Use a text PDF or OCR it first |
| First query is slow | Model + embeddings loading | Subsequent queries are fast (cached) |
