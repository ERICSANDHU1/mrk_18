"""Slice 1.4 — content generation + photo funnel (fake brain, fake renderer).

What's proven here: platform rules enforced at creation, the rule-violation
retry loop, per-platform fan-out, media only for image formats, items
persisted as draft rows, the image counter.
"""

from uuid import uuid4

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.agents.content import DraftCopy, generate_item
from mrk18_execution.db.models import ContentItemRow, FounderProfileRow, FounderRow, RunRow
from mrk18_execution.graph import lifecycle
from mrk18_execution.graph.analysis import build_analysis_graph
from mrk18_execution.llm.socket import Usage
from mrk18_execution.schemas.enums import Platform

from .test_analysis_graph import FakeSocket  # reuse the fake brain


class FakeImageEngine:
    name = "fake/engine"
    calls = 0

    async def generate(self, prompt: str, width: int, height: int) -> bytes:
        # a real tiny JPEG so Pillow can process it
        import io

        from PIL import Image

        FakeImageEngine.calls += 1
        buf = io.BytesIO()
        Image.new("RGB", (64, 64), (200, 40, 40)).save(buf, format="JPEG")
        return buf.getvalue()


class FakeStore:
    def __init__(self):
        self.saved: dict[str, bytes] = {}

    async def save(self, path: str, jpeg_bytes: bytes) -> str:
        self.saved[path] = jpeg_bytes
        return f"https://fake.storage/media/{path}"


@pytest.fixture
async def ctx(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        founder = FounderRow(email="content@test.in")
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
                    "tone": "bold, desi",
                    "target_platforms": ["linkedin", "x", "instagram"],
                },
            )
        )
        await session.commit()
        founder_id = founder.id
    socket = FakeSocket()
    store = FakeStore()
    graph = build_analysis_graph(
        socket, InMemorySaver(), image_engine=FakeImageEngine(), media_store=store
    )
    return factory, graph, socket, store, founder_id


async def run_to_done(factory, graph, founder_id):
    run = await lifecycle.start_run(factory, founder_id)
    await lifecycle.execute_run(graph, factory, run)
    await lifecycle.resume_gate1(graph, factory, run.run_id, {"action": "approve"})
    # approve everything at gate 2 (per item — no bulk exists)
    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    if row.status == "awaiting_gate2":
        decisions = [
            {"item_id": it["item_id"], "action": "approve", "note": None}
            for it in row.gate2["payload"]["items"]
        ]
        await lifecycle.resume_gate2(graph, factory, run.run_id, decisions)
    return run.run_id


async def test_items_generated_per_platform_and_persisted(ctx):
    factory, graph, socket, store, founder_id = ctx
    run_id = await run_to_done(factory, graph, founder_id)

    async with factory() as session:
        rows = (
            (await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id)))
            .scalars()
            .all()
        )
    assert {r.platform for r in rows} == {"linkedin", "x", "instagram"}
    by_platform = {r.platform: r for r in rows}

    # X: thread format, every segment <= 280, NO media (text-first pilot rule)
    x = by_platform["x"]
    assert x.format == "x_thread"
    assert len(x.thread) >= 2 and all(len(s) <= 280 for s in x.thread)
    assert x.media == []

    # LinkedIn + Instagram: exactly one JPEG each, stored not inlined
    for p in ("linkedin", "instagram"):
        media = by_platform[p].media
        assert len(media) == 1
        assert media[0]["mime"] == "image/jpeg"
        assert media[0]["url"].startswith("https://fake.storage/")
        assert media[0]["width"] == 1080 and media[0]["height"] == 1080

    # approved at gate 2 (per-item decisions in run_to_done)
    assert all(r.status == "approved" for r in rows)


async def test_image_counter_on_run(ctx):
    factory, graph, socket, store, founder_id = ctx
    run_id = await run_to_done(factory, graph, founder_id)
    async with factory() as session:
        run = await session.get(RunRow, run_id)
    assert run.images_generated == 2  # linkedin + instagram, not x


async def test_rule_violation_retry_loop():
    """First draft breaks the 280-char X rule → agent feeds the violation back
    and the second draft passes."""

    class ViolatingThenValidSocket:
        def __init__(self):
            self.calls = 0

        async def complete(self, role, system, user, schema, max_validation_retries=2):
            assert schema is DraftCopy
            self.calls += 1
            usage = Usage("content", "openai/gpt-oss-120b", 500, 200)
            if self.calls == 1:
                return (
                    DraftCopy(
                        body="x" * 300,  # violates X 280-char rule
                        thread=["x" * 300, "ok segment"],
                        image_prompt="some valid image prompt here",
                    ),
                    usage,
                )
            assert "broke these platform rules" in user  # violation was fed back
            return (
                DraftCopy(
                    body="Hook segment, short and sharp. #chai",
                    thread=["Hook segment, short and sharp. #chai", "Second segment."],
                    image_prompt="some valid image prompt here",
                ),
                usage,
            )

    socket = ViolatingThenValidSocket()
    item, usages = await generate_item(
        socket, str(uuid4()), {"tone": "bold"}, {"content_strategy": {}}, Platform.X
    )
    assert socket.calls == 2
    assert len(usages) == 2  # both attempts metered
    assert all(len(s) <= 280 for s in item.thread)


async def test_no_platforms_means_no_items(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        founder = FounderRow(email="noplatform@test.in")
        session.add(founder)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=founder.id,
                status="ready_for_analysis",
                draft={},
                profile={"company_name": "X", "target_platforms": []},
            )
        )
        await session.commit()
        fid = founder.id
    socket = FakeSocket()
    graph = build_analysis_graph(socket, InMemorySaver())
    run_id = await run_to_done(factory, graph, fid)
    async with factory() as session:
        rows = (
            (await session.execute(select(ContentItemRow).where(ContentItemRow.run_id == run_id)))
            .scalars()
            .all()
        )
    assert rows == []
    assert socket.calls["content"] == 0
