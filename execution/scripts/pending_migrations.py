"""Read-only: list which migrations are applied vs pending. Mutates nothing.

    cd execution
    .venv\\Scripts\\python.exe scripts\\pending_migrations.py
"""

import asyncio
import os
import pathlib
import sys

import asyncpg
from dotenv import load_dotenv

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"


async def main() -> None:
    load_dotenv(ROOT / ".env")
    dsn = os.environ.get("CHECKPOINTER_DSN", "") or os.environ.get("DATABASE_URL", "")
    if not dsn:
        sys.exit("no DSN in .env")
    # asyncpg wants a plain postgres DSN, not the +asyncpg SQLAlchemy form
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(dsn, timeout=20)
    try:
        exists = await conn.fetchval(
            "select to_regclass('public._migrations') is not null"
        )
        applied = set()
        if exists:
            applied = {r["name"] for r in await conn.fetch("select name from _migrations")}
        all_files = sorted(p.name for p in MIGRATIONS.glob("*.sql"))
        print("APPLIED:")
        for n in all_files:
            if n in applied:
                print(f"  [x] {n}")
        print("\nPENDING (will run on apply_migrations.py):")
        pending = [n for n in all_files if n not in applied]
        for n in pending:
            print(f"  [ ] {n}")
        print("\n=>", len(pending), "pending,", len(applied), "applied")
    finally:
        await conn.close()


asyncio.run(main())
