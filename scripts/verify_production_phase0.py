"""Disposable end-to-end verification for the deployed Phase 0 contract."""

from __future__ import annotations

import argparse
import json
import os
import secrets
import uuid
from typing import Any

import psycopg2
import requests


def _assert_response(response: requests.Response) -> dict[str, Any]:
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise AssertionError(f"Expected an object response from {response.url}")
    return payload


def _license_statuses(payload: dict[str, Any]) -> list[str]:
    statuses: list[str] = []

    def collect(value: Any) -> None:
        if isinstance(value, dict):
            metadata = value.get("metadata")
            if isinstance(metadata, dict) and metadata.get("dataset_id") != "UNAVAILABLE":
                status = metadata.get("customer_license_status")
                if isinstance(status, str):
                    statuses.append(status)
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)

    collect(payload)
    return statuses


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify deployed Phase 0 truth and tenancy controls")
    parser.add_argument("--frontend", default="https://finsight-alpha-web.vercel.app")
    args = parser.parse_args()

    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url[len("postgres://") :]
    if not database_url.startswith("postgresql://"):
        raise SystemExit("DATABASE_URL must be an unpooled PostgreSQL URL")

    frontend = args.frontend.rstrip("/")
    email = f"phase0-smoke-{uuid.uuid4().hex}@finsight.invalid"
    password = secrets.token_urlsafe(32)
    session = requests.Session()
    user_id: int | None = None
    personal_organization_id: int | None = None
    summary: dict[str, Any] = {}

    try:
        registration = _assert_response(
            session.post(
                f"{frontend}/api/auth/register",
                json={"email": email, "password": password},
                timeout=45,
            )
        )
        user_id = int(registration["id"])
        personal_organization_id = int(registration["active_organization_id"])

        with psycopg2.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id FROM organizations WHERE slug = 'finsight-internal'")
                internal = cursor.fetchone()
                if internal is None:
                    raise AssertionError("Licensed internal organization is missing")
                internal_organization_id = int(internal[0])
                cursor.execute(
                    """
                    INSERT INTO organization_memberships (organization_id, user_id, role)
                    VALUES (%s, %s, 'owner')
                    ON CONFLICT (organization_id, user_id)
                    DO UPDATE SET role = EXCLUDED.role
                    """,
                    (internal_organization_id, user_id),
                )

        me = _assert_response(session.get(f"{frontend}/api/auth/me", timeout=30))
        if int(me["active_organization_id"]) != internal_organization_id:
            raise AssertionError("Authenticated user did not resolve to the licensed tenant")

        agriculture = _assert_response(
            session.get(f"{frontend}/api/intelligence/agriculture?country=IND", timeout=120)
        )
        agriculture_licenses = _license_statuses(agriculture)
        if not agriculture_licenses or any(status != "ACTIVE" for status in agriculture_licenses):
            raise AssertionError(f"Agriculture license enforcement failed: {agriculture_licenses}")

        trade = _assert_response(
            session.get(f"{frontend}/api/intelligence/trade?country=IND", timeout=120)
        )
        trade_licenses = _license_statuses(trade)
        if not trade_licenses or any(status != "ACTIVE" for status in trade_licenses):
            raise AssertionError(f"Trade license enforcement failed: {trade_licenses}")

        satellite_status = "UPSTREAM_UNAVAILABLE"
        satellite = agriculture.get("satellite")
        if isinstance(satellite, dict) and satellite.get("status") == "AVAILABLE":
            image_path = satellite.get("image_path")
            image_response = session.get(f"{frontend}/api{image_path}", timeout=120)
            image_response.raise_for_status()
            if not image_response.headers.get("X-FinSight-Dataset-Version"):
                raise AssertionError("Satellite response omitted its dataset version")
            satellite_status = "AVAILABLE"

        unlicensed = _assert_response(
            session.get(
                f"{frontend}/api/intelligence/agriculture?country=IND",
                headers={"X-FinSight-Organization": str(personal_organization_id)},
                timeout=120,
            )
        )
        if unlicensed.get("status") != "UNAVAILABLE":
            raise AssertionError("Unlicensed tenant received available evidence")

        pipelines = _assert_response(session.get(f"{frontend}/api/health/pipelines", timeout=45))
        if pipelines.get("status") != "AVAILABLE" or not pipelines.get("pipelines"):
            raise AssertionError("Durable pipeline health did not record the production ingestion")

        summary = {
            "authentication": "PASS",
            "licensed_tenant": "PASS",
            "unlicensed_redaction": "PASS",
            "agriculture": agriculture.get("status"),
            "trade": trade.get("status"),
            "satellite": satellite_status,
            "agriculture_license_records": len(agriculture_licenses),
            "trade_license_records": len(trade_licenses),
            "pipeline_records": len(pipelines["pipelines"]),
        }
    finally:
        if user_id is not None:
            with psycopg2.connect(database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
                    if personal_organization_id is not None:
                        cursor.execute(
                            "DELETE FROM organizations WHERE id = %s AND slug <> 'finsight-internal'",
                            (personal_organization_id,),
                        )

    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
