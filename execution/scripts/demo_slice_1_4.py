"""Slice 1.4 live demo — full pipeline: analysis → Gate 1 approve →
REAL platform-native content + REAL generated images stored in Supabase.

Free everywhere: Groq free tier (copy) + Pollinations (images, keyless).
Expect 3-6 minutes total.
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
from mrk18_execution.db.models import ContentItemRow, FounderRow, RunRow  # noqa: E402
from mrk18_execution.graph import lifecycle  # noqa: E402
from mrk18_execution.graph.analysis import build_analysis_graph  # noqa: E402
from mrk18_execution.graph.checkpointer import open_checkpointer  # noqa: E402
from mrk18_execution.llm.images import SupabaseMediaStore, pick_engine  # noqa: E402
from mrk18_execution.llm.socket import LLMSocket, default_registry  # noqa: E402

DEMO_EMAIL = "demo@mrk18.ai"


async def main() -> None:
    settings = get_settings()
    db_engine = build_engine(settings.database_url)
    factory = build_session_factory(db_engine)
    pool, saver = await open_checkpointer(settings.checkpointer_dsn)
    socket = LLMSocket(default_registry(settings.groq_api_key))
    image_engine = pick_engine(settings)
    print(f"image engine: {image_engine.name if image_engine else 'NONE (text-only posts)'}")
    graph = build_analysis_graph(
        socket,
        saver,
        image_engine=image_engine,
        media_store=SupabaseMediaStore(settings.supabase_url, settings.supabase_service_key),
    )

    try:
        async with factory() as session:
            founder = (
                await session.execute(select(FounderRow).where(FounderRow.email == DEMO_EMAIL))
            ).scalar_one()
            fid = founder.id

        print("=" * 64)
        print("STEP 1 - analysis run (3 agents + synthesis, Groq free tier)...")
        run = await lifecycle.start_run(factory, fid)
        await lifecycle.execute_run(graph, factory, run)
        async with factory() as session:
            row = await session.get(RunRow, run.run_id)
        print(f"  status: {row.status}")
        if row.status != "awaiting_gate1":
            print(f"  unexpected: {row.error}")
            return

        print("\nSTEP 2 - founder approves at Gate 1 ->")
        print("  content generation per platform + image rendering + upload...")
        await lifecycle.resume_gate1(graph, factory, run.run_id, {"action": "approve"})

        async with factory() as session:
            row = await session.get(RunRow, run.run_id)
            items = (
                (
                    await session.execute(
                        select(ContentItemRow).where(ContentItemRow.run_id == run.run_id)
                    )
                )
                .scalars()
                .all()
            )

        print(f"\n  run status: {row.status} | images generated: {row.images_generated}")
        print(f"  tokens: {row.tokens_in} in / {row.tokens_out} out")
        print(f"  would-be cost: Rs.{float(row.cost_inr):.2f} (billed: Rs.0.00)")

        for it in items:
            print("\n" + "-" * 64)
            print(f"[{it.platform.upper()} / {it.format}]  status={it.status}")
            if it.thread:
                for i, seg in enumerate(it.thread, 1):
                    print(f"  {i}/{len(it.thread)} ({len(seg)} ch): {seg[:160]}")
            else:
                print(f"  {it.body[:400]}")
            if it.first_comment:
                print(f"  first_comment: {it.first_comment[:120]}")
            if it.media:
                m = it.media[0]
                print(f"  IMAGE ({m['width']}x{m['height']} jpeg, {m['size_bytes']//1024} KB):")
                print(f"    {m['url']}")

        print("\n" + "=" * 64)
        print("DEMO COMPLETE - open the image URLs in your browser, and see")
        print("Supabase: Table Editor -> content_items · Storage -> media bucket")
    finally:
        await pool.close()
        await db_engine.dispose()


asyncio.run(main())
