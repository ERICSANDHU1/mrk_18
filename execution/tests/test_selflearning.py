"""Slice 3.2 — the self-learning loop under test.

The demo this slice owes: run N+1 PROVABLY learns from run N — the memo built
from measured signals lands in the next run's prompts (analysis, synthesis,
content generation), the injection is audited, and the founder can read
exactly what steers their strategy. Deterministic math, no LLM, no vibes.
"""

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.agents.analysis import run_analysis_agent, run_synthesis
from mrk18_execution.agents.content import generate_item
from mrk18_execution.db.models import (
    AuditRow,
    ContentItemRow,
    FounderProfileRow,
    FounderRow,
    RunRow,
    SignalRow,
)
from mrk18_execution.graph.lifecycle import build_graph_input
from mrk18_execution.llm.socket import AgentRole
from mrk18_execution.monitor.insights import build_performance_memo, memo_as_prompt
from mrk18_execution.schemas.enums import Platform
from tests.authtools import bearer, mint
from tests.test_analysis_graph import FakeSocket

MEMO_MARK = "MEASURED PERFORMANCE OF THIS FOUNDER'S PREVIOUS POSTS"


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


async def seed_measured_founder(factory, *, sub=None):
    """Run N already happened: two posts, measured at two windows each —
    LinkedIn clearly out-earning X."""
    sub = sub or uuid4()
    async with factory() as session:
        founder = FounderRow(email=f"{uuid4().hex[:10]}@learn.test", auth_user_id=sub)
        session.add(founder)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=founder.id,
                status="ready_for_analysis",
                draft={},
                profile={"company_name": "Chai Robotics", "tone": "bold",
                         "target_platforms": ["linkedin", "x"]},
            )
        )
        run = RunRow(run_id=uuid4(), founder_id=founder.id, thread_id=str(uuid4()), status="done")
        session.add(run)
        items = {
            "linkedin": ContentItemRow(
                item_id=uuid4(), run_id=run.run_id, founder_id=founder.id,
                platform="linkedin", format="linkedin_post",
                body="Your CAC is lying to you.\nHere's the math nobody shows.",
                status="exported",
            ),
            "x": ContentItemRow(
                item_id=uuid4(), run_id=run.run_id, founder_id=founder.id,
                platform="x", format="x_thread",
                body="What should founders track first?",
                status="exported",
            ),
        }
        session.add_all(items.values())
        await session.flush()
        # linkedin: strong + measured twice; x: weak
        curves = {
            "linkedin": [("1h", 800, 0.050), ("24h", 2000, 0.062)],
            "x": [("1h", 300, 0.011), ("24h", 600, 0.014)],
        }
        for platform, points in curves.items():
            for window, reach, er in points:
                session.add(
                    SignalRow(
                        founder_id=founder.id, item_id=items[platform].item_id,
                        platform=platform, window_point=window,
                        reach=reach, engagement_rate=er, source="manual",
                    )
                )
        await session.commit()
        return {"sub": sub, "founder_id": founder.id, "run_id": run.run_id}


# ── the memo: numbers become lessons ─────────────────────────────────────────


async def test_memo_math_and_lessons(factory):
    seeded = await seed_measured_founder(factory)
    async with factory() as session:
        memo = await build_performance_memo(session, seeded["founder_id"])
    assert memo["posts_measured"] == 2
    assert memo["platform_summary"]["linkedin"]["avg_engagement_rate"] == 0.062
    assert memo["best"]["platform"] == "linkedin"
    assert memo["best"]["hook"].startswith("Your CAC is lying")
    assert memo["worst"]["platform"] == "x"
    assert memo["median_half_life_hours"] is not None
    # the platform lesson names the winner with real percentages
    assert any("linkedin is out-earning x" in g for g in memo["guidance"])
    assert any("6.2%" in g for g in memo["guidance"])

    rendered = memo_as_prompt(memo)
    assert MEMO_MARK in rendered and "6.2%" in rendered and "front-load" in rendered


async def test_unmeasured_founder_gets_no_fake_lessons(factory):
    async with factory() as session:
        founder = FounderRow(email="fresh@learn.test")
        session.add(founder)
        await session.commit()
        assert await build_performance_memo(session, founder.id) is None


# ── the loop: lessons reach every prompt ─────────────────────────────────────


