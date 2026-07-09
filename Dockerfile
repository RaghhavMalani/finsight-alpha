# FinSight Alpha — production container for Azure Container Apps.
#
# Builds the FastAPI backend (which also serves the terminal + login pages).
# The agent-framework / Azure OpenAI path is included so the AI Agent works in
# the cloud. Heavy ML deps (torch via sentence-transformers, faiss) make this a
# large image and a slow first build — that's expected.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Build tools help any sdist-only wheels compile; removed from the final layer.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first for better layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir agent-framework openai

# App source.
COPY . .

# Writable runtime data dir (cache, sqlite fallback if no DATABASE_URL).
RUN mkdir -p /app/data
ENV FINSIGHT_DATA_DIR=/app/data

EXPOSE 8000

# Container Apps may inject PORT; default to 8000 otherwise.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
