"""Apply the checked-in PostgreSQL schema in deterministic order.

The database URL is read from the environment and is never printed.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = [
    ROOT / "sql" / "001_create_tables.sql",
    ROOT / "sql" / "002_truth_reset.sql",
    ROOT / "sql" / "003_seed_org_and_grants.sql",
    ROOT / "sql" / "004_enforce_tenant_rls.sql",
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply FinSight production PostgreSQL migrations")
    parser.add_argument("--database-url-env", default="DATABASE_URL")
    args = parser.parse_args()

    database_url = os.getenv(args.database_url_env, "").strip()
    if not database_url:
        raise SystemExit(f"{args.database_url_env} is required")
    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url[len("postgres://") :]
    if not database_url.startswith("postgresql://"):
        raise SystemExit("Production migrations require a PostgreSQL connection URL")

    with psycopg2.connect(database_url) as connection:
        for migration in MIGRATIONS:
            with connection.cursor() as cursor:
                cursor.execute(migration.read_text(encoding="utf-8"))
            print(f"applied {migration.name}")

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id FROM organizations WHERE slug = 'finsight-internal'
                """
            )
            row = cursor.fetchone()
            if row is None:
                raise RuntimeError("finsight-internal organization was not created")
            organization_id = int(row[0])
            cursor.execute(
                "SELECT set_config('app.organization_id', %s, true)",
                (str(organization_id),),
            )
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM organization_license_grants
                WHERE organization_id = %s AND status = 'active'
                """,
                (organization_id,),
            )
            active_grants = int(cursor.fetchone()[0])
            if active_grants != 8:
                raise RuntimeError(f"expected 8 active internal grants, found {active_grants}")
            cursor.execute("SELECT COUNT(*) FROM datasets WHERE is_simulated = FALSE")
            authoritative_datasets = int(cursor.fetchone()[0])

    print(
        "verified canonical catalog: "
        f"{authoritative_datasets} authoritative datasets, {active_grants} active internal grants"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
