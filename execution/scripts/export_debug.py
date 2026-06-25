"""Reproduce the data-export 500 locally against the real DB, print the traceback.

    cd execution
    .venv\\Scripts\\python.exe scripts\\export_debug.py
"""

import asyncio
import json
import sys
import traceback

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402
from mrk18_execution.db.models import FounderRow, RunRow  # noqa: E402
from mrk18_execution.security.retention import export_founder_data  # noqa: E402


async def main() -> None:
    s = get_settings()
    if not s.database_url:
        print("NO DATABASE_URL in .env"); return
    eng = build_engine(s.database_url)
    factory = build_session_factory(eng)

    # pick a founder that actually has runs (matches the failing scenario)
    async with factory() as session:
        fid = (await session.execute(select(RunRow.founder_id).limit(1))).scalars().first()
        if fid is None:
            fid = (await session.execute(select(FounderRow.id).limit(1))).scalars().first()
    print("founder_id:", fid)

    try:
        data = await export_founder_data(factory, fid)
        print("\n✅ EXPORT OK — keys:", list(data.keys()))
        print(json.dumps(data, indent=1, default=str)[:1500])
    except Exception:
        print("\n=== ❌ EXPORT FAILED — traceback ===")
        traceback.print_exc()
    finally:
        await eng.dispose()


asyncio.run(main())
