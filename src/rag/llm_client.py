"""Provider-agnostic LLM client for the RAG layer.

The rest of the RAG code should never care *which* model produced an answer.
This module exposes one function, :func:`generate`, plus a small
:class:`LLMResult` container, and hides all provider differences behind a
single interface.

Design goals
------------
* **Local-first / free by default.** The default provider is `ollama`, which
  runs a local model (e.g. ``llama3.1``) over HTTP with no API key and no cost.
* **Optional cloud providers.** ``openai``, ``anthropic``, and ``gemini`` are
  supported *if* the matching SDK is installed and an API key is present in the
  environment. They are never required.
* **Never crashes the app.** Every provider call is wrapped so a missing key,
  missing package, or network error returns ``LLMResult(ok=False, ...)`` rather
  than raising. Callers (e.g. :mod:`src.rag.rag_answer`) then degrade to an
  extractive answer.
* **Cheap availability checks.** :func:`available_providers` lets the dashboard
  show only the providers that will actually work right now.

Environment variables
----------------------
``OPENAI_API_KEY``        - enables the ``openai`` provider.
``ANTHROPIC_API_KEY``     - enables the ``anthropic`` provider.
``GOOGLE_API_KEY``        - enables the ``gemini`` provider.
``OLLAMA_BASE_URL``       - override the Ollama host (default ``http://localhost:11434``).
``OLLAMA_MODEL``          - default Ollama model (default ``llama3.1``).
``FINSIGHT_LLM_PROVIDER`` - default provider name used when a caller passes
                            ``"auto"`` (default ``ollama``).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Optional

# Load keys from a local .env (OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY)
# so providers work regardless of import order or how the script was launched.
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is a convenience, not required
    pass

try:  # ``requests`` is already a project dependency (used by RAG discovery).
    import requests
except Exception:  # pragma: no cover - requests is declared in requirements.txt
    requests = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------
@dataclass
class LLMResult:
    """The outcome of a single generation call.

    ``ok`` is the only field callers must check. When ``ok`` is ``False`` the
    ``text`` is empty and ``error`` explains why, so the caller can fall back to
    a non-LLM path without try/except gymnastics.
    """

    ok: bool
    text: str = ""
    provider: str = ""
    model: str = ""
    error: Optional[str] = None
    raw: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DEFAULT_OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
DEFAULT_PROVIDER = os.getenv("FINSIGHT_LLM_PROVIDER", "ollama")

# Sensible default chat models per cloud provider (overridable via ``model=``).
_CLOUD_DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
    "gemini": "gemini-2.0-flash",
    "groq": "llama-3.3-70b-versatile",
}


# ---------------------------------------------------------------------------
# Availability detection (cheap, no network except a short Ollama ping)
# ---------------------------------------------------------------------------
def _ollama_up(timeout: float = 0.75) -> bool:
    """Return True if a local Ollama server answers on the configured host."""
    if requests is None:
        return False
    try:
        resp = requests.get(f"{DEFAULT_OLLAMA_URL}/api/tags", timeout=timeout)
        return resp.status_code == 200
    except Exception:
        return False


def available_providers(check_ollama: bool = True) -> list[str]:
    """List provider names that are usable *right now*.

    The dashboard uses this to populate its model selector so the user is only
    offered providers that will actually return an answer. ``"none"`` (the
    extractive, always-works fallback) is always included first.
    """
    providers = ["none"]
    if check_ollama and _ollama_up():
        providers.append("ollama")
    if os.getenv("OPENAI_API_KEY"):
        providers.append("openai")
    if os.getenv("ANTHROPIC_API_KEY"):
        providers.append("anthropic")
    if os.getenv("GOOGLE_API_KEY"):
        providers.append("gemini")
    if os.getenv("GROQ_API_KEY"):
        providers.append("groq")
    return providers


# ---------------------------------------------------------------------------
# Per-provider implementations. Each returns an LLMResult and never raises.
# ---------------------------------------------------------------------------
def _gen_ollama(
    prompt: str,
    system: Optional[str],
    model: Optional[str],
    temperature: float,
    timeout: float,
) -> LLMResult:
    if requests is None:
        return LLMResult(False, error="`requests` is not installed.")
    model = model or DEFAULT_OLLAMA_MODEL
    payload = {
        "model": model,
        "prompt": prompt,
        "system": system or "",
        "stream": False,
        "options": {"temperature": temperature},
    }
    try:
        resp = requests.post(
            f"{DEFAULT_OLLAMA_URL}/api/generate", json=payload, timeout=timeout
        )
        if resp.status_code != 200:
            return LLMResult(
                False, provider="ollama", model=model,
                error=f"Ollama HTTP {resp.status_code}: {resp.text[:200]}",
            )
        data = resp.json()
        return LLMResult(
            True, text=(data.get("response") or "").strip(),
            provider="ollama", model=model, raw=data,
        )
    except Exception as exc:  # connection refused, timeout, etc.
        return LLMResult(
            False, provider="ollama", model=model,
            error=f"Ollama call failed ({exc}). Is `ollama serve` running?",
        )


def _gen_openai(
    prompt: str, system: Optional[str], model: Optional[str],
    temperature: float, timeout: float,
) -> LLMResult:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return LLMResult(False, provider="openai", error="OPENAI_API_KEY not set.")
    model = model or _CLOUD_DEFAULT_MODELS["openai"]
    try:
        from openai import OpenAI  # lazy import; optional dependency
    except Exception:
        return LLMResult(False, provider="openai", error="`openai` package not installed.")
    try:
        client = OpenAI(api_key=key, timeout=timeout)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = client.chat.completions.create(
            model=model, messages=messages, temperature=temperature,
        )
        return LLMResult(
            True, text=(resp.choices[0].message.content or "").strip(),
            provider="openai", model=model,
        )
    except Exception as exc:
        return LLMResult(False, provider="openai", model=model, error=str(exc))


def _gen_anthropic(
    prompt: str, system: Optional[str], model: Optional[str],
    temperature: float, timeout: float,
) -> LLMResult:
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return LLMResult(False, provider="anthropic", error="ANTHROPIC_API_KEY not set.")
    model = model or _CLOUD_DEFAULT_MODELS["anthropic"]
    try:
        import anthropic  # lazy import; optional dependency
    except Exception:
        return LLMResult(False, provider="anthropic", error="`anthropic` package not installed.")
    try:
        client = anthropic.Anthropic(api_key=key, timeout=timeout)
        resp = client.messages.create(
            model=model,
            max_tokens=1024,
            temperature=temperature,
            system=system or "",
            messages=[{"role": "user", "content": prompt}],
        )
        parts = [b.text for b in resp.content if getattr(b, "type", "") == "text"]
        return LLMResult(
            True, text="".join(parts).strip(), provider="anthropic", model=model,
        )
    except Exception as exc:
        return LLMResult(False, provider="anthropic", model=model, error=str(exc))


def _gen_groq(
    prompt: str, system: Optional[str], model: Optional[str],
    temperature: float, timeout: float,
) -> LLMResult:
    """Groq's free, fast inference via its OpenAI-compatible endpoint."""
    key = os.getenv("GROQ_API_KEY")
    if not key:
        return LLMResult(False, provider="groq", error="GROQ_API_KEY not set.")
    model = model or _CLOUD_DEFAULT_MODELS["groq"]
    try:
        from openai import OpenAI  # Groq speaks the OpenAI API
    except Exception:
        return LLMResult(False, provider="groq", error="`openai` package not installed (pip install openai).")
    try:
        client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1", timeout=timeout)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = client.chat.completions.create(
            model=model, messages=messages, temperature=temperature,
        )
        return LLMResult(
            True, text=(resp.choices[0].message.content or "").strip(),
            provider="groq", model=model,
        )
    except Exception as exc:
        return LLMResult(False, provider="groq", model=model, error=str(exc))


