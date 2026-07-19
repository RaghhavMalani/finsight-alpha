"""Attach an existing authenticated user to the licensed internal tenant.

Run only after the owner has registered through the deployed authentication
endpoint. The database URL and any credentials remain environment-only.
"""

from __future__ import annotations

import argparse
import os

import psycopg2

ROLES = {"owner", "admin", "analyst", "viewer", "member"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Activate a FinSight production owner")
    parser.add_argument("--email", required=True)
    parser.add_argument("--organization", default="finsight-internal")
    parser.add_argument("--role", choices=sorted(ROLES), default="owner")
    args = parser.parse_args()

    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url[len("postgres://") :]
    if not database_url.startswith("postgresql://"):
        raise SystemExit("DATABASE_URL must be a PostgreSQL connection URL")

    email = args.email.strip().lower()
    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
            user = cursor.fetchone()
            if user is None:
                raise SystemExit("User does not exist. Register through the deployed app first.")
            cursor.execute("SELECT id FROM organizations WHERE slug = %s", (args.organization,))
            organization = cursor.fetchone()
            if organization is None:
                raise SystemExit(f"Organization {args.organization!r} does not exist")

            user_id = int(user[0])
            organization_id = int(organization[0])
            cursor.execute(
                """
                INSERT INTO organization_memberships (organization_id, user_id, role)
                VALUES (%s, %s, %s)
                ON CONFLICT (organization_id, user_id)
                DO UPDATE SET role = EXCLUDED.role
                """,
                (organization_id, user_id, args.role),
            )
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
                raise RuntimeError(
                    f"Owner membership was not activated because the tenant has {active_grants}/8 active grants"
                )

    print(
        f"activated {email} as {args.role} in {args.organization}; "
        f"verified {active_grants} active dataset grants"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
