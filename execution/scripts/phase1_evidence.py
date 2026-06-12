"""Phase-1 sign-off evidence: hard counts from the LIVE database.

Run anytime:  .venv\\Scripts\\python.exe scripts\\phase1_evidence.py
"""

import asyncio
import os
import sys

import asyncpg
from dotenv import load_dotenv

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
load_dotenv()

QUERIES = [
    ("founders registered", "select count(*) from founders"),
    ("intakes completed (ready/locked)", "select count(*) from founder_profiles where status='ready_for_analysis'"),
    ("analysis runs total", "select count(*) from runs"),
    ("runs finished (done)", "select count(*) from runs where status='done'"),
    ("runs failed (with recorded error)", "select count(*) from runs where status='failed' and error is not null"),
    ("content items generated", "select count(*) from content_items"),
    ("items approved by a human", "select count(*) from content_items where status in ('approved','exported','published')"),
    ("approval events (immutable)", "select count(*) from approval_events"),
    ("publish/export results", "select count(*) from publish_results"),
    ("audit records (black box)", "select count(*) from audit_log"),
    ("security alerts raised", "select count(*) from audit_log where event_type='security_alert'"),
    ("total would-be LLM cost (Rs)", "select coalesce(round(sum(cost_inr),2),0) from runs"),
]


async def main() -> None:
    conn = await asyncpg.connect(os.environ["CHECKPOINTER_DSN"], timeout=20)
    try:
        print("=" * 58)
        print("PHASE 1 EVIDENCE — live from Supabase (Singapore)")
        print("=" * 58)
        for label, sql in QUERIES:
            val = await conn.fetchval(sql)
            print(f"  {label:<38} {val}")
        print("-" * 58)
        print("tamper checks (the DB must REFUSE both):")
        for what, sql in [
            ("UPDATE audit_log", "update audit_log set outcome='x' where id=(select min(id) from audit_log)"),
            ("DELETE approval_events", "delete from approval_events where event_id=(select event_id from approval_events limit 1)"),
        ]:
            try:
                await conn.execute(sql)
                print(f"  {what}: !!! SUCCEEDED — INVARIANT BROKEN !!!")
            except asyncpg.PostgresError as e:
                print(f"  {what}: REFUSED ({str(e)[:40]})")
    finally:
        await conn.close()


asyncio.run(main())
