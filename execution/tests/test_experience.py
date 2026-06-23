"""The shared Experience Brain (RAG Tier 1/2): ingest cases as one-chunk-each,
retrieve by cosine, soft category filter, idempotent re-seed, prompt render."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import ExperienceChunkRow
from mrk18_execution.llm.embeddings import StubEmbeddingEngine
from mrk18_execution.rag.experience import (
    experience_as_prompt,
    experience_size,
    ingest_case,
    retrieve_experience,
)

ENGINE = StubEmbeddingEngine()

CASE_SKINCARE = {
    "ref": "case_0001",
    "kind": "campaign_case",
    "category": "D2C skincare",
    "channels": ["Meta ads", "WhatsApp"],
    "title": "Skincare ROAS fell — retention was the disease",
    "content": "A skincare brand's Meta ROAS halved; the durable fix was a WhatsApp reorder flow that lifted repeat rate.",
    "lesson": "Falling ROAS is the symptom; weak retention is the disease.",
    "metrics": {"cac_after": 520},
    "provenance": "reconstructed",
}
CASE_SAAS = {
    "ref": "case_0002",
    "kind": "campaign_case",
    "category": "B2B SaaS",
    "title": "B2B SaaS pipeline from founder LinkedIn, not paid",
    "content": "An Indian B2B SaaS founder got demos from founder-led LinkedIn proof content and DMs, zero ad spend.",
    "lesson": "Founder proof content beats paid lead-gen for long-cycle B2B.",
}


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


async def test_ingest_and_retrieve(factory):
    async with factory() as s:
        await ingest_case(s, case=CASE_SKINCARE, engine=ENGINE)
        await ingest_case(s, case=CASE_SAAS, engine=ENGINE)
        await s.commit()
        assert await experience_size(s) == 2
        hits = await retrieve_experience(s, query="skincare roas dropping on meta", engine=ENGINE, k=5)
        assert len(hits) == 2
        assert all({"ref", "title", "content", "score"} <= set(h) for h in hits)


async def test_category_soft_filter_narrows_to_relevant(factory):
    async with factory() as s:
        await ingest_case(s, case=CASE_SKINCARE, engine=ENGINE)
        await ingest_case(s, case=CASE_SAAS, engine=ENGINE)
        await s.commit()
        hits = await retrieve_experience(s, query="anything", engine=ENGINE, k=5, category="skincare")
        assert {h["ref"] for h in hits} == {"case_0001"}  # only the skincare case


async def test_reseed_is_idempotent(factory):
    async with factory() as s:
        await ingest_case(s, case=CASE_SKINCARE, engine=ENGINE)
        await ingest_case(s, case={**CASE_SKINCARE, "title": "updated title"}, engine=ENGINE)
        await s.commit()
        assert await experience_size(s) == 1  # replaced by ref, not duplicated
        row = (await s.execute(select(ExperienceChunkRow))).scalars().one()
        assert row.title == "updated title"


async def test_ingest_requires_ref_and_content(factory):
    async with factory() as s:
        with pytest.raises(ValueError):
            await ingest_case(s, case={"content": "no ref"}, engine=ENGINE)
        with pytest.raises(ValueError):
            await ingest_case(s, case={"ref": "x", "content": "   "}, engine=ENGINE)


async def test_empty_corpus_returns_no_hits(factory):
    async with factory() as s:
        assert await retrieve_experience(s, query="q", engine=ENGINE, k=5) == []


def test_prompt_render():
    block = experience_as_prompt(
        [{"ref": "case_0001", "title": "T", "category": "D2C skincare", "content": "narrative", "lesson": "the lesson"}]
    )
    assert "RELEVANT REAL CAMPAIGN CASES" in block
    assert "narrative" in block and "the lesson" in block
    assert experience_as_prompt([]) == ""
