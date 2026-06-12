"""Slice 1.3 live demo — REAL AI agents + REAL durable pause on Supabase.

Two phases, run as TWO SEPARATE PROCESSES to prove the gate survives death:

  python scripts/demo_slice_1_3.py start
      runs the analysis for the demo founder until Gate 1, then THE PROCESS
      EXITS (simulating a crash/restart). Prints the run_id.

  python scripts/demo_slice_1_3.py resume <run_id> approve
      a brand-new process resumes the exact same run from the checkpoint in
      Supabase and completes it.

Free-tier note: 'start' takes ~2-5 minutes (Groq free tier is speed-capped).
"""

import asyncio
import json
import sys
from uuid import UUID

from dotenv import load_dotenv

if sys.platform == "win32":
    # psycopg async needs the selector loop on Windows (dev only; prod = Linux)
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv()

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402
from mrk18_execution.db.models import RunRow  # noqa: E402
from mrk18_execution.graph import lifecycle  # noqa: E402
from mrk18_execution.graph.analysis import build_analysis_graph  # noqa: E402
from mrk18_execution.graph.checkpointer import open_checkpointer  # noqa: E402
from mrk18_execution.llm.socket import LLMSocket, default_registry  # noqa: E402

DEMO_EMAIL = "demo@mrk18.ai"


async def get_demo_founder_id(factory) -> UUID:
    from sqlalchemy import select

    from mrk18_execution.db.models import FounderRow

    async with factory() as session:
        founder = (
            await session.execute(select(FounderRow).where(FounderRow.email == DEMO_EMAIL))
        ).scalar_one()
        return founder.id


def print_report(report: dict) -> None:
    for key in ("market_intel", "audience_positioning", "content_strategy"):
        section = report[key]
        print(f"\n--- {key.upper()} ---")
        print(f"  {section['summary'][:300]}")
        for c in section["claims"][:4]:
            print(f"   [{c['confidence']:>6}] {c['text'][:110]}  (source: {c['source'][:40]})")
    print("\n--- THE CMO'S VERDICT (synthesis) ---")
    print("  " + report["synthesis"][:600].replace("\n", "\n  "))


async def main() -> None:
    settings = get_settings()
    engine = build_engine(settings.database_url)
    factory = build_session_factory(engine)
    pool, saver = await open_checkpointer(settings.checkpointer_dsn)
    socket = LLMSocket(default_registry(settings.groq_api_key))
    graph = build_analysis_graph(socket, saver)

    try:
        mode = sys.argv[1] if len(sys.argv) > 1 else "start"

        if mode == "start":
            founder_id = await get_demo_founder_id(factory)
            print("=" * 64)
            print("PHASE A - starting REAL analysis run for Chai Robotics (DEMO)")
            print("3 agents + synthesis on Groq free tier - expect 2-5 minutes...")
            run = await lifecycle.start_run(factory, founder_id)
            print(f"run_id = {run.run_id}")
            await lifecycle.execute_run(graph, factory, run)

            async with factory() as session:
                row = await session.get(RunRow, run.run_id)
            print(f"\nstatus = {row.status}")
            print(f"tokens: {row.tokens_in} in / {row.tokens_out} out")
            print(f"would-be cost: Rs.{float(row.cost_inr):.2f} (billed: Rs.0.00 - free tier)")
            if row.status == "awaiting_gate1":
                print_report(row.gate1["payload"]["report"])
                print("\n" + "=" * 64)
                print("RUN IS FROZEN AT GATE 1. THIS PROCESS NOW EXITS (simulated crash).")
                print("Resume from a NEW process with:")
                print(f"  python scripts/demo_slice_1_3.py resume {run.run_id} approve")
            elif row.status == "failed":
                print(f"RUN FAILED: {row.error}")

        elif mode == "resume":
            run_id = UUID(sys.argv[2])
            action = sys.argv[3] if len(sys.argv) > 3 else "approve"
            decision = {"action": action}
            if action == "flag":
                decision["flags"] = sys.argv[4:] or ["demo disagreement"]
            print("=" * 64)
            print(f"PHASE B - NEW PROCESS resuming run {run_id} with: {decision}")
            await lifecycle.resume_gate1(graph, factory, run_id, decision)
            async with factory() as session:
                row = await session.get(RunRow, run_id)
            print(f"status = {row.status}")
            print(f"tokens total: {row.tokens_in} in / {row.tokens_out} out")
            print(f"would-be cost: Rs.{float(row.cost_inr):.2f} (billed: Rs.0.00)")
            if row.status == "done":
                print("\nRUN COMPLETE - the pause survived a full process death.")
                print(f"final report stored in runs table ({len(json.dumps(row.report))} bytes)")
            elif row.status == "awaiting_gate1":
                print("\nrevised report ready - frozen at Gate 1 again (flag path)")
                print_report(row.gate1["payload"]["report"])
    finally:
        await pool.close()
        await engine.dispose()


asyncio.run(main())
