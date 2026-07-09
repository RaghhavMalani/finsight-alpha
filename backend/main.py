"""FinSight Alpha - FastAPI backend application (Phase 1C).

Assembles the API: configures the app, adds CORS, and includes the routers from
``backend/routes``. The same :class:`MarketDataService` and analytics modules
that power the browser terminal back these endpoints, so logic is never
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

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from backend.routes import (
    agent, analytics, assets, auth, backtest, factors, fundamentals, graph, health,
    market_data, ml, news, portfolio, pricing, quote, regime, research, risk,
    strategy, tape,
)
from src import config
from src.auth.security import verify_session
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title=config.APP_NAME,
    description="Backend-driven market data and analytics platform.",
    version=config.APP_VERSION,
)

# CORS: allow browser frontends to call the API.
# In production, replace "*" with the specific dashboard origin(s).
app.add_middleware(
    CORSMiddleware,
    # Echo the request origin (required for credentialed/cookie requests from
    # the React dev server, e.g. http://localhost:8080). "*" is rejected by
    # browsers when credentials are included.
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Authentication: create tables on startup and gate the whole app ---------
from src.auth.db import init_db  # noqa: E402

# Paths reachable WITHOUT a session (login flow, health probes, login page).
_PUBLIC_PATHS = {"/login", "/health", "/health/llm", "/favicon.ico"}
_PUBLIC_PREFIXES = ("/auth/",)


@app.on_event("startup")
def _startup() -> None:
    try:
        init_db()
        logger.info("Auth database initialized.")
    except Exception as exc:  # don't hard-fail boot; auth routes will surface it
        logger.error("Auth DB init failed: %s", exc)


@app.middleware("http")
async def _auth_gate(request: Request, call_next):
    """Require a valid session for everything except the public paths above."""
    path = request.url.path
    if (
        request.method == "OPTIONS"
        or path in _PUBLIC_PATHS
        or any(path.startswith(p) for p in _PUBLIC_PREFIXES)
    ):
        return await call_next(request)

    if verify_session(request.cookies.get("fs_session")):
        return await call_next(request)

    # Not authenticated: send browsers to the login page, APIs a 401.
    accept = request.headers.get("accept", "")
    if "text/html" in accept:
        return RedirectResponse(url="/login", status_code=303)
    return JSONResponse({"detail": "Authentication required."}, status_code=401)


# Register routers.
app.include_router(auth.router)
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
app.include_router(backtest.router)
app.include_router(factors.router)
app.include_router(strategy.router)
app.include_router(fundamentals.router)
app.include_router(agent.router)
app.include_router(regime.router)
app.include_router(tape.router)
app.include_router(ml.router)


# Serve the terminal front-end (single-page app) from FastAPI so it shares the
# API's origin (no CORS friction). Open http://127.0.0.1:8000/terminal
_FRONTEND = PROJECT_ROOT / "frontend" / "terminal.html"


@app.get("/terminal", include_in_schema=False)
def terminal() -> FileResponse:
    return FileResponse(str(_FRONTEND))


_RISK_PAGE = PROJECT_ROOT / "frontend" / "risk.html"


@app.get("/risk", include_in_schema=False)
def risk_page() -> FileResponse:
    return FileResponse(str(_RISK_PAGE))


_LOGIN_PAGE = PROJECT_ROOT / "frontend" / "login.html"


@app.get("/login", include_in_schema=False)
def login_page() -> FileResponse:
    return FileResponse(str(_LOGIN_PAGE))


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    """Friendly root pointing to the interactive docs."""
    return {
        "message": f"{config.APP_NAME} v{config.APP_VERSION}. See /docs for the API.",
    }
