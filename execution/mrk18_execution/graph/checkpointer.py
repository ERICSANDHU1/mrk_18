"""Durable Postgres checkpointer for LangGraph (Supabase session pooler).

Research-mandated settings: autocommit=True + dict_row on every connection;
session pooler (5432) only — the transaction pooler breaks prepared
statements with this exact stack.
"""

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def open_checkpointer(dsn: str) -> tuple[AsyncConnectionPool, AsyncPostgresSaver]:
    pool = AsyncConnectionPool(
        dsn,
        min_size=1,
        max_size=5,
        open=False,
        kwargs={"autocommit": True, "row_factory": dict_row},
    )
    await pool.open()
    saver = AsyncPostgresSaver(pool)
    await saver.setup()  # idempotent: creates checkpoint tables on first run
    return pool, saver
