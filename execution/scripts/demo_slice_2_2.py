"""Slice 2.2 live demo — RLS tenant isolation + DPDP erasure on real Supabase.

Creates two throwaway founders (A, B) each with one content item, then:
  1. queries WITHOUT tenant scope  -> sees BOTH (today's bypass, as superuser)
  2. queries scoped to A           -> sees ONLY A (RLS enforcing)
  3. tries to read B's row as A    -> empty (the database refuses)
  4. erases B (DPDP)               -> B gone, A untouched, marker kept
Then deletes A too, leaving the DB clean.
"""

import asyncio
import sys
from uuid import uuid4

from dotenv import load_dotenv

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
load_dotenv()

from sqlalchemy import func, select  # noqa: E402

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402
from mrk18_execution.db.models import ContentItemRow, FounderRow, RunRow  # noqa: E402
from mrk18_execution.security.retention import erase_founder  # noqa: E402
from mrk18_execution.security.tenant import tenant_scope  # noqa: E402


async def seed(factory, email):
    async with factory() as session:
        async with session.begin():
            f = FounderRow(email=email)
            session.add(f)
            await session.flush()
            run = RunRow(run_id=uuid4(), founder_id=f.id, thread_id=str(uuid4()), status="done")
            session.add(run)
            await session.flush()
            session.add(ContentItemRow(
                item_id=uuid4(), run_id=run.run_id, founder_id=f.id,
                platform="linkedin", format="linkedin_post",
                body=f"CONFIDENTIAL strategy of {email}", status="approved",
            ))
        return f.id


async def main() -> None:
    s = get_settings()
    engine = build_engine(s.database_url)
    factory = build_session_factory(engine)
    a = b = None
    try:
        a = await seed(factory, f"a-{uuid4().hex[:6]}@demo.test")
        b = await seed(factory, f"b-{uuid4().hex[:6]}@demo.test")
        print("=" * 64)
        print(f"two founders seeded:\n  A = {a}\n  B = {b}")

        print("\nSTEP 1 - query content_items WITHOUT tenant scope (superuser bypass):")
        async with factory() as session:
            n = (await session.execute(
                select(func.count()).select_from(ContentItemRow)
                .where(ContentItemRow.founder_id.in_([a, b]))
            )).scalar_one()
        print(f"  rows visible: {n}  (sees both A and B — the old behavior)")

        print("\nSTEP 2 - query scoped to A (RLS enforcing via mrk18_tenant role):")
        async with factory() as session:
            async with session.begin():
                async with tenant_scope(session, a):
                    rows = (await session.execute(
                        select(ContentItemRow.founder_id, ContentItemRow.body)
                    )).all()
        print(f"  rows visible: {len(rows)}")
        for fid, body in rows:
            owner = "A" if str(fid) == str(a) else ("B" if str(fid) == str(b) else "?")
            print(f"    [{owner}] {body[:45]}")

        print("\nSTEP 3 - as A, try to read B's row explicitly:")
        async with factory() as session:
            async with session.begin():
                async with tenant_scope(session, a):
                    bs = (await session.execute(
                        select(ContentItemRow).where(ContentItemRow.founder_id == b)
                    )).scalars().all()
        print(f"  B's rows returned to A: {len(bs)}  ({'LEAK - BUG!' if bs else 'DENIED by the database'})")

        print("\nSTEP 4 - DPDP erase founder B:")
        counts = await erase_founder(factory, b)
        print(f"  deleted: {counts}")
        async with factory() as session:
            a_left = (await session.execute(select(func.count()).select_from(ContentItemRow).where(ContentItemRow.founder_id == a))).scalar_one()
            b_left = (await session.execute(select(func.count()).select_from(ContentItemRow).where(ContentItemRow.founder_id == b))).scalar_one()
        print(f"  A content remaining: {a_left} (untouched) · B content remaining: {b_left} (erased)")

        print("\n" + "=" * 64)
        print("DEMO COMPLETE")
    finally:
        # clean up the throwaway founders
        for fid in (a, b):
            if fid is not None:
                try:
                    await erase_founder(factory, fid)
                except LookupError:
                    pass
        await engine.dispose()


asyncio.run(main())