def _gen_gemini(
    prompt: str, system: Optional[str], model: Optional[str],
    temperature: float, timeout: float,
) -> LLMResult:
    key = os.getenv("GOOGLE_API_KEY")
    if not key:
        return LLMResult(False, provider="gemini", error="GOOGLE_API_KEY not set.")
    model = model or _CLOUD_DEFAULT_MODELS["gemini"]
    try:
        import google.generativeai as genai  # lazy import; optional dependency
    except Exception:
        return LLMResult(False, provider="gemini", error="`google-generativeai` not installed.")
    try:
        genai.configure(api_key=key)
        gen_model = genai.GenerativeModel(model, system_instruction=system or None)
        resp = gen_model.generate_content(
            prompt, generation_config={"temperature": temperature},
        )
        return LLMResult(True, text=(resp.text or "").strip(), provider="gemini", model=model)
    except Exception as exc:
        return LLMResult(False, provider="gemini", model=model, error=str(exc))


_DISPATCH = {
    "ollama": _gen_ollama,
    "openai": _gen_openai,
    "anthropic": _gen_anthropic,
    "gemini": _gen_gemini,
    "groq": _gen_groq,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def generate(
    prompt: str,
    *,
    provider: str = "auto",
    system: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.1,
    timeout: float = 60.0,
) -> LLMResult:
    """Generate text from the chosen provider.

    Parameters
    ----------
    prompt:
        The user prompt (already includes any retrieved context for RAG).
    provider:
        One of ``"ollama"``, ``"openai"``, ``"anthropic"``, ``"gemini"``,
        ``"auto"`` (use ``FINSIGHT_LLM_PROVIDER`` / the first available cloud
        key / ollama), or ``"none"`` (no LLM - returns ``ok=False`` so the
        caller uses its extractive fallback).
    system:
        Optional system instruction.
    model:
        Optional model override; sensible per-provider defaults otherwise.
    temperature:
        Low by default - financial answers should be deterministic and grounded.

    Returns
    -------
    LLMResult
        ``ok=True`` with ``text`` on success; ``ok=False`` with ``error`` on any
        failure. This function never raises.
    """
    if provider in (None, "none", ""):
        return LLMResult(False, provider="none", error="No LLM provider selected.")

    if provider == "auto":
        provider = _resolve_auto_provider()
        if provider == "none":
            return LLMResult(
                False, provider="none",
                error="No LLM available (no Ollama server and no API keys).",
            )

    fn = _DISPATCH.get(provider)
    if fn is None:
        return LLMResult(False, provider=provider, error=f"Unknown provider '{provider}'.")
    return fn(prompt, system, model, temperature, timeout)


def _resolve_auto_provider() -> str:
    """Pick the best available provider for ``provider="auto"``."""
    configured = DEFAULT_PROVIDER
    avail = available_providers()
    if configured in avail and configured != "none":
        return configured
    for candidate in ("ollama", "groq", "anthropic", "openai", "gemini"):
        if candidate in avail:
            return candidate
    return "none"


def generate_json(
    prompt: str,
    *,
    provider: str = "auto",
    system: Optional[str] = None,
    model: Optional[str] = None,
    timeout: float = 60.0,
) -> tuple[Optional[dict], LLMResult]:
    """Generate and parse a JSON object from the model.

    Returns ``(parsed_dict_or_None, LLMResult)``. Robust to models that wrap
    JSON in prose or markdown fences - it extracts the first balanced ``{...}``
    block before parsing.
    """
    result = generate(
        prompt, provider=provider, system=system, model=model, temperature=0.0, timeout=timeout
    )
    if not result.ok:
        return None, result
    parsed = _extract_json(result.text)
    return parsed, result


def _extract_json(text: str) -> Optional[dict]:
    """Best-effort extraction of the first JSON object in ``text``."""
    if not text:
        return None
    # Strip common markdown fences.
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1] if "```" in cleaned[3:] else cleaned[3:]
        cleaned = cleaned.replace("json", "", 1).strip() if cleaned.lower().startswith("json") else cleaned
    start = cleaned.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(cleaned)):
        if cleaned[i] == "{":
            depth += 1
        elif cleaned[i] == "}":
            depth -= 1
            if depth == 0:
                snippet = cleaned[start : i + 1]
                try:
                    return json.loads(snippet)
                except Exception:
                    return None
    return None
