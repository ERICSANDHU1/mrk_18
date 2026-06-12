"""Slice 3.3 — the Company Brain's store: ingest, retrieve, forget.

Free-tier discipline throughout: a hard per-founder chunk cap (refused
honestly when full), re-ingesting a source REPLACES it (no zombie versions),
and retrieval is exact cosine over the founder's OWN chunks only — the
founder filter sits in the SQL itself, beneath any prompt-level mistake, and
RLS sits beneath that.

Sandbox: the Brain acts as `agent:company_brain` — knowledge in, knowledge
out, nothing else. It cannot publish, cannot call the chat LLM.
"""

import logging
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import KnowledgeChunkRow
from ..llm.embeddings import EmbeddingEngine, cosine
from ..security.manifests import require_permission

log = logging.getLogger("mrk18.brain")

AGENT = "agent:company_brain"

DEFAULT_MAX_CHUNKS = 1500  # the free-tier MVP cap (config: knowledge_max_chunks)
CHUNK_CHARS = 1200
CHUNK_OVERLAP = 150


class CorpusFull(Exception):
    """The founder's MVP knowledge budget is spent — honest refusal."""


def chunk_text(text: str, max_chars: int = CHUNK_CHARS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Paragraph-aware splitting with overlap, so a sentence cut at a boundary
    still appears whole in one of its neighbours."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):  # prefer breaking at a paragraph/sentence seam
            for seam in ("\n\n", "\n", ". "):
                cut = text.rfind(seam, start + max_chars // 2, end)
                if cut != -1:
                    end = cut + len(seam)
                    break
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if c]


async def corpus_size(session: AsyncSession, founder_id: UUID) -> int:
    return (
        await session.execute(
            select(func.count())
            .select_from(KnowledgeChunkRow)
            .where(KnowledgeChunkRow.founder_id == founder_id)
        )
    ).scalar_one()


async def ingest(
    session: AsyncSession,
    *,
    founder_id: UUID,
    source: str,
    text: str,
    engine: EmbeddingEngine,
    max_chunks: int = DEFAULT_MAX_CHUNKS,
) -> dict:
    """Chunk → embed → store. Re-ingesting a source replaces it entirely."""
    require_permission(AGENT, "knowledge:write")
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("nothing to ingest — the text is empty")

    # replace-not-append: the old version of this source dies first
    await session.execute(
        delete(KnowledgeChunkRow).where(
            KnowledgeChunkRow.founder_id == founder_id,
            KnowledgeChunkRow.source == source,
        )
    )
    existing = await corpus_size(session, founder_id)
    if existing + len(chunks) > max_chunks:
        raise CorpusFull(
            f"corpus cap reached: {existing} stored + {len(chunks)} new > {max_chunks} "
            "(MVP free-tier budget) — delete a source or raise the cap with the Pro plan"
        )

    vectors = await engine.embed(chunks)
    for seq, (content, vector) in enumerate(zip(chunks, vectors)):
        session.add(
            KnowledgeChunkRow(
                founder_id=founder_id,
                source=source,
                seq=seq,
                content=content,
                embedding=vector,
                embedding_model=engine.name,
            )
        )
    return {"source": source, "chunks": len(chunks), "corpus_total": existing + len(chunks)}


async def forget_source(session: AsyncSession, founder_id: UUID, source: str) -> int:
    require_permission(AGENT, "knowledge:write")
    result = await session.execute(
        delete(KnowledgeChunkRow).where(
            KnowledgeChunkRow.founder_id == founder_id,
            KnowledgeChunkRow.source == source,
        )
    )
    return result.rowcount or 0


async def list_sources(session: AsyncSession, founder_id: UUID) -> list[dict]:
    require_permission(AGENT, "knowledge:read")
    rows = (
        await session.execute(
            select(
                KnowledgeChunkRow.source,
                func.count().label("chunks"),
                func.max(KnowledgeChunkRow.created_at).label("updated"),
            )
            .where(KnowledgeChunkRow.founder_id == founder_id)
            .group_by(KnowledgeChunkRow.source)
            .order_by(KnowledgeChunkRow.source)
        )
    ).all()
    return [
        {"source": source, "chunks": chunks, "updated": str(updated)}
        for source, chunks, updated in rows
    ]


async def retrieve(
    session: AsyncSession,
    *,
    founder_id: UUID,
    query: str,
    engine: EmbeddingEngine,
    k: int = 6,
) -> list[dict]:
    """Top-k of the founder's own chunks by exact cosine. The founder_id WHERE
    clause is the tenant wall at the data layer; RLS enforces it again below."""
    require_permission(AGENT, "knowledge:read")
    rows = (
        (
            await session.execute(
                select(KnowledgeChunkRow).where(
                    KnowledgeChunkRow.founder_id == founder_id
                )
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return []
    query_vec = (await engine.embed([query]))[0]
    scored = sorted(
        (
            {
                "content": row.content,
                "source": row.source,
                "score": round(cosine(query_vec, row.embedding), 4),
            }
            for row in rows
        ),
        key=lambda c: c["score"],
        reverse=True,
    )
    return scored[:k]


def knowledge_as_prompt(chunks: list[dict]) -> str:
    """Render retrieved chunks as the prompt block agents receive."""
    body = "\n\n".join(
        f"[{c['source']}] {c['content']}" for c in chunks
    )
    return (
        "THE FOUNDER'S OWN KNOWLEDGE BASE (their documents and accumulated "
        "insights — treat as source 'intake:knowledge', confidence high):\n"
        f"{body}\n"
        "Ground your claims in this when relevant; never contradict it silently."
    )
