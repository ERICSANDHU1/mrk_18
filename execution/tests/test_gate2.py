"""Slice 1.5 — Gate 2: per-item approval, ApprovalEvents, regeneration,
silence-expiry. Every product rule attacked.
"""

from datetime import datetime, timedelta, timezone

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import (
    ApprovalEventRow,
    AuditRow,
    ContentItemRow,
    FounderProfileRow,
    FounderRow,
    RunRow,
)
from mrk18_execution.graph import lifecycle
from mrk18_execution.graph.analysis import build_analysis_graph

from .test_analysis_graph import FakeSocket


@pytest.fixture
async def ctx(engine):
    """Single-platform founder (LinkedIn only) → one item per run = focused tests."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        founder = FounderRow(email="gate2@test.in")
        session.add(founder)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=founder.id,
                status="ready_for_analysis",
                draft={},
                profile={
                    "company_name": "Chai Robotics",
                    "icp": "tech parks",
                    "tone": "bold",
                    "target_platforms": ["linkedin"],
                },
            )
        )
        await session.commit()
        founder_id = founder.id
    socket = FakeSocket()
    graph = build_analysis_graph(socket, InMemorySaver())
    return factory, graph, socket, founder_id


async def to_gate2(factory, graph, founder_id):
    run = await lifecycle.start_run(factory, founder_id)
    await lifecycle.execute_run(graph, factory, run)
    await lifecycle.resume_gate1(graph, factory, run.run_id, {"action": "approve"})
    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "awaiting_gate2"
    return run.run_id, row.gate2["payload"]["items"]


async def test_approve_mints_event_and_completes(ctx):
    factory, graph, socket, founder_id = ctx
    run_id, items = await to_gate2(factory, graph, founder_id)

    await lifecycle.resume_gate2(
        graph, factory, run_id, [{"item_id": items[0]["item_id"], "action": "approve"}]
    )

    async with factory() as session:
        run = await session.get(RunRow, run_id)
        item = (
            await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id))
        ).scalar_one()
        events = (
            (await session.execute(select(ApprovalEventRow).where(ApprovalEventRow.run_id == run_id)))
            .scalars()
            .all()
        )
        audits = (
            (
                await session.execute(
                    select(AuditRow).where(
                        AuditRow.run_id == run_id, AuditRow.outcome == "gate2_item_approved"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert run.status == "done"
    assert item.status == "approved"
    assert len(events) == 1
    assert events[0].decision == "approved"
    assert events[0].item_id == item.item_id
    # the audit row carries the approval_event_id — the chain the publisher follows
    assert audits[0].approval_event_id == events[0].event_id


async def test_reject_with_note_regenerates_once_then_approve(ctx):
    factory, graph, socket, founder_id = ctx
    run_id, items = await to_gate2(factory, graph, founder_id)
    first_calls = socket.calls["content"]

    await lifecycle.resume_gate2(
        graph,
        factory,
        run_id,
        [{"item_id": items[0]["item_id"], "action": "reject", "note": "less salesy, more story"}],
    )

    async with factory() as session:
        run = await session.get(RunRow, run_id)
        item = (
            await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id))
        ).scalar_one()
    assert run.status == "awaiting_gate2"  # revised draft is back at the gate
    assert item.status == "awaiting_approval"
    assert item.regeneration_count == 1
    assert item.regeneration_note == "less salesy, more story"
    assert socket.calls["content"] == first_calls + 1  # exactly one regen call

    await lifecycle.resume_gate2(
        graph, factory, run_id, [{"item_id": str(item.item_id), "action": "approve"}]
    )
    async with factory() as session:
        run = await session.get(RunRow, run_id)
        item = (
            await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id))
        ).scalar_one()
        events = (
            (await session.execute(select(ApprovalEventRow).where(ApprovalEventRow.run_id == run_id)))
            .scalars()
            .all()
        )
    assert run.status == "done"
    assert item.status == "approved"
    assert {e.decision for e in events} == {"rejected", "approved"}  # full history kept


async def test_reject_without_note_is_terminal(ctx):
    factory, graph, socket, founder_id = ctx
    run_id, items = await to_gate2(factory, graph, founder_id)
    calls_before = socket.calls["content"]

    await lifecycle.resume_gate2(
        graph, factory, run_id, [{"item_id": items[0]["item_id"], "action": "reject"}]
    )
    async with factory() as session:
        run = await session.get(RunRow, run_id)
        item = (
            await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id))
        ).scalar_one()
    assert item.status == "rejected"  # no note → no regeneration
    assert socket.calls["content"] == calls_before
    assert run.status == "done"


async def test_regeneration_caps_at_two(ctx):
    factory, graph, socket, founder_id = ctx
    run_id, items = await to_gate2(factory, graph, founder_id)
    item_id = items[0]["item_id"]

    for expected_count in (1, 2):
        await lifecycle.resume_gate2(
            graph, factory, run_id, [{"item_id": item_id, "action": "reject", "note": "again"}]
        )
        async with factory() as session:
            item = (
                await session.execute(
                    select(ContentItemRow).where(ContentItemRow.run_id == run_id)
                )
            ).scalar_one()
        assert item.regeneration_count == expected_count
        assert item.status == "awaiting_approval"

    calls_before = socket.calls["content"]
    await lifecycle.resume_gate2(
        graph, factory, run_id, [{"item_id": item_id, "action": "reject", "note": "third time"}]
    )
    async with factory() as session:
        run = await session.get(RunRow, run_id)
        item = (
            await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id))
        ).scalar_one()
    assert item.status == "rejected"  # cap reached: terminal even WITH a note
    assert socket.calls["content"] == calls_before  # no third regeneration
    assert run.status == "done"


async def test_partial_decisions_keep_run_waiting(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        founder = FounderRow(email="partial@test.in")
        session.add(founder)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=founder.id,
                status="ready_for_analysis",
                draft={},
                profile={
                    "company_name": "X",
                    "icp": "y",
                    "tone": "bold",
                    "target_platforms": ["linkedin", "x"],
                },
            )
        )
        await session.commit()
        fid = founder.id
    socket = FakeSocket()
    graph = build_analysis_graph(socket, InMemorySaver())
    run_id, items = await to_gate2(factory, graph, fid)
    assert len(items) == 2

    # decide only the first — the run must stay at the gate for the second
    await lifecycle.resume_gate2(
        graph, factory, run_id, [{"item_id": items[0]["item_id"], "action": "approve"}]
    )
    async with factory() as session:
        run = await session.get(RunRow, run_id)
    assert run.status == "awaiting_gate2"

    await lifecycle.resume_gate2(
        graph, factory, run_id, [{"item_id": items[1]["item_id"], "action": "approve"}]
    )
    async with factory() as session:
        run = await session.get(RunRow, run_id)
    assert run.status == "done"


async def test_mint_rejects_invalid_decisions(ctx):
    factory, graph, socket, founder_id = ctx
    run_id, items = await to_gate2(factory, graph, founder_id)
    item_id = items[0]["item_id"]

    await lifecycle.resume_gate2(graph, factory, run_id, [{"item_id": item_id, "action": "approve"}])

    # run is done now — deciding again must fail loudly, and mint nothing
    with pytest.raises(ValueError):
        await lifecycle.mint_gate2_decisions(
            factory, run_id, [{"item_id": item_id, "action": "reject"}]
        )
    async with factory() as session:
        events = (
            (await session.execute(select(ApprovalEventRow).where(ApprovalEventRow.run_id == run_id)))
            .scalars()
            .all()
        )
    assert len(events) == 1  # only the original approval


async def test_silence_expires_items_and_closes_run(ctx):
    factory, graph, socket, founder_id = ctx
    run_id, items = await to_gate2(factory, graph, founder_id)

    # founder says nothing for 3 days
    async with factory() as session:
        await session.execute(
            update(ContentItemRow)
            .where(ContentItemRow.run_id == run_id)
            .values(updated_at=datetime.now(timezone.utc) - timedelta(hours=72))
        )
        await session.commit()

    expired = await lifecycle.expire_stale_approvals(factory, max_age_hours=48)
    assert expired == 1

    async with factory() as session:
        run = await session.get(RunRow, run_id)
        item = (
            await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id))
        ).scalar_one()
        outcomes = (
            (await session.execute(select(AuditRow.outcome).where(AuditRow.run_id == run_id)))
            .scalars()
            .all()
        )
        events = (
            (await session.execute(select(ApprovalEventRow).where(ApprovalEventRow.run_id == run_id)))
            .scalars()
            .all()
        )
    assert item.status == "expired"  # silence = rejection
    assert run.status == "done" and run.gate2 == {"awaiting": False, "expired": True}
    assert "gate2_item_expired_silence" in outcomes
    assert events == []  # expiry is NOT an approval — no event minted


async def test_fresh_items_do_not_expire(ctx):
    factory, graph, socket, founder_id = ctx
    run_id, _ = await to_gate2(factory, graph, founder_id)
    expired = await lifecycle.expire_stale_approvals(factory, max_age_hours=48)
    assert expired == 0
    async with factory() as session:
        run = await session.get(RunRow, run_id)
    assert run.status == "awaiting_gate2"
