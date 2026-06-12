"""Slice 1.5 live demo — Gate 2 with a REAL rejection.

Flow: analysis → Gate 1 approve → Gate 2: approve the LinkedIn post but
REJECT the X thread with a note → watch the real AI regenerate it following
the note → approve the revision → run done, ApprovalEvents on record.
"""

import asyncio
import sys

from dotenv import load_dotenv

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv()

from sqlalchemy import select  # noqa: E402

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402
from mrk18_execution.db.models import (  # noqa: E402
    ApprovalEventRow,
    ContentItemRow,
    FounderRow,
    RunRow,
)
from mrk18_execution.graph import lifecycle  # noqa: E402
from mrk18_execution.graph.analysis import build_analysis_graph  # noqa: E402
from mrk18_execution.graph.checkpointer import open_checkpointer  # noqa: E402
from mrk18_execution.llm.images import SupabaseMediaStore, pick_engine  # noqa: E402
from mrk18_execution.llm.socket import LLMSocket, default_registry  # noqa: E402

DEMO_EMAIL = "demo@mrk18.ai"
REJECT_NOTE = "Too salesy. Make it a founder story about one real office, no discounts, no CTA spam."


async def show_items(factory, run_id):
    async with factory() as session:
        items = (
            (
                await session.execute(
                    select(ContentItemRow).where(ContentItemRow.run_id == run_id)
                )
            )
            .scalars()
            .all()
        )
    for it in items:
        print(f"\n  [{it.platform.upper()}] status={it.status} regen={it.regeneration_count}")
        text = it.thread[0] if it.thread else it.body
        print(f"    {text[:180]}")
    return items


async def main() -> None:
    settings = get_settings()
    db_engine = build_engine(settings.database_url)
    factory = build_session_factory(db_engine)
    pool, saver = await open_checkpointer(settings.checkpointer_dsn)
    socket = LLMSocket(default_registry(settings.groq_api_key))
    graph = build_analysis_graph(
        socket,
        saver,
        image_engine=pick_engine(settings),
        media_store=SupabaseMediaStore(settings.supabase_url, settings.supabase_service_key),
    )

    try:
        async with factory() as session:
            founder = (
                await session.execute(select(FounderRow).where(FounderRow.email == DEMO_EMAIL))
            ).scalar_one()
            fid = founder.id

        print("=" * 64)
        print("STEP 1+2 - analysis run + Gate 1 approve (few minutes)...")
        run = await lifecycle.start_run(factory, fid)
        await lifecycle.execute_run(graph, factory, run)
        await lifecycle.resume_gate1(graph, factory, run.run_id, {"action": "approve"})

        async with factory() as session:
            row = await session.get(RunRow, run.run_id)
        print(f"  status: {row.status}")
        items = await show_items(factory, run.run_id)
        linkedin = next(i for i in items if i.platform == "linkedin")
        x_item = next(i for i in items if i.platform == "x")

        print("\nSTEP 3 - founder decides at GATE 2:")
        print(f"  APPROVE linkedin · REJECT x with note: '{REJECT_NOTE[:60]}...'")
        await lifecycle.resume_gate2(
            graph,
            factory,
            run.run_id,
            [
                {"item_id": str(linkedin.item_id), "action": "approve"},
                {"item_id": str(x_item.item_id), "action": "reject", "note": REJECT_NOTE},
            ],
        )

        async with factory() as session:
            row = await session.get(RunRow, run.run_id)
        print(f"\n  run status now: {row.status}  (X regenerated, back at the gate)")
        await show_items(factory, run.run_id)

        print("\nSTEP 4 - founder approves the REVISED X thread:")
        await lifecycle.resume_gate2(
            graph, factory, run.run_id, [{"item_id": str(x_item.item_id), "action": "approve"}]
        )
        async with factory() as session:
            row = await session.get(RunRow, run.run_id)
        print(f"  run status: {row.status}")
        await show_items(factory, run.run_id)

        print("\nSTEP 5 - the APPROVAL EVENTS (immutable, the publisher's only truth):")
        async with factory() as session:
            events = (
                (
                    await session.execute(
                        select(ApprovalEventRow)
                        .where(ApprovalEventRow.run_id == run.run_id)
                        .order_by(ApprovalEventRow.decided_at)
                    )
                )
                .scalars()
                .all()
            )
        for e in events:
            note = f" note='{e.note[:40]}...'" if e.note else ""
            print(f"  {str(e.event_id)[:8]}… item={str(e.item_id)[:8]}… {e.decision}{note}")

        print("\n" + "=" * 64)
        print("DEMO COMPLETE. To try the clickable review screen on a fresh run:")
        print("  .venv\\Scripts\\python.exe scripts\\serve.py")
        print("  then open http://127.0.0.1:8000/review/<run_id>")
    finally:
        await pool.close()
        await db_engine.dispose()


asyncio.run(main())
