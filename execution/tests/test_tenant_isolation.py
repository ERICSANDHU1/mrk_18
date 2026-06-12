"""Slice 2.2 — RLS tenant isolation, proven against REAL Postgres.

RLS, roles, and the app.tenant_id GUC don't exist on SQLite, so these tests
skip unless TEST_PG_DSN points at a Postgres with the migrations applied
(the live demo proves it end-to-end on Supabase regardless).

Two primitives are exercised: `tenant_scope` (SET LOCAL, single transaction)
and `tenant_session` (session-level role, survives the many commits of a
publish loop) — the latter is the one wired into the services, so it must both
isolate AND reset the role before the connection returns to the pool.
"""

import os
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from mrk18_execution.db.models import ContentItemRow, FounderRow, RunRow
from mrk18_execution.security.tenant import tenant_scope, tenant_session

PG_DSN = os.environ.get("TEST_PG_DSN")
pytestmark = pytest.mark.skipif(not PG_DSN, reason="set TEST_PG_DSN to a migrated Postgres to run RLS tests")


@pytest.fixture
async def pg_factory():
    eng = create_async_engine(PG_DSN, pool_size=2)
    yield async_sessionmaker(eng, expire_on_commit=False)
    await eng.dispose()


async def _seed(factory, email):
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
                platform="linkedin", format="linkedin_post", body=f"secret of {email}", status="approved",
            ))
        return f.id


async def test_rls_blocks_cross_tenant_reads(pg_factory):
    a = await _seed(pg_factory, f"a-{uuid4().hex[:6]}@rls.test")
    b = await _seed(pg_factory, f"b-{uuid4().hex[:6]}@rls.test")

    async with pg_factory() as session:
        async with session.begin():
            async with tenant_scope(session, a):
                rows = (await session.execute(select(ContentItemRow.founder_id))).scalars().all()
            # scoped as A: only A's rows are visible
            assert all(str(fid) == str(a) for fid in rows)
            assert any(str(fid) == str(a) for fid in rows)

    async with pg_factory() as session:
        async with session.begin():
            async with tenant_scope(session, a):
                # try to read B's row explicitly — RLS returns nothing
                bs = (
                    await session.execute(
                        select(ContentItemRow).where(ContentItemRow.founder_id == b)
                    )
                ).scalars().all()
            assert bs == []


async def test_tenant_session_scopes_and_resets(pg_factory):
    """The wired primitive: an UNFILTERED read sees only the scoped founder,
    and the role is reset on exit so the pooled connection never leaks it."""
    a = await _seed(pg_factory, f"a-{uuid4().hex[:6]}@rls.test")
    b = await _seed(pg_factory, f"b-{uuid4().hex[:6]}@rls.test")

    async with tenant_session(pg_factory, a) as session:
        # no WHERE clause at all — RLS is the only thing filtering
        seen = (await session.execute(select(ContentItemRow.founder_id))).scalars().all()
        assert seen and all(str(fid) == str(a) for fid in seen)
        # and the role really is the non-bypass tenant role
        role = (await session.execute(text("SELECT current_user"))).scalar_one()
        assert role == "mrk18_tenant"

    # after the block: a fresh session on the same pool is privileged again —
    # proof the role was reset (B's rows are visible to the unscoped reader)
    async with pg_factory() as session:
        both = (
            await session.execute(
                select(ContentItemRow.founder_id).where(
                    ContentItemRow.founder_id.in_([a, b])
                )
            )
        ).scalars().all()
        assert any(str(fid) == str(b) for fid in both)
        role = (await session.execute(text("SELECT current_user"))).scalar_one()
        assert role != "mrk18_tenant"


async def test_tenant_session_blocks_cross_tenant_write(pg_factory):
    """WITH CHECK: scoped to A, inserting a row owned by B is refused by the DB."""
    a = await _seed(pg_factory, f"a-{uuid4().hex[:6]}@rls.test")
    b = await _seed(pg_factory, f"b-{uuid4().hex[:6]}@rls.test")
    # a real run of A's to satisfy the FK; the founder_id is the violation
    async with pg_factory() as session:
        a_run = (
            await session.execute(select(RunRow.run_id).where(RunRow.founder_id == a))
        ).scalars().first()

    with pytest.raises(Exception):  # noqa: B017 — asyncpg raises an RLS check error
        async with tenant_session(pg_factory, a) as session:
            session.add(
                ContentItemRow(
                    item_id=uuid4(),
                    run_id=a_run,
                    founder_id=b,  # not the scoped tenant → WITH CHECK rejects
                    platform="linkedin",
                    format="linkedin_post",
                    body="smuggled into B",
                    status="approved",
                )
            )
            await session.commit()
