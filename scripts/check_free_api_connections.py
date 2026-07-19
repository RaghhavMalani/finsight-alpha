"""Temporarily verify free data-provider credentials from the local ``.env``.

The checker never prints credential values or request URLs containing credentials.
Missing credentials are reported as ``SKIP`` so one provider can be configured and
tested at a time.

Examples
--------
    python scripts/check_free_api_connections.py
    python scripts/check_free_api_connections.py --provider wto
    python scripts/check_free_api_connections.py --provider copernicus --provider fred
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import requests
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TIMEOUT_SECONDS = 20.0


@dataclass(frozen=True)
class CheckResult:
    provider: str
    status: str
    detail: str
    http_status: int | None = None
    elapsed_ms: int | None = None


def _load_environment() -> None:
    """Load local configuration without overriding shell/deployment variables."""

    load_dotenv(PROJECT_ROOT / ".env", override=False)
    load_dotenv(PROJECT_ROOT / ".env.local", override=False)


def _first_env(*names: str) -> tuple[str | None, str | None]:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value, name
    return None, None


def _missing(provider: str, names: Iterable[str]) -> CheckResult:
    return CheckResult(provider, "SKIP", f"missing {', '.join(names)}")


def _request(
    provider: str,
    method: str,
    url: str,
    *,
    timeout: float,
    expected: Callable[[requests.Response], bool],
    success_detail: str,
    **kwargs: object,
) -> CheckResult:
    started = time.perf_counter()
    try:
        response = requests.request(method, url, timeout=timeout, **kwargs)
    except requests.RequestException as exc:
        # Do not include the exception message: requests may place query-string
        # credentials inside it.
        elapsed = round((time.perf_counter() - started) * 1000)
        return CheckResult(
            provider,
            "FAIL",
            f"connection error ({type(exc).__name__})",
            elapsed_ms=elapsed,
        )

    elapsed = round((time.perf_counter() - started) * 1000)
    try:
        valid = expected(response)
    except (TypeError, ValueError, json.JSONDecodeError):
        valid = False

    if valid:
        return CheckResult(
            provider,
            "PASS",
            success_detail,
            http_status=response.status_code,
            elapsed_ms=elapsed,
        )

    if response.status_code in {401, 403}:
        detail = "credential rejected"
    elif response.status_code == 429:
        detail = "credential accepted, but provider rate limit was reached"
    else:
        detail = "unexpected provider response"
    return CheckResult(
        provider,
        "FAIL",
        detail,
        http_status=response.status_code,
        elapsed_ms=elapsed,
    )


def _is_json_success(response: requests.Response) -> bool:
    if not 200 <= response.status_code < 300:
        return False
    payload = response.json()
    if isinstance(payload, dict):
        return not any(payload.get(key) for key in ("error", "error_code", "errors"))
    return isinstance(payload, list)


def check_copernicus(timeout: float) -> CheckResult:
    provider = "Copernicus"
    client_id, _ = _first_env("COPERNICUS_CLIENT_ID")
    client_secret, _ = _first_env("COPERNICUS_CLIENT_SECRET")
    if not client_id or not client_secret:
        return _missing(
            provider, ("COPERNICUS_CLIENT_ID", "COPERNICUS_CLIENT_SECRET")
        )

    def token_received(response: requests.Response) -> bool:
        return (
            200 <= response.status_code < 300
            and bool(response.json().get("access_token"))
        )

    return _request(
        provider,
        "POST",
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
        timeout=timeout,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        expected=token_received,
        success_detail="OAuth token issued",
    )


def check_fred(timeout: float) -> CheckResult:
    provider = "FRED/ALFRED"
    key, _ = _first_env("FRED_API_KEY")
    if not key:
        return _missing(provider, ("FRED_API_KEY",))
    return _request(
        provider,
        "GET",
        "https://api.stlouisfed.org/fred/series/observations",
        timeout=timeout,
        params={
            "api_key": key,
            "series_id": "GNPCA",
            "file_type": "json",
            "limit": 1,
        },
        expected=_is_json_success,
        success_detail="authenticated vintage-data request succeeded",
    )


def check_wto(timeout: float) -> CheckResult:
    provider = "WTO Timeseries"
    key, _ = _first_env("WTO_API_KEY")
    if not key:
        return _missing(provider, ("WTO_API_KEY",))
    return _request(
        provider,
        "GET",
        "https://api.wto.org/timeseries/v1/indicator_categories",
        timeout=timeout,
        params={"lang": 1},
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "Ocp-Apim-Subscription-Key": key,
        },
        expected=lambda response: 200 <= response.status_code < 300
        and bool(response.content),
        success_detail="subscription key accepted",
    )


def check_un_comtrade(timeout: float) -> CheckResult:
    provider = "UN Comtrade"
    key, _ = _first_env("UN_COMTRADE_API_KEY", "COMTRADE_API_KEY")
    if not key:
        return _missing(provider, ("UN_COMTRADE_API_KEY",))
    return _request(
        provider,
        "GET",
        "https://comtradeapi.un.org/data/v1/getLiveUpdate",
        timeout=timeout,
        params={"subscription-key": key},
        expected=_is_json_success,
        success_detail="free subscription key accepted",
    )


def check_eia(timeout: float) -> CheckResult:
    provider = "US EIA"
    key, _ = _first_env("EIA_API_KEY")
    if not key:
        return _missing(provider, ("EIA_API_KEY",))
    return _request(
        provider,
        "GET",
        "https://api.eia.gov/v2/electricity",
        timeout=timeout,
        params={"api_key": key},
        expected=_is_json_success,
        success_detail="authenticated metadata request succeeded",
    )


def check_usda_nass(timeout: float) -> CheckResult:
    provider = "USDA NASS"
    key, _ = _first_env("USDA_NASS_API_KEY")
    if not key:
        return _missing(provider, ("USDA_NASS_API_KEY",))
    return _request(
        provider,
        "GET",
        "https://quickstats.nass.usda.gov/api/get_param_values/",
        timeout=timeout,
        params={"key": key, "param": "sector_desc"},
        expected=lambda response: _is_json_success(response)
        and bool(response.json().get("sector_desc")),
        success_detail="Quick Stats key accepted",
    )


def check_data_gov_in(timeout: float) -> CheckResult:
    provider = "data.gov.in"
    key, _ = _first_env("DATA_GOV_IN_API_KEY", "DATA_GOV_API_KEY")
    if not key:
        return _missing(provider, ("DATA_GOV_IN_API_KEY",))
    resource_id = os.getenv(
        "DATA_GOV_IN_RESOURCE_ID", "9ef84268-d588-465a-a308-a864a43d0070"
    ).strip()
    return _request(
        provider,
        "GET",
        f"https://api.data.gov.in/resource/{resource_id}",
        timeout=timeout,
        params={"api-key": key, "format": "json", "offset": 0, "limit": 1},
        expected=lambda response: _is_json_success(response)
        and isinstance(response.json().get("records"), list),
        success_detail="API key accepted by the current daily mandi-price resource",
    )


def _decode_jwt_payload(token: str) -> dict[str, object] | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def check_nasa_earthdata(timeout: float) -> CheckResult:
    del timeout  # This check is local so a public endpoint cannot mask an invalid token.
    provider = "NASA Earthdata"
    token, _ = _first_env("NASA_EARTHDATA_TOKEN", "EARTHDATA_TOKEN")
    if not token:
        return _missing(provider, ("NASA_EARTHDATA_TOKEN",))
    payload = _decode_jwt_payload(token)
    if payload is None:
        return CheckResult(provider, "FAIL", "token is not a valid Earthdata JWT")
    expiry = payload.get("exp")
    if not isinstance(expiry, (int, float)):
        return CheckResult(provider, "FAIL", "token has no numeric expiry")
    seconds_left = int(expiry - time.time())
    if seconds_left <= 0:
        return CheckResult(provider, "FAIL", "token has expired")
    days_left = max(1, seconds_left // 86_400)
    return CheckResult(provider, "PASS", f"token format valid; about {days_left} day(s) left")


CHECKS: dict[str, Callable[[float], CheckResult]] = {
    "copernicus": check_copernicus,
    "fred": check_fred,
    "wto": check_wto,
    "comtrade": check_un_comtrade,
    "eia": check_eia,
    "nass": check_usda_nass,
    "data-gov-in": check_data_gov_in,
    "earthdata": check_nasa_earthdata,
}


def _print_results(results: list[CheckResult]) -> None:
    headers = ("Provider", "Result", "HTTP", "Latency", "Detail")
    rows = []
    for result in results:
        rows.append(
            (
                result.provider,
                result.status,
                str(result.http_status) if result.http_status is not None else "-",
                f"{result.elapsed_ms} ms" if result.elapsed_ms is not None else "-",
                result.detail,
            )
        )
    widths = [
        max(len(headers[index]), *(len(row[index]) for row in rows))
        for index in range(len(headers))
    ]
    print("  ".join(value.ljust(widths[index]) for index, value in enumerate(headers)))
    print("  ".join("-" * width for width in widths))
    for row in rows:
        print("  ".join(value.ljust(widths[index]) for index, value in enumerate(row)))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check configured free data-provider credentials without printing secrets."
    )
    parser.add_argument(
        "--provider",
        action="append",
        choices=sorted(CHECKS),
        help="Check only this provider; repeat to check several. Defaults to all.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"HTTP timeout in seconds (default: {DEFAULT_TIMEOUT_SECONDS:g}).",
    )
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")

    _load_environment()
    selected = args.provider or list(CHECKS)
    results = [CHECKS[name](args.timeout) for name in selected]
    _print_results(results)

    passed = sum(result.status == "PASS" for result in results)
    failed = sum(result.status == "FAIL" for result in results)
    skipped = sum(result.status == "SKIP" for result in results)
    print(f"\nSummary: {passed} PASS, {failed} FAIL, {skipped} SKIP")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
