"""Dependency-free auth primitives: password hashing + signed session tokens.

Uses only the Python standard library so the container stays small and there are
no native-build headaches (bcrypt/cryptography). Security choices:

* **Passwords** are hashed with PBKDF2-HMAC-SHA256, 200k iterations, a per-user
  16-byte random salt. Verification is constant-time.
* **Sessions** are stateless signed tokens: ``base64(payload).base64(hmac)`` where
  the HMAC-SHA256 is keyed by ``FINSIGHT_SECRET_KEY``. The payload carries the
  user id and an expiry, so no server-side session store is needed. Tampering or
  expiry makes :func:`verify_session` return ``None``.

This is solid, conventional auth for a small app. It is not a replacement for a
managed identity provider if you later need SSO, MFA, or account recovery.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

_PBKDF2_ITERATIONS = 200_000
_SALT_BYTES = 16
_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days


def _secret_key() -> bytes:
    """Signing key for session tokens. MUST be set in production.

    Falls back to a process-local random key for local dev (sessions then don't
    survive a restart, which is fine locally). In the container set
    ``FINSIGHT_SECRET_KEY`` to a long random string so tokens stay valid.
    """
    key = os.getenv("FINSIGHT_SECRET_KEY")
    if key:
        return key.encode("utf-8")
    # Dev fallback: stable for the life of the process only.
    global _DEV_KEY
    try:
        return _DEV_KEY
    except NameError:
        _DEV_KEY = secrets.token_bytes(32)
        return _DEV_KEY


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    """Return ``pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>``."""
    salt = secrets.token_bytes(_SALT_BYTES)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        _PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(dk).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    """Constant-time verify a password against a :func:`hash_password` string."""
    try:
        algo, iter_s, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iter_s)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
    except (ValueError, TypeError):
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(dk, expected)


# ---------------------------------------------------------------------------
# Sessions (stateless signed tokens)
# ---------------------------------------------------------------------------
def _b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64u_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def make_session(user_id: int, ttl: int = _SESSION_TTL_SECONDS) -> str:
    """Create a signed session token for ``user_id`` valid for ``ttl`` seconds."""
    payload = {"uid": int(user_id), "exp": int(time.time()) + int(ttl)}
    body = _b64u(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(_secret_key(), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64u(sig)}"


def verify_session(token: Optional[str]) -> Optional[int]:
    """Return the user id if ``token`` is a valid, unexpired session, else ``None``."""
    if not token or "." not in token:
        return None
    body, _, sig = token.partition(".")
    expected = hmac.new(_secret_key(), body.encode("ascii"), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(_b64u_decode(sig), expected):
            return None
        payload = json.loads(_b64u_decode(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    uid = payload.get("uid")
    return int(uid) if uid is not None else None
