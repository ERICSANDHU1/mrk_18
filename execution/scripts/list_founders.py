"""Read-only: list founders + profiles to diagnose 'no founder record yet'.

    cd execution
    .venv\\Scripts\\python.exe scripts\\list_founders.py
"""

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import text  # noqa: E402

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402


async def main() -> None:
    s = get_settings()
    eng = build_engine(s.database_url)
    factory = build_session_factory(eng)
    async with factory() as session:
        n = (await session.execute(text("select count(*) from founders"))).scalar()
        print(f"founders: {n}\n")
        rows = (
            await session.execute(
                text(
                    "select f.id, f.email, f.display_name, f.auth_user_id, "
                    "p.status as profile_status, p.created_at "
                    "from founders f left join founder_profiles p on p.founder_id = f.id "
                    "order by p.created_at desc nulls last"
                )
            )
        ).all()
        for r in rows:
            print(f"  {r.email or '(no email)'} | name={r.display_name!r} | id={r.id}")
            print(f"      auth_user_id={r.auth_user_id} | profile_status={r.profile_status}")
        # recent erasure markers (audit) — proof an erasure happened
        print("\nrecent founder_erased audit markers:")
        marks = (
            await session.execute(
                text(
                    "select founder_id, created_at, detail from audit_log "
                    "where outcome = 'founder_erased' order by created_at desc limit 5"
                )
            )
        ).all()
        if not marks:
            print("  (none)")
        for m in marks:
            print(f"  erased founder_id={m.founder_id} at {m.created_at}")
    await eng.dispose()


asyncio.run(main())
