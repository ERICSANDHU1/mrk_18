"""Report schema drift: which model tables are MISSING from the real DB.

    cd execution
    .venv\\Scripts\\python.exe scripts\\schema_drift.py
"""

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import text  # noqa: E402

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402
from mrk18_execution.db.models import Base  # noqa: E402

# checkpointer + bookkeeping tables that aren't SQLAlchemy models
EXTRA = ["checkpoints", "checkpoint_blobs", "checkpoint_writes", "checkpoint_migrations", "_migrations"]


async def main() -> None:
    s = get_settings()
    if not s.database_url:
        print("NO DATABASE_URL in .env"); return
    eng = build_engine(s.database_url)
    factory = build_session_factory(eng)

    model_tables = sorted(Base.metadata.tables.keys())
    async with factory() as session:
        rows = (
            await session.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            )
        ).scalars().all()
    actual = set(rows)

    print(f"DB has {len(actual)} public tables.\n")
    print("MODEL TABLES:")
    missing = []
    for t in model_tables:
        ok = t in actual
        print(f"  [{'OK ' if ok else 'MISSING'}] {t}")
        if not ok:
            missing.append(t)
    print("\nCHECKPOINTER / BOOKKEEPING:")
    for t in EXTRA:
        print(f"  [{'OK ' if t in actual else 'absent'}] {t}")

    print("\n=== MISSING MODEL TABLES:", missing or "none — schema is in sync ✅")

    await eng.dispose()


asyncio.run(main())
