"""Apply pending SQL migrations from supabase/migrations/ to the database.

Tracks applied files in a _migrations table. Each migration runs in one
transaction: it fully applies or not at all. (CLI `supabase db push` can take
over later — the file format is identical.)

Usage:  python scripts/apply_migrations.py
"""

import asyncio
import os
import pathlib
import sys

import asyncpg
from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"


async def main() -> None:
    load_dotenv(ROOT / ".env")
    dsn = os.environ.get("CHECKPOINTER_DSN", "")
    if not dsn:
        sys.exit("CHECKPOINTER_DSN missing — fill execution/.env")

    conn = await asyncpg.connect(dsn, timeout=20)
    try:
        await conn.execute(
            "create table if not exists _migrations ("
            " name text primary key, applied_at timestamptz not null default now())"
        )
        applied = {r["name"] for r in await conn.fetch("select name from _migrations")}
        pending = sorted(
            p for p in MIGRATIONS.glob("*.sql") if p.name not in applied
        )
        if not pending:
            print("nothing to apply — database is up to date")
            return
        for path in pending:
            sql = path.read_text(encoding="utf-8")
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute("insert into _migrations(name) values($1)", path.name)
            print(f"applied: {path.name}")
    finally:
        await conn.close()


asyncio.run(main())
