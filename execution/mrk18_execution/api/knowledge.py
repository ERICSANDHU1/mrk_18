"""Slice 3.3 — Company Brain endpoints.

The founder feeds their Brain (docs, site copy, notes), sees exactly what it
holds, searches it, and can make it forget a source. Owner-JWT + tenant scope
on everything; unconfigured embeddings answer 503 (fail closed — the Brain
never pretends to remember what it couldn't embed).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit.recorder import record
from ..config import get_settings
from ..db.models import FounderRow
from ..llm.embeddings import EmbeddingError
from ..rag.store import AGENT, CorpusFull, forget_source, ingest, list_sources, retrieve
from ..schemas.enums import AuditEventType
from .deps import founder_scope, get_session

router = APIRouter(tags=["knowledge"])


def _engine_or_503(request: Request):
    engine = getattr(request.app.state, "embedding_engine", None)
    if engine is None:
        raise HTTPException(
            status_code=503,
            detail="embeddings not configured (CF_ACCOUNT_ID / CF_API_TOKEN — free tier)",
        )
    return engine


class IngestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str = Field(min_length=2, max_length=200)  # doc:pitch | url:site | note:q3
    text: str = Field(min_length=1, max_length=400_000)


class SearchBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=2, max_length=1000)
    k: int = Field(default=6, ge=1, le=20)


@router.post("/founders/{founder_id}/knowledge", response_model=dict)
async def ingest_knowledge(
    founder_id: UUID,
    body: IngestBody,
    request: Request,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    engine = _engine_or_503(request)
    try:
        result = await ingest(
            session,
            founder_id=founder.id,
            source=body.source,
            text=body.text,
            engine=engine,
            max_chunks=get_settings().knowledge_max_chunks,
        )
    except CorpusFull as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except EmbeddingError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    await record(
        session,
        event_type=AuditEventType.AGENT_ACTION,
        agent_id=AGENT,
        founder_id=founder.id,
        outcome="knowledge_ingested",
        detail=result,
    )
    await session.commit()
    return result


@router.get("/founders/{founder_id}/knowledge", response_model=list[dict])
async def knowledge_sources(
    founder_id: UUID,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    return await list_sources(session, founder.id)


@router.delete("/founders/{founder_id}/knowledge", response_model=dict)
async def forget_knowledge(
    founder_id: UUID,
    source: str,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    deleted = await forget_source(session, founder.id, source)
    if not deleted:
        raise HTTPException(status_code=404, detail="no such source in your knowledge base")
    await record(
        session,
        event_type=AuditEventType.AGENT_ACTION,
        agent_id=AGENT,
        founder_id=founder.id,
        outcome="knowledge_forgotten",
        detail={"source": source, "chunks_deleted": deleted},
    )
    await session.commit()
    return {"source": source, "chunks_deleted": deleted}


@router.post("/founders/{founder_id}/knowledge/search", response_model=list[dict])
async def search_knowledge(
    founder_id: UUID,
    body: SearchBody,
    request: Request,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Transparency: the founder can run the same retrieval the agents get."""
    engine = _engine_or_503(request)
    try:
        return await retrieve(
            session, founder_id=founder.id, query=body.query, engine=engine, k=body.k
        )
    except EmbeddingError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
