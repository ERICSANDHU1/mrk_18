"""Slice 3.4 — Comment Agent endpoints.

A comment comes in (founder pastes one, or a source pulls it); the agent
scores it and drafts a reply; the founder approves / edits / rejects / ignores
at the gate. NOTHING is ever sent to a platform without that approval.

Sentiment is free and deterministic, so comments are always recorded and
scored. Drafting needs the LLM socket — unconfigured → the comment is still
captured, the draft is simply absent (honest 503 only on explicit redraft).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.comment import draft_reply
from ..audit.recorder import record
from ..db.models import ContentItemRow, FounderProfileRow, PostCommentRow
from ..monitor.comments import (
    AGENT,
    apply_comment_sentiment_to_signals,
    decide_reply,
    list_comments,
    record_comment,
    set_reply_draft,
)
from ..schemas.enums import AuditEventType
from ..security.tenant import apply_tenant_scope, tenant_session
from .deps import current_founder, get_session, record_denial
from .runs import _require_maintenance_key

router = APIRouter(tags=["comments"])


class CommentEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=4000)
    author_handle: str | None = Field(default=None, max_length=120)


class ReplyDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str = Field(pattern="^(approve|edit|reject|ignore)$")
    text: str | None = Field(default=None, max_length=600)  # for edit
    note: str | None = Field(default=None, max_length=600)  # for reject → redraft


async def _owned_item(session: AsyncSession, item_id: UUID, founder, request: Request):
    item = await session.get(ContentItemRow, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="content item not found")
    if item.founder_id != founder.id:
        await record_denial(session, request, founder.id)
        raise HTTPException(status_code=403, detail="you can only manage your own posts")
    return item


async def _profile(session: AsyncSession, founder_id: UUID) -> dict:
    row = await session.get(FounderProfileRow, founder_id)
    return (row.profile if row and row.profile else None) or (row.draft if row else {}) or {}


@router.post("/items/{item_id}/comments", response_model=dict)
async def ingest_comment(
    item_id: UUID,
    body: CommentEntry,
    request: Request,
    founder=Depends(current_founder),
    session: AsyncSession = Depends(get_session),
) -> dict:
    item = await _owned_item(session, item_id, founder, request)
    await apply_tenant_scope(session, founder.id)

    comment, created = await record_comment(
        session,
        founder_id=founder.id,
        item_id=item_id,
        platform=item.platform,
        external_id=body.external_id,
        text=body.text,
        author_handle=body.author_handle,
    )
    # draft a reply if the model is available — sentiment was scored regardless
    socket = getattr(request.app.state, "llm_socket", None)
    if created and socket is not None:
        try:
            draft, _usage = await draft_reply(
                socket,
                profile=await _profile(session, founder.id),
                platform=item.platform,
                post_excerpt=item.body,
                comment_text=body.text,
            )
            await set_reply_draft(session, comment, draft.reply)
        except Exception:  # noqa: BLE001 — drafting must never lose the comment
            pass
    await apply_comment_sentiment_to_signals(session, founder_id=founder.id, item_id=item_id)
    await record(
        session,
        event_type=AuditEventType.AGENT_ACTION,
        agent_id=AGENT,
        founder_id=founder.id,
        outcome="comment_ingested" if created else "comment_seen_again",
        detail={"item_id": str(item_id), "sentiment": float(comment.sentiment or 0)},
    )
    await session.commit()
    return {
        "comment_id": str(comment.comment_id),
        "sentiment": float(comment.sentiment) if comment.sentiment is not None else None,
        "reply_draft": comment.reply_draft,
        "reply_status": comment.reply_status,
        "created": created,
    }


@router.get("/items/{item_id}/comments", response_model=list[dict])
async def get_comments(
    item_id: UUID,
    request: Request,
    founder=Depends(current_founder),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    await _owned_item(session, item_id, founder, request)
    await apply_tenant_scope(session, founder.id)
    return await list_comments(session, item_id)


@router.post("/comments/{comment_id}/reply", response_model=dict)
async def decide_comment_reply(
    comment_id: UUID,
    body: ReplyDecision,
    request: Request,
    founder=Depends(current_founder),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """The reply gate — approve / edit / reject(→redraft) / ignore. The only
    path by which a drafted reply ever reaches a platform."""
    comment = await session.get(PostCommentRow, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="comment not found")
    if comment.founder_id != founder.id:
        await record_denial(session, request, founder.id)
        raise HTTPException(status_code=403, detail="you can only reply to your own comments")
    await apply_tenant_scope(session, founder.id)

    try:
        result = await decide_reply(
            session, comment, action=body.action, text=body.text, note=body.note
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # reject-with-note → redraft once, immediately, so a fresh suggestion waits
    if (
        body.action == "reject"
        and result.get("redraft_allowed")
        and (socket := getattr(request.app.state, "llm_socket", None)) is not None
    ):
        item = await session.get(ContentItemRow, comment.item_id)
        try:
            draft, _u = await draft_reply(
                socket,
                profile=await _profile(session, founder.id),
                platform=comment.platform,
                post_excerpt=item.body if item else "",
                comment_text=comment.text,
                note=body.note,
            )
            comment.redraft_count += 1
            await set_reply_draft(session, comment, draft.reply)
            result = {"status": "reply_redrafted", "reply_draft": draft.reply}
        except Exception:  # noqa: BLE001
            pass

    await record(
        session,
        event_type=AuditEventType.GATE_DECISION,
        agent_id=AGENT,
        founder_id=founder.id,
        outcome=f"comment_reply_{body.action}",
        detail={"comment_id": str(comment_id), "result": result.get("status")},
    )
    await session.commit()
    return result


@router.post("/maintenance/pull-comments", response_model=dict)
async def pull_comments(
    request: Request,
    x_maintenance_key: str = Header(default=""),
) -> dict:
    """Cron-ready: pull new comments on published posts via configured sources.
    Platforms without a source are skipped (manual stays the road there)."""
    _require_maintenance_key(request, x_maintenance_key)
    sources = getattr(request.app.state, "comment_sources", None) or {}
    factory = request.app.state.session_factory
    pulled = 0
    async with factory() as session:
        published = (
            (
                await session.execute(
                    select(ContentItemRow).where(ContentItemRow.status == "exported")
                )
            )
            .scalars()
            .all()
        )
    for item in published:
        source = sources.get(item.platform)
        if source is None:
            continue
        fetched = await source.fetch(
            item_id=item.item_id, platform=item.platform, external_post_id=None
        )
        async with tenant_session(factory, item.founder_id) as session:
            for c in fetched:
                _row, created = await record_comment(
                    session,
                    founder_id=item.founder_id,
                    item_id=item.item_id,
                    platform=item.platform,
                    external_id=c["external_id"],
                    text=c["text"],
                    author_handle=c.get("author_handle"),
                    source=source.name,
                )
                pulled += int(created)
            await apply_comment_sentiment_to_signals(
                session, founder_id=item.founder_id, item_id=item.item_id
            )
            await session.commit()
    return {"new_comments": pulled}
