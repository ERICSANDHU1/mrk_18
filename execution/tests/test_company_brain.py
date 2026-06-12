"""Slice 3.3 — the Company Brain under test (free-tier edition).

The attack that matters most here: founder B's knowledge must NEVER surface
in founder A's retrieval — a knowledge leak would put one company's strategy
inside another company's posts. Also: the MVP cap refuses honestly,
re-ingestion replaces (no zombie versions), and retrieved knowledge provably
lands in the next run's prompts.
"""

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import FounderProfileRow, FounderRow, KnowledgeChunkRow, RunRow
from mrk18_execution.graph.lifecycle import build_graph_input
from mrk18_execution.llm.embeddings import StubEmbeddingEngine, cosine
from mrk18_execution.rag.store import (
    CorpusFull,
    chunk_text,
    ingest,
    knowledge_as_prompt,
    retrieve,
)
from mrk18_execution.security.manifests import PermissionViolation, require_permission
from tests.authtools import bearer, mint

ENGINE = StubEmbeddingEngine()

CHAI_DOC = (
    "Chai Robotics sells robotic chai vending machines to Indian tech parks. "
    "Pricing: 30000 INR monthly rental including maintenance and masala chai pods. "
    "Best customers are facility managers at 200-seat offices in Bengaluru and Pune."
)
FINTECH_DOC = (
    "PayWave processes UPI settlements for kirana stores. Compliance follows "
    "RBI guidelines on payment aggregators. Revenue model is 0.4% per settlement."
)


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def brain_client(engine):
    """An app whose embedding engine is the deterministic stub."""
    from httpx import ASGITransport, AsyncClient

    from mrk18_execution.api.app import create_app
    from tests.authtools import install_auth

    app = create_app(engine=engine)
    install_auth(app)
    app.state.embedding_engine = ENGINE
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c, app


async def make_founder(factory, *, sub=None, email=None):
    sub = sub or uuid4()
    async with factory() as session:
        founder = FounderRow(email=email or f"{uuid4().hex[:10]}@brain.test", auth_user_id=sub)
        session.add(founder)
        await session.commit()
        return founder.id, sub


# ── chunking + embedding basics ──────────────────────────────────────────────


def test_chunking_splits_with_overlap():
    text = ("Para one about chai economics.\n\n" * 40) + "Final para."
    chunks = chunk_text(text, max_chars=300, overlap=60)
    assert len(chunks) > 2
    assert all(len(c) <= 300 for c in chunks)
    assert chunk_text("short note") == ["short note"]
    assert chunk_text("   ") == []


async def test_stub_embeddings_are_deterministic_and_topical():
    a1, a2, b = await ENGINE.embed(["chai pricing in tech parks", "chai machine pricing", "RBI fintech compliance"])
    assert a1 == (await ENGINE.embed(["chai pricing in tech parks"]))[0]
    assert cosine(a1, a2) > cosine(a1, b)  # related texts sit closer


# ── store: ingest, replace, cap, forget ──────────────────────────────────────


async def test_ingest_and_reingest_replaces(factory):
    fid, _ = await make_founder(factory)
    async with factory() as session:
        first = await ingest(
            session, founder_id=fid, source="doc:pitch", text=CHAI_DOC, engine=ENGINE
        )
        await session.commit()
    assert first["chunks"] >= 1
    async with factory() as session:  # re-ingest same source: replace, not append
        await ingest(
            session, founder_id=fid, source="doc:pitch", text="Updated pitch.", engine=ENGINE
        )
        await session.commit()
        rows = (
            (await session.execute(select(KnowledgeChunkRow))).scalars().all()
        )
    assert len(rows) == 1 and rows[0].content == "Updated pitch."


async def test_corpus_cap_refuses_honestly(factory):
    fid, _ = await make_founder(factory)
    async with factory() as session:
        await ingest(
            session, founder_id=fid, source="doc:a", text=CHAI_DOC, engine=ENGINE, max_chunks=1
        )
        with pytest.raises(CorpusFull, match="free-tier budget"):
            await ingest(
                session,
                founder_id=fid,
                source="doc:b",
                text=FINTECH_DOC,
                engine=ENGINE,
                max_chunks=1,
            )


# ── THE ATTACK: cross-tenant knowledge leak ──────────────────────────────────


async def test_retrieval_never_crosses_tenants(factory):
    fid_a, _ = await make_founder(factory)
    fid_b, _ = await make_founder(factory)
    async with factory() as session:
        await ingest(session, founder_id=fid_a, source="doc:chai", text=CHAI_DOC, engine=ENGINE)
        await ingest(
            session, founder_id=fid_b, source="doc:fintech", text=FINTECH_DOC, engine=ENGINE
        )
        await session.commit()

    async with factory() as session:
        # A asks about B's specialty — gets only A's own chunks, never B's
        hits = await retrieve(
            session, founder_id=fid_a, query="RBI compliance UPI settlements", engine=ENGINE
        )
        assert hits, "A still has a corpus — retrieval shouldn't be empty"
        assert all("PayWave" not in h["content"] for h in hits)
        assert all(h["source"] == "doc:chai" for h in hits)
        # and a founder with no corpus gets [] — never someone else's facts
        fid_c, _ = await make_founder(factory)
        assert await retrieve(session, founder_id=fid_c, query="chai", engine=ENGINE) == []


