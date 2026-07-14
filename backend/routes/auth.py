"""Authentication routes with durable tenant membership context."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from src import config
from src.auth import db
from src.auth.security import make_session, verify_session

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "fs_session"
_MAX_AGE = 60 * 60 * 24 * 7


class Credentials(BaseModel):
    email: str
    password: str


def _set_session_cookie(request: Request, response: Response, user_id: int) -> None:
    secure = config.APP_ENV == "production" or request.url.scheme == "https"
    response.set_cookie(
        COOKIE_NAME,
        make_session(user_id),
        max_age=_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


@router.post("/register")
def register(creds: Credentials, request: Request, response: Response) -> dict:
    try:
        user = db.create_user(creds.email, creds.password)
    except db.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_session_cookie(request, response, user.id)
    return db.user_public(user)


@router.post("/login")
def login(creds: Credentials, request: Request, response: Response) -> dict:
    try:
        user = db.authenticate(creds.email, creds.password)
    except db.AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    _set_session_cookie(request, response, user.id)
    return db.user_public(user)


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(request: Request) -> dict:
    uid = verify_session(request.cookies.get(COOKIE_NAME))
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.get_user(uid)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    requested_org = request.headers.get("x-finsight-organization")
    if requested_org and db.resolve_principal(uid, requested_org) is None:
        raise HTTPException(status_code=403, detail="Organization access denied")
    return db.user_public(user)
