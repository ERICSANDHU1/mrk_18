"""C3 — run auto-resume: a run orphaned by a restart is re-driven; active and
gate-waiting runs are left alone. (Tests the lifecycle logic the ARQ worker
calls — no Redis/arq needed.)"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import FounderProfileRow, FounderRow, RunRow
from mrk18_execution.graph import lifecycle


class _DoneGraph:
    """A fake graph whose single invocation completes the run, no gate."""

    async def ainvoke(self, graph_input, config, durability):
        return {"usage": [], "report": {"synthesis": "x"}, "content_items": [], "__interrupt__": None}


async def _founder(factory):
    async with factory() as session:
        f = FounderRow(email=f"{uuid4().hex[:8]}@wkr.test")
        session.add(f)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=f.id,
                status="ready_for_analysis",
                draft={},
                profile={"company_name": "W", "target_platforms": ["linkedin"]},
            )
        )
        await session.commit()
        return f.id


async def _plant(factory, founder_id, *, status, minutes_ago=0):
    rid = uuid4()
    async with factory() as session:
        session.add(RunRow(run_id=rid, founder_id=founder_id, thread_id=str(rid), status=status))
        await session.commit()
        if minutes_ago:
            old = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
            await session.execute(update(RunRow).where(RunRow.run_id == rid).values(updated_at=old))
            await session.commit()
    return rid


async def test_resume_stuck_run(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    fid = await _founder(factory)
    rid = await _plant(factory, fid, status="generating", minutes_ago=30)

    result = await lifecycle.resume_stuck_runs(_DoneGraph(), factory, stuck_after_minutes=15)
    assert result["candidates"] == 1 and result["resumed"] == 1
    async with factory() as session:
        row = await session.get(RunRow, rid)
    assert row.status == "done"


async def test_recent_run_not_resumed(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    fid = await _founder(factory)
    await _plant(factory, fid, status="generating", minutes_ago=0)  # just started
    result = await lifecycle.resume_stuck_runs(_DoneGraph(), factory, stuck_after_minutes=15)
    assert result["candidates"] == 0


async def test_awaiting_gate_not_resumed(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    fid = await _founder(factory)
    await _plant(factory, fid, status="awaiting_gate1", minutes_ago=30)  # founder must decide
    result = await lifecycle.resume_stuck_runs(_DoneGraph(), factory, stuck_after_minutes=15)
    assert result["candidates"] == 0


async def test_terminal_run_not_resumed(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    fid = await _founder(factory)
    await _plant(factory, fid, status="done", minutes_ago=30)
    result = await lifecycle.resume_stuck_runs(_DoneGraph(), factory, stuck_after_minutes=15)
    assert result["candidates"] == 0
