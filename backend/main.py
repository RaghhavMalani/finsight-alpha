"""FinSight Alpha - FastAPI backend application (Phase 1C).

Assembles the API: configures the app, adds CORS, and includes the routers from
``backend/routes``. The same :class:`MarketDataService` and analytics modules
that power the Streamlit dashboard back these endpoints, so logic is never
duplicated.

Run locally from the project root:

    uvicorn backend.main:app --reload
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make the project root importable when launched via uvicorn from anywhere.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.routes import (
    analytics, assets, graph, health, market_data,
    news, portfolio, pricing, quote, research, risk,
)
from src import config
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title=config.APP_NAME,
    description="Backend-driven market data and analytics platform.",
    version=config.APP_VERSION,
)

# CORS: allow the Streamlit dashboard (and future React app) to call the API.
# In production, replace "*" with the specific dashboard origin(s).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers.
app.include_router(health.router)
app.include_router(assets.router)
app.include_router(market_data.router)
app.include_router(analytics.router)
app.include_router(graph.router)
app.include_router(quote.router)
app.include_router(research.router)
app.include_router(pricing.router)
app.include_router(risk.router)
app.include_router(news.router)
app.include_router(portfolio.router)


# Serve the terminal front-end (single-page app) from FastAPI so it shares the
# API's origin (no CORS friction). Open http://127.0.0.1:8000/terminal
_FRONTEND = PROJECT_ROOT / "frontend" / "terminal.html"


@app.get("/terminal", include_in_schema=False)
def terminal() -> FileResponse:
    return FileResponse(str(_FRONTEND))


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    """Friendly root pointing to the interactive docs."""
    return {
        "message": f"{config.APP_NAME} v{config.APP_VERSION}. See /docs for the API.",
    }
