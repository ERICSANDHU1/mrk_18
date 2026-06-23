"""Async engine + session factory.

One rule from the research: the DSN must point at Supabase's SESSION pooler
(port 5432). The transaction pooler (6543) breaks prepared statements.
"""

from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine


def build_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(
        database_url,
        pool_size=5,
        max_overflow=2,
        pool_pre_ping=True,  # health-check a connection before handing it out
        pool_recycle=300,  # recycle conns >5 min old — Supabase's pooler reaps idle ones
    )


def build_session_factory(engine: AsyncEngine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)
