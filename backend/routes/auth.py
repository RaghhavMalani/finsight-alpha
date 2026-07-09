"""Authentication routes: register, login, logout, and the current-user probe.

Sessions are carried in an httponly cookie holding a signed token (see
:mod:`src.auth.security`). The cookie is marked ``secure`` automatically when the
request arrives over HTTPS (so it works on plain http://127.0.0.1 locally and is
secure behind the Container Apps HTTPS ingress).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from src.auth import db
from src.auth.security import make_session, verify_session

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "fs_session"
_MAX_AGE = 60 * 60 * 24 * 7  # 7 days


class Credentials(BaseModel):
    email: str
    password: str


def _set_session_cookie(request: Request, response: Response, user_id: int) -> None:
    response.set_cookie(
        COOKIE_NAME,
        make_session(user_id),
        max_age=_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=(request.url.scheme == "https"),
        path="/",
    )


@router.post("/register")
def register(creds: Credentials, request: Request, response: Response) -> dict:
    try:
        user = db.create_user(creds.email, creds.password)
    except db.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    _set_session_cookie(request, response, user.id)
    return user.public()


@router.post("/login")
def login(creds: Credentials, request: Request, response: Response) -> dict:
    try:
        user = db.authenticate(creds.email, creds.password)
    except db.AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    _set_session_cookie(request, response, user.id)
    return user.public()


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
    return user.public()
