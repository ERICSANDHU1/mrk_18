"""S3 — per-request tenant binding so RLS enforces.

The policies + the least-privilege `mrk18_tenant` role exist in the migrations,
but RLS only does anything once a connection actually *runs as* that role with
`app.tenant_id` set. These primitives are what turn it on. Inside a scope the
database itself returns only that founder's rows — a missing WHERE clause or an
app bug can no longer leak across tenants.

Two shapes, because Postgres `SET LOCAL` is transaction-scoped (it resets on
every COMMIT):

* `tenant_scope(session, founder_id)` — `SET LOCAL`, for work that runs in a
  SINGLE transaction and commits once. Self-cleaning: the commit resets it, so
  a pooled connection never leaks the role.
* `tenant_session(factory, founder_id)` — opens a session whose role is set at
  the SESSION level (survives the many commits of e.g. a per-item publish
  loop) and is GUARANTEED reset before the connection returns to the pool.

Postgres-only: on SQLite (tests) both are no-ops, and the dedicated RLS tests
skip unless a real Postgres DSN is provided.
"""

import logging
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

TENANT_ROLE = "mrk18_tenant"
log = logging.getLogger("mrk18.tenant")


def _is_postgres(session: AsyncSession) -> bool:
    return session.bind.dialect.name == "postgresql"


async def _set_tenant(session: AsyncSession, founder_id: UUID | str, *, local: bool) -> None:
    """Switch the connection to the tenant role + bind app.tenant_id.

    local=True  → SET LOCAL (transaction-scoped, auto-resets on commit)
    local=False → session-scoped (persists across commits; caller MUST reset)
    """
    role_stmt = f"SET {'LOCAL ' if local else ''}ROLE {TENANT_ROLE}"
    await session.execute(text(role_stmt))
    await session.execute(
        text("SELECT set_config('app.tenant_id', :tid, :is_local)").bindparams(
            tid=str(founder_id), is_local=local
        )
    )


async def _reset_tenant(session: AsyncSession) -> None:
    """Drop back to the connection's own role + clear the GUC. Best-effort:
    never raise from teardown, but a pooled connection must never carry the
    tenant role to the next caller."""
    await session.execute(text("RESET ROLE"))
    await session.execute(
        text("SELECT set_config('app.tenant_id', '', false)")
    )


async def apply_tenant_scope(session: AsyncSession, founder_id: UUID | str) -> None:
    """SET LOCAL the tenant scope on an EXISTING session/transaction.

    For request endpoints: the auth/ownership dependencies have already opened
    the transaction with a privileged query; this scopes everything the
    endpoint does afterward, and the endpoint's single COMMIT resets it."""
    if _is_postgres(session):
        await _set_tenant(session, founder_id, local=True)


@asynccontextmanager
async def tenant_scope(session: AsyncSession, founder_id: UUID | str):
    """Run the enclosed work as the tenant role, scoped to one founder.

    Must be used inside a transaction (SET LOCAL / set_config(..., true) are
    transaction-local and reset on commit/rollback)."""
    if _is_postgres(session):
        await _set_tenant(session, founder_id, local=True)
    try:
        yield session
    finally:
        if _is_postgres(session):
            # belt-and-suspenders: drop back to the connection's own role so a
            # pooled connection never leaks the tenant role to the next caller
            await session.execute(text("RESET ROLE"))


@asynccontextmanager
async def tenant_session(factory: async_sessionmaker, founder_id: UUID | str):
    """Open a session pinned to one tenant for the whole block — even across
    multiple commits (a publish loop commits per item).

    The role is set at SESSION level and committed up front so a later
    rollback can't undo it; it is ALWAYS reset before the connection returns
    to the pool. On SQLite this is just a plain session."""
    session = factory()
    is_pg = _is_postgres(session)
    try:
        if is_pg:
            await _set_tenant(session, founder_id, local=False)
            await session.commit()  # persist the role past any later rollback
        yield session
    finally:
        if is_pg:
            # If the work left a failed/pending transaction (e.g. a rejected
            # cross-tenant write), clear it FIRST — otherwise RESET ROLE itself
            # errors and the connection leaks the tenant role back to the pool.
            try:
                await session.rollback()
                await _reset_tenant(session)
                await session.commit()
            except Exception:  # noqa: BLE001 — teardown must not mask the real error
                log.exception("tenant_session teardown failed to reset role")
        await session.close()