async def test_relevant_chunk_ranks_first(factory):
    fid, _ = await make_founder(factory)
    async with factory() as session:
        await ingest(session, founder_id=fid, source="doc:pitch", text=CHAI_DOC, engine=ENGINE)
        await ingest(
            session,
            founder_id=fid,
            source="note:hr",
            text="Hiring two interns for the Pune office canteen project.",
            engine=ENGINE,
        )
        await session.commit()
        hits = await retrieve(
            session, founder_id=fid, query="chai machine rental pricing", engine=ENGINE, k=2
        )
    assert "30000 INR" in hits[0]["content"]  # pricing chunk wins


# ── the run is grounded: knowledge reaches the prompts ───────────────────────


async def test_run_input_contains_retrieved_knowledge(factory):
    fid, _ = await make_founder(factory)
    async with factory() as session:
        session.add(
            FounderProfileRow(
                founder_id=fid,
                status="ready_for_analysis",
                draft={},
                profile={
                    "company_name": "Chai Robotics",
                    "product_description": "robotic chai vending machines",
                    "icp": "facility managers",
                    "primary_goal": "signups",
                },
            )
        )
        run = RunRow(run_id=uuid4(), founder_id=fid, thread_id=str(uuid4()), status="generating")
        session.add(run)
        await ingest(session, founder_id=fid, source="doc:pitch", text=CHAI_DOC, engine=ENGINE)
        await session.commit()

    graph_input = await build_graph_input(factory, run, embedding_engine=ENGINE)
    knowledge = graph_input["company_knowledge"]
    assert knowledge is not None
    assert "FOUNDER'S OWN KNOWLEDGE BASE" in knowledge
    assert "30000 INR" in knowledge  # their real pricing, grounding the agents

    # no engine → run proceeds ungrounded, never blocked
    ungrounded = await build_graph_input(factory, run, embedding_engine=None)
    assert ungrounded["company_knowledge"] is None


def test_knowledge_prompt_block_renders():
    block = knowledge_as_prompt([{"content": "Pricing is 30000 INR.", "source": "doc:pitch"}])
    assert "[doc:pitch]" in block and "30000 INR" in block and "never contradict" in block


# ── API: the founder feeds and reads their own brain only ────────────────────


async def test_knowledge_api_owner_flow(brain_client, factory):
    client, _app = brain_client
    fid, sub = await make_founder(factory)
    headers = bearer(mint(sub))

    up = await client.post(
        f"/founders/{fid}/knowledge",
        json={"source": "doc:pitch", "text": CHAI_DOC},
        headers=headers,
    )
    assert up.status_code == 200, up.text
    assert up.json()["chunks"] >= 1

    listing = await client.get(f"/founders/{fid}/knowledge", headers=headers)
    assert listing.status_code == 200
    assert listing.json()[0]["source"] == "doc:pitch"

    found = await client.post(
        f"/founders/{fid}/knowledge/search",
        json={"query": "chai pricing"},
        headers=headers,
    )
    assert found.status_code == 200 and "30000 INR" in found.json()[0]["content"]

    gone = await client.delete(
        f"/founders/{fid}/knowledge?source=doc:pitch", headers=headers
    )
    assert gone.status_code == 200 and gone.json()["chunks_deleted"] >= 1
    assert (await client.get(f"/founders/{fid}/knowledge", headers=headers)).json() == []


async def test_knowledge_api_walls_and_failclosed(brain_client, factory):
    client, app = brain_client
    fid, sub = await make_founder(factory)
    stranger = bearer(mint(uuid4()))
    body = {"source": "doc:x", "text": "secrets"}
    assert (
        await client.post(f"/founders/{fid}/knowledge", json=body, headers=stranger)
    ).status_code == 403
    assert (await client.post(f"/founders/{fid}/knowledge", json=body)).status_code == 401
    # unconfigured embeddings → 503, never a silent no-op
    app.state.embedding_engine = None
    assert (
        await client.post(f"/founders/{fid}/knowledge", json=body, headers=bearer(mint(sub)))
    ).status_code == 503


# ── sandbox ──────────────────────────────────────────────────────────────────


def test_company_brain_manifest_is_knowledge_only():
    require_permission("agent:company_brain", "knowledge:read")
    require_permission("agent:company_brain", "knowledge:write")
    with pytest.raises(PermissionViolation):
        require_permission("agent:company_brain", "publish:linkedin")
    with pytest.raises(PermissionViolation):
        require_permission("agent:company_brain", "llm:complete")
