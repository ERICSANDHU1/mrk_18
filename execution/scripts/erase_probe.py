"""NON-DESTRUCTIVE probe of the erase path against the real DB.

Replicates erase_founder's MAIN transaction (disable triggers → delete in order
→ redact audit → re-enable triggers) inside ONE transaction, then ROLLS BACK —
so it reproduces the exact failure with ZERO data change. It never touches the
checkpoint / storage / marker steps (those commit), and never commits anything.

    cd execution
    .venv\\Scripts\\python.exe scripts\\erase_probe.py
"""

import asyncio
import sys
import traceback

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import delete, select, text, update  # noqa: E402

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402
from mrk18_execution.db.models import AuditRow, FounderRow, RunRow  # noqa: E402
from mrk18_execution.security.retention import _APPEND_ONLY, _ERASE_ORDER  # noqa: E402


class _Rollback(Exception):
    """Sentinel raised to force the probe transaction to roll back."""


async def main() -> None:
    s = get_settings()
    if not s.database_url:
        print("NO DATABASE_URL in .env"); return
    eng = build_engine(s.database_url)
    factory = build_session_factory(eng)

    # pick a founder that has runs (matches the real scenario)
    async with factory() as session:
        fid = (await session.execute(select(RunRow.founder_id).limit(1))).scalars().first()
        if fid is None:
            fid = (await session.execute(select(FounderRow.id).limit(1))).scalars().first()
    print("founder_id:", fid)

    # who are we + who owns the trigger-protected tables?
    async with factory() as session:
        who = (await session.execute(text("SELECT current_user, session_user"))).first()
        print("current_user / session_user:", tuple(who))
        for table in _APPEND_ONLY:
            owner = (
                await session.execute(
                    text("SELECT tableowner FROM pg_tables WHERE tablename = :t"), {"t": table}
                )
            ).scalar()
            trig = (
                await session.execute(
                    text(
                        "SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid "
                        "WHERE c.relname = :t AND NOT t.tgisinternal"
                    ),
                    {"t": table},
                )
            ).scalars().all()
            print(f"  {table}: owner={owner}  triggers={trig}")

    # replicate the main erase transaction, then force a rollback
    step = "start"
    try:
        async with factory() as session:
            async with session.begin():
                step = "get founder"
                assert await session.get(FounderRow, fid) is not None
                step = "DISABLE triggers"
                for table, trigger in _APPEND_ONLY.items():
                    await session.execute(text(f"ALTER TABLE {table} DISABLE TRIGGER {trigger}"))
                step = "deletes"
                counts: dict[str, int] = {}
                for model in _ERASE_ORDER:
                    key_col = model.id if model is FounderRow else model.founder_id
                    r = await session.execute(delete(model).where(key_col == fid))
                    counts[model.__tablename__] = r.rowcount or 0
                step = "redact audit"
                await session.execute(
                    update(AuditRow)
                    .where(AuditRow.founder_id == fid)
                    .values(outcome="redacted", detail={"redacted": True}, redacted=True)
                )
                step = "ENABLE triggers"
                for table, trigger in _APPEND_ONLY.items():
                    await session.execute(text(f"ALTER TABLE {table} ENABLE TRIGGER {trigger}"))
                print("\n✅ all main-transaction steps SUCCEEDED — rolling back. counts:", counts)
                raise _Rollback()
    except _Rollback:
        print("rolled back — NO data changed.")
    except Exception:
        print(f"\n❌ FAILED at step: {step}")
        traceback.print_exc()
    finally:
        await eng.dispose()


asyncio.run(main())
