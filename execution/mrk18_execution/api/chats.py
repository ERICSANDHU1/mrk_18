"""The founder's saved CMO chats — the Chat tab's session list ("Recents").

One row per conversation; the full message list is stored as JSON and re-saved
each turn. Owner-scoped exactly like the CMO endpoint: ``require_founder`` proves
the ``{founder_id}`` in the path IS the caller, and every query is filtered to
``founder.id``, so a chat can never cross tenants. (The table also carries RLS in
the migration as a second wall and to close the Supabase REST surface.)
"""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import ChatSessionRow, FounderRow
from .deps import founder_scope, get_session

router = APIRouter(tags=["chats"])

_MAX_MESSAGES = 200
_TITLE_MAX = 80


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str = Field(pattern="^(user|cmo)$")
    text: str = Field(min_length=1, max_length=8000)


class ChatCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=_TITLE_MAX)
    messages: list[ChatMessage] = Field(default_factory=list, max_length=_MAX_MESSAGES)


class ChatUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=_TITLE_MAX)
    messages: list[ChatMessage] = Field(max_length=_MAX_MESSAGES)


def _title_from(messages: list[ChatMessage], explicit: str | None) -> str:
    """Name the chat from the first thing the founder said (or an explicit title)."""
    if explicit and explicit.strip():
        return explicit.strip()[:_TITLE_MAX]
    first = next((m.text for m in messages if m.role == "user"), "")
    first = " ".join(first.split())  # collapse newlines / runs of whitespace
    return first[:_TITLE_MAX] or "New chat"


def _summary(row: ChatSessionRow) -> dict:
    return {
        "id": str(row.id),
        "title": row.title,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _full(row: ChatSessionRow) -> dict:
    return {**_summary(row), "messages": row.messages or []}


async def _owned(chat_id: UUID, founder: FounderRow, session: AsyncSession) -> ChatSessionRow:
    """Load a chat and prove the caller owns it (404 otherwise — never leak existence)."""
    row = await session.get(ChatSessionRow, chat_id)
    if row is None or row.founder_id != founder.id:
        raise HTTPException(status_code=404, detail="chat not found")
    return row


@router.get("/founders/{founder_id}/chats", response_model=list[dict])
async def list_chats(
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """The founder's chats, newest-updated first — for the Chat tab's Recents."""
    rows = (
        (
            await session.execute(
                select(ChatSessionRow)
                .where(ChatSessionRow.founder_id == founder.id)
                .order_by(ChatSessionRow.updated_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return [_summary(r) for r in rows]


@router.post("/founders/{founder_id}/chats", response_model=dict, status_code=201)
async def create_chat(
    body: ChatCreate,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Start a new chat — titled from the first message."""
    row = ChatSessionRow(
        id=uuid4(),
        founder_id=founder.id,
        title=_title_from(body.messages, body.title),
        messages=[m.model_dump() for m in body.messages],
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _full(row)


@router.get("/founders/{founder_id}/chats/{chat_id}", response_model=dict)
async def get_chat(
    chat_id: UUID,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return _full(await _owned(chat_id, founder, session))


@router.put("/founders/{founder_id}/chats/{chat_id}", response_model=dict)
async def update_chat(
    chat_id: UUID,
    body: ChatUpdate,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Save the running transcript (called each turn)."""
    row = await _owned(chat_id, founder, session)
    row.messages = [m.model_dump() for m in body.messages]
    if body.title and body.title.strip():
        row.title = body.title.strip()[:_TITLE_MAX]
    elif not row.title or row.title == "New chat":
        row.title = _title_from(body.messages, None)
    await session.commit()
    await session.refresh(row)
    return _summary(row)


@router.delete("/founders/{founder_id}/chats/{chat_id}", status_code=204)
async def delete_chat(
    chat_id: UUID,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.delete(await _owned(chat_id, founder, session))
    await session.commit()