class CapturingSocket(FakeSocket):
    """The fake brain, but it remembers what it was told."""

    def __init__(self):
        super().__init__()
        self.prompts: list[tuple[str, str, str]] = []  # (role, system, user)

    async def complete(self, role, system, user, schema, max_validation_retries=2):
        self.prompts.append((role.value, system, user))
        return await super().complete(role, system, user, schema, max_validation_retries)


PROFILE = {"company_name": "Chai Robotics", "tone": "bold", "target_platforms": ["linkedin"]}
MEMO_TEXT = f"{MEMO_MARK}:\n- linkedin: avg engagement 6.2%\nLESSONS:\n- front-load the hook"


async def test_analysis_and_synthesis_prompts_carry_the_memo():
    socket = CapturingSocket()
    await run_analysis_agent(
        socket, AgentRole.STRATEGY, PROFILE, [], performance_memo=MEMO_TEXT
    )
    section, _ = await run_analysis_agent(
        socket, AgentRole.MARKET_INTEL, PROFILE, [], performance_memo=MEMO_TEXT
    )
    await run_synthesis(
        socket,
        PROFILE,
        {"market_intel": section.model_dump(), "audience": section.model_dump(),
         "strategy": section.model_dump()},
        [],
        performance_memo=MEMO_TEXT,
    )
    assert len(socket.prompts) == 3
    assert all(MEMO_MARK in user for _, _, user in socket.prompts)
    # and without a memo (fresh founder) prompts stay clean
    socket2 = CapturingSocket()
    await run_analysis_agent(socket2, AgentRole.STRATEGY, PROFILE, [])
    assert MEMO_MARK not in socket2.prompts[0][2]


async def test_content_generation_prompt_carries_the_memo():
    socket = CapturingSocket()
    report = {"content_strategy": {"summary": "own the niche", "claims": []}, "synthesis": "go"}
    await generate_item(
        socket, str(uuid4()), PROFILE, report, Platform.LINKEDIN, performance_memo=MEMO_TEXT
    )
    assert MEMO_MARK in socket.prompts[0][2]


# ── THE DEMO: run N+1 starts from run N's lessons, provably ──────────────────


async def test_next_run_input_contains_lessons_and_is_audited(factory, engine):
    seeded = await seed_measured_founder(factory)
    async with factory() as session:
        next_run = RunRow(
            run_id=uuid4(), founder_id=seeded["founder_id"],
            thread_id=str(uuid4()), status="generating",
        )
        session.add(next_run)
        await session.commit()

    graph_input = await build_graph_input(factory, next_run)
    memo = graph_input["performance_memo"]
    assert memo is not None and MEMO_MARK in memo
    assert "linkedin is out-earning x" in memo  # run N's verdict, in run N+1's brief

    # the injection is evidence, not vibes
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                select(AuditRow).where(AuditRow.outcome == "performance_memo_injected")
            )
        ).all()
    assert len(rows) == 1


async def test_fresh_founder_run_input_has_no_memo(factory):
    async with factory() as session:
        founder = FounderRow(email="nofeedback@learn.test")
        session.add(founder)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=founder.id, status="ready_for_analysis",
                draft={}, profile={"company_name": "X"},
            )
        )
        run = RunRow(
            run_id=uuid4(), founder_id=founder.id, thread_id=str(uuid4()), status="generating"
        )
        session.add(run)
        await session.commit()
    graph_input = await build_graph_input(factory, run)
    assert graph_input["performance_memo"] is None


# ── the founder can see what steers them ─────────────────────────────────────


async def test_insights_endpoint_owner_only(client, factory):
    seeded = await seed_measured_founder(factory)
    headers = bearer(mint(seeded["sub"]))
    fid = seeded["founder_id"]

    resp = await client.get(f"/founders/{fid}/insights", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["insights"]["posts_measured"] == 2
    assert MEMO_MARK in body["prompt_block"]

    # a stranger gets the wall, not the lessons
    stranger = bearer(mint(uuid4()))
    assert (await client.get(f"/founders/{fid}/insights", headers=stranger)).status_code == 403
    # no token → 401
    assert (await client.get(f"/founders/{fid}/insights")).status_code == 401


async def test_insights_endpoint_honest_when_unmeasured(client, factory):
    sub = uuid4()
    async with factory() as session:
        founder = FounderRow(email=f"{uuid4().hex[:8]}@learn.test", auth_user_id=sub)
        session.add(founder)
        await session.commit()
        fid = founder.id
    resp = await client.get(f"/founders/{fid}/insights", headers=bearer(mint(sub)))
    assert resp.status_code == 200
    assert resp.json()["insights"] is None
