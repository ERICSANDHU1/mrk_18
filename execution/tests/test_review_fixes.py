"""Regression tests for the Phase-1 exit-review findings (B1-B4, M1-M5).

Each test reproduces the bug the review found and asserts the fix holds, so a
future change that reintroduces it fails loudly.
"""

from uuid import uuid4

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import (
    ApprovalEventRow,
    ContentItemRow,
    FounderProfileRow,
    FounderRow,
    RunRow,
)
from mrk18_execution.graph import lifecycle
from mrk18_execution.graph.analysis import build_analysis_graph
from mrk18_execution.publishers.service import publish_run
from mrk18_execution.schemas.content import ContentItem, MediaSpec
from mrk18_execution.schemas.enums import ContentFormat, Platform

from .test_analysis_graph import FakeSocket


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


async def _ready_founder(factory, platforms):
    async with factory() as session:
        founder = FounderRow(email=f"{uuid4().hex[:8]}@fix.test")
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
                    "target_platforms": platforms,
                },
            )
        )
        await session.commit()
        return founder.id


async def _to_gate2(factory, graph, founder_id):
    run = await lifecycle.start_run(factory, founder_id)
    await lifecycle.execute_run(graph, factory, run)
    await lifecycle.resume_gate1(graph, factory, run.run_id, {"action": "approve"})
    return run.run_id


# ── B1: stale graph state must not clobber a decided/terminal item ──────────


async def test_b1_export_then_later_gate2_resume_keeps_exported(factory):
    """LinkedIn approved+exported while X still awaits; approving X later (a
    fresh _drive) must NOT revert the exported LinkedIn item to 'approved'."""
    founder_id = await _ready_founder(factory, ["linkedin", "x"])
    graph = build_analysis_graph(FakeSocket(), InMemorySaver())
    run_id = await _to_gate2(factory, graph, founder_id)

    async with factory() as session:
        items = (
            (await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id)))
            .scalars()
            .all()
        )
    li = next(i for i in items if i.platform == "linkedin")
    x = next(i for i in items if i.platform == "x")

    # approve + export LinkedIn while X still awaits (run stays awaiting_gate2)
    await lifecycle.resume_gate2(
        graph, factory, run_id, [{"item_id": str(li.item_id), "action": "approve"}]
    )
    # run not done yet (X awaits) → publish would be blocked by B4; export the
    # one approved item by forcing a publishable state is not possible, so we
    # simulate the out-of-band export by setting it directly, then resume X.
    async with factory() as session:
        li_row = await session.get(ContentItemRow, li.item_id)
        li_row.status = "exported"
        await session.commit()

    # approving X triggers a fresh _drive that re-persists the whole item set
    await lifecycle.resume_gate2(
        graph, factory, run_id, [{"item_id": str(x.item_id), "action": "approve"}]
    )

    async with factory() as session:
        li_after = await session.get(ContentItemRow, li.item_id)
    assert li_after.status == "exported"  # NOT reverted to 'approved'


async def test_b1_expired_item_not_resurrected_by_later_resume(factory):
    founder_id = await _ready_founder(factory, ["linkedin", "x"])
    graph = build_analysis_graph(FakeSocket(), InMemorySaver())
    run_id = await _to_gate2(factory, graph, founder_id)

    async with factory() as session:
        items = (
            (await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id)))
            .scalars()
            .all()
        )
    li, x = items[0], items[1]
    async with factory() as session:
        row = await session.get(ContentItemRow, li.item_id)
        row.status = "expired"  # out-of-band expiry
        await session.commit()

    await lifecycle.resume_gate2(
        graph, factory, run_id, [{"item_id": str(x.item_id), "action": "approve"}]
    )
    async with factory() as session:
        li_after = await session.get(ContentItemRow, li.item_id)
    assert li_after.status == "expired"  # terminal — not revived to awaiting


# ── B3: pre-_drive failure lands the run as 'failed', never stuck ───────────


async def test_b3_profile_load_failure_marks_run_failed(factory):
    founder_id = await _ready_founder(factory, ["linkedin"])
    graph = build_analysis_graph(FakeSocket(), InMemorySaver())
    run = await lifecycle.start_run(factory, founder_id)
    # delete the profile AFTER start_run but BEFORE execute_run drives →
    # _load_profile's scalar_one() raises before _drive's own try/except
    async with factory() as session:
        prof = await session.get(FounderProfileRow, founder_id)
        await session.delete(prof)
        await session.commit()

    await lifecycle.execute_run(graph, factory, run)  # must not vanish

    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "failed"
    assert row.finished_at is not None
    assert row.error  # the reason was recorded, not swallowed


# ── B4: publish blocked while the run is still at the gate ──────────────────


async def test_b4_publish_blocked_when_run_not_done(factory):
    founder_id = await _ready_founder(factory, ["linkedin", "x"])
    graph = build_analysis_graph(FakeSocket(), InMemorySaver())
    run_id = await _to_gate2(factory, graph, founder_id)  # status awaiting_gate2
    with pytest.raises(ValueError, match="not finished"):
        await publish_run(factory, run_id, mode="export")


# ── M3: a single batch can't decide the same item twice ─────────────────────


async def test_m3_duplicate_item_in_batch_rejected(factory):
    founder_id = await _ready_founder(factory, ["linkedin"])
    graph = build_analysis_graph(FakeSocket(), InMemorySaver())
    run_id = await _to_gate2(factory, graph, founder_id)
    async with factory() as session:
        item = (
            await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id))
        ).scalar_one()

    with pytest.raises(ValueError, match="more than once"):
        await lifecycle.mint_gate2_decisions(
            factory,
            run_id,
            [
                {"item_id": str(item.item_id), "action": "reject", "note": "x"},
                {"item_id": str(item.item_id), "action": "approve", "note": None},
            ],
        )
    # nothing minted on the all-or-nothing failure
    async with factory() as session:
        events = (
            (await session.execute(select(ApprovalEventRow).where(ApprovalEventRow.run_id == run_id)))
            .scalars()
            .all()
        )
    assert events == []


# ── M4 / M5 / L1: constraints actually enforced at construction ─────────────


def test_m4_thread_over_cap_rejected():
    with pytest.raises(ValueError, match="max 10"):
        ContentItem(
            run_id=uuid4(),
            platform=Platform.X,
            format=ContentFormat.X_THREAD,
            body="seg 0",
            thread=[f"segment {i}" for i in range(11)],  # 11 > 10
        )


def test_m5_bare_url_in_linkedin_body_rejected():
    with pytest.raises(ValueError, match="links must not appear in body"):
        ContentItem(
            run_id=uuid4(),
            platform=Platform.LINKEDIN,
            format=ContentFormat.LINKEDIN_POST,
            body="Check us out at https://chairobotics.in today!",
        )


def test_m5_url_allowed_in_x_body():
    # X has links_in_body=True — a URL is fine (only cost-flagged downstream)
    item = ContentItem(
        run_id=uuid4(),
        platform=Platform.X,
        format=ContentFormat.X_SINGLE,
        body="Launch day! https://chairobotics.in",
    )
    assert item.platform == Platform.X


def test_l1_too_many_images_rejected():
    media = [
        MediaSpec(
            url=f"https://s/{i}.jpg",
            mime="image/jpeg",
            width=1080,
            height=1080,
            size_bytes=1000,
        )
        for i in range(5)  # X cap is 4
    ]
    with pytest.raises(ValueError, match="max 4"):
        ContentItem(
            run_id=uuid4(),
            platform=Platform.X,
            format=ContentFormat.X_SINGLE,
            body="too many pics",
            media=media,
        )
