"""Slice 1.2 live demo — runs the real API against the real Supabase database.

Journey: create founder → save HALF the intake → try to complete (gate must
reject) → finish the intake → complete (gate passes) → show the audit trail →
try to TAMPER with the audit log (database must refuse).

Re-runnable: if the demo founder already exists, skips to the lock/audit steps.
"""

import asyncio
import os
import pathlib
from uuid import UUID

import asyncpg
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient

ROOT = pathlib.Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

from mrk18_execution.api.app import create_app  # noqa: E402

DEMO_EMAIL = "demo@mrk18.ai"

HALF_INTAKE = {
    "company_name": "Chai Robotics (DEMO)",
    "website": "https://chairobotics.in",
    "tone": "bold, warm, desi",
}

REST_OF_INTAKE = {
    "product_description": "Robotic chai vending machines for Indian offices and campuses.",
    "icp": "Facility managers at 200+ employee Indian tech parks, Tier-1 cities.",
    "top_competitors": ["Chaipoint", "Chaayos"],
    "primary_goal": "signups",
    "monthly_spend_inr": 30000,
    "target_platforms": ["linkedin", "x"],
    "consent_given": True,
    "consent_text_version": "v1-2026-06",
}


async def main() -> None:
    dsn = os.environ["CHECKPOINTER_DSN"]
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://demo") as client:
        print("=" * 64)
        print("STEP 1 - create founder")
        resp = await client.post(
            "/founders", json={"email": DEMO_EMAIL, "display_name": "Demo Founder"}
        )
        if resp.status_code == 409:
            conn = await asyncpg.connect(dsn, timeout=20)
            fid = str(await conn.fetchval("select id from founders where email=$1", DEMO_EMAIL))
            await conn.close()
            print(f"  demo founder already exists, reusing: {fid}")
        else:
            resp.raise_for_status()
            fid = resp.json()["founder_id"]
            print(f"  founder_id = {fid}")

            print("\nSTEP 2 - save HALF the intake (partial save)")
            resp = await client.put(f"/founders/{fid}/intake", json=HALF_INTAKE)
            body = resp.json()
            print(f"  saved. complete={body['complete']}")
            print(f"  missing_fields = {body['missing_fields']}")

            print("\nSTEP 3 - try to complete with half an intake (gate must say NO)")
            resp = await client.post(f"/founders/{fid}/intake/complete")
            print(f"  HTTP {resp.status_code} - {resp.json()['detail']['message']}")

            print("\nSTEP 4 - finish the intake")
            resp = await client.put(f"/founders/{fid}/intake", json=REST_OF_INTAKE)
            print(f"  missing_fields now = {resp.json()['missing_fields']}")

            print("\nSTEP 5 - complete (gate must say YES)")
            resp = await client.post(f"/founders/{fid}/intake/complete")
            resp.raise_for_status()
            print(f"  HTTP {resp.status_code} - status = {resp.json()['status']}")

        print("\nSTEP 6 - intake is now LOCKED")
        resp = await client.put(f"/founders/{fid}/intake", json={"tone": "hacked"})
        print(f"  edit attempt -> HTTP {resp.status_code} ({resp.json()['detail']})")
        resp = await client.post(f"/founders/{fid}/intake/complete")
        print(f"  re-complete attempt -> HTTP {resp.status_code} ({resp.json()['detail']})")

    print("\nSTEP 7 - the audit trail (read from live Supabase)")
    conn = await asyncpg.connect(dsn, timeout=20)
    try:
        rows = await conn.fetch(
            "select event_type, outcome from audit_log where founder_id=$1 order by id",
            UUID(fid),
        )
        for r in rows:
            print(f"  [{r['event_type']:>13}] {r['outcome']}")

        print("\nSTEP 8 - try to TAMPER with the audit log (DB must refuse)")
        try:
            await conn.execute(
                "update audit_log set outcome='hacked' where founder_id=$1", UUID(fid)
            )
            print("  !!! UPDATE SUCCEEDED - THIS IS A BUG !!!")
        except asyncpg.PostgresError as e:
            print(f"  UPDATE refused by the database: {e}")
        try:
            await conn.execute("delete from audit_log where founder_id=$1", UUID(fid))
            print("  !!! DELETE SUCCEEDED - THIS IS A BUG !!!")
        except asyncpg.PostgresError as e:
            print(f"  DELETE refused by the database: {e}")
    finally:
        await conn.close()

    print("\n" + "=" * 64)
    print("DEMO COMPLETE - founder visible in Supabase: Table Editor -> founders")


asyncio.run(main())
