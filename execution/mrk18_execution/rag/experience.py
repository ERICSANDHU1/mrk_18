"""The shared 'Experience Brain' — RAG Tier 1/2 (case studies + benchmarks).

Unlike the Company Brain (rag/store.py, the founder's OWN docs, tenant-scoped),
this is SHARED experience every founder's analysis draws from: real/reconstructed
Indian campaign cases with outcomes + lessons. Seeded by an operator script
(scripts/seed_experience.py), read-only at run time.

One case = one chunk (the roadmap rule). Same BGE-M3 embedding + JSON column +
exact cosine as the Company Brain — at Tier-1 scale brute force has perfect recall
for ₹0. Retrieval is cosine over the whole corpus; category metadata is stored for
future filtering / the Qdrant+rerank upgrade.
"""

import logging

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import ExperienceChunkRow
from ..llm.embeddings import EmbeddingEngine, cosine

log = logging.getLogger("mrk18.experience")


async def experience_size(session: AsyncSession) -> int:
    return (
        await session.execute(select(func.count()).select_from(ExperienceChunkRow))
    ).scalar_one()


async def ingest_case(session: AsyncSession, *, case: dict, engine: EmbeddingEngine) -> dict:
    """Ingest ONE case as ONE chunk. Idempotent by `ref` (re-seeding replaces)."""
    ref = (case.get("ref") or "").strip()
    if not ref:
        raise ValueError("experience case needs a 'ref' (e.g. 'case_0042')")
    content = (case.get("content") or "").strip()
    if not content:
        raise ValueError(f"{ref}: empty 'content' — nothing to embed")

    # Embed title + narrative + lesson together for a richer retrieval vector.
    embed_text = "\n".join(
        p for p in (case.get("title"), content, case.get("lesson")) if p
    )
    vector = (await engine.embed([embed_text]))[0]

    # idempotent re-seed: the old version of this ref dies first
    await session.execute(delete(ExperienceChunkRow).where(ExperienceChunkRow.ref == ref))
    session.add(
        ExperienceChunkRow(
            ref=ref,
            kind=case.get("kind", "campaign_case"),
            category=case.get("category"),
            stage=case.get("stage"),
            budget_band=case.get("budget_band"),
            channels=case.get("channels"),
            title=(case.get("title") or ref)[:300],
            content=content,
            lesson=case.get("lesson"),
            metrics=case.get("metrics"),
            provenance=case.get("provenance"),
            embedding=vector,
            embedding_model=engine.name,
        )
    )
    return {"ref": ref, "title": case.get("title") or ref}


async def retrieve_experience(
    session: AsyncSession,
    *,
    query: str,
    engine: EmbeddingEngine,
    k: int = 5,
    category: str | None = None,
) -> list[dict]:
    """Top-k cases by exact cosine. `category` is an optional SOFT filter — used
    only when it actually narrows the corpus (a skincare founder gets skincare
    cases); otherwise we rank the whole corpus, since the embedding already
    captures relevance at Tier-1 scale."""
    rows = (await session.execute(select(ExperienceChunkRow))).scalars().all()
    if not rows:
        return []
    if category:
        cat = category.strip().lower()
        narrowed = [r for r in rows if r.category and cat in r.category.lower()]
        if narrowed:
            rows = narrowed

    query_vec = (await engine.embed([query]))[0]
    scored = sorted(
        (
            {
                "ref": r.ref,
                "title": r.title,
                "category": r.category,
                "content": r.content,
                "lesson": r.lesson,
                "score": round(cosine(query_vec, r.embedding), 4),
            }
            for r in rows
        ),
        key=lambda c: c["score"],
        reverse=True,
    )
    return scored[:k]


def experience_as_prompt(cases: list[dict]) -> str:
    """Render retrieved cases as the prompt block the analysis agents receive."""
    if not cases:
        return ""
    blocks: list[str] = []
    for c in cases:
        head = c["title"] + (f" ({c['category']})" if c.get("category") else "")
        body = c["content"]
        if c.get("lesson"):
            body += f"\nLesson: {c['lesson']}"
        blocks.append(f"• {head}\n{body}")
    return (
        "RELEVANT REAL CAMPAIGN CASES (MRK18's experience base — real/reconstructed "
        "Indian marketing situations WITH outcomes; cite as source 'experience'). "
        "Reason FROM these the way a CMO who has lived them would. Do NOT copy a "
        "case's specific numbers into the founder's content as if they were the "
        "founder's own — the cases are precedent, not the founder's data.\n\n"
        + "\n\n".join(blocks)
    )
