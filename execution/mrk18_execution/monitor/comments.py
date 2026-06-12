"""Comment Agent (Slice 3.4) — the store: ingest, draft, the reply gate.

Mirrors the seam pattern: a CommentSource protocol (manual today, platform
APIs at go-live), dedup on the platform's comment id, deterministic sentiment
on every comment, and a reply lifecycle whose ONLY exit to the outside world
is through the founder's approval. Aggregated sentiment is written back onto
the post's signal rows, finally feeding the `comment_sentiment` column the
schema reserved in Slice 1.1.

Sandbox: every operation here runs as `agent:comment` — read/write comments,
write the sentiment signal, draft via the LLM. No publish capability: an
approved reply's actual send is a separate, stubbed step (go-live adapter).
"""

import logging
from statistics import mean
from typing import Protocol
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.comment import score_sentiment
from ..db.models import PostCommentRow, SignalRow
from ..schemas.content import MAX_REGENERATIONS
from ..security.manifests import require_permission

log = logging.getLogger("mrk18.comments")

AGENT = "agent:comment"

REPLYABLE = ("new", "reply_drafted", "reply_rejected")


class CommentSource(Protocol):
    name: str

    async def fetch(self, *, item_id: UUID, platform: str, external_post_id: str | None) -> list[dict]:
        """Return comment dicts: {external_id, author_handle, text}."""
        ...


class StubCommentSource:
    """Deterministic comments for tests/demos — a mix of praise, a question,
    and a complaint, stable per item so sentiment ordering is testable."""

    name = "stub"

    async def fetch(self, *, item_id: UUID, platform: str, external_post_id: str | None) -> list[dict]:
        seed = item_id.int % 3
        base = [
            {"external_id": f"{item_id}-c1", "author_handle": "@ravi", "text": "This is genuinely helpful, thank you!"},
            {"external_id": f"{item_id}-c2", "author_handle": "@neha", "text": "How does the pricing work for small teams?"},
            {"external_id": f"{item_id}-c3", "author_handle": "@troll", "text": "Overpriced and overrated, honestly."},
        ]
        return base[: 2 + (seed % 2)]  # 2-3 comments


async def record_comment(
    session: AsyncSession,
    *,
    founder_id: UUID,
    item_id: UUID,
    platform: str,
    external_id: str,
    text: str,
    author_handle: str | None = None,
    source: str = "manual",
) -> tuple[PostCommentRow, bool]:
    """Store a comment (deduped by item × external_id) with its sentiment.
    Returns (row, created). Re-seeing a comment never duplicates or re-scores
    a reply already in flight."""
    require_permission(AGENT, "comments:write")
    existing = (
        await session.execute(
            select(PostCommentRow).where(
                PostCommentRow.item_id == item_id,
                PostCommentRow.external_id == external_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False
    row = PostCommentRow(
        founder_id=founder_id,
        item_id=item_id,
        platform=platform,
        external_id=external_id,
        source=source,
        author_handle=author_handle,
        text=text,
        sentiment=score_sentiment(text),
        reply_status="new",
    )
    session.add(row)
    await session.flush()
    return row, True


async def set_reply_draft(session: AsyncSession, comment: PostCommentRow, draft: str) -> None:
    require_permission(AGENT, "comments:write")
    comment.reply_draft = draft
    comment.reply_status = "reply_drafted"


async def decide_reply(
    session: AsyncSession,
    comment: PostCommentRow,
    *,
    action: str,
    text: str | None = None,
    note: str | None = None,
) -> dict:
    """The gate. `approve` sends the current draft (stub), `edit` sends the
    founder's exact text, `reject` (with a note) clears the draft for a
    redraft, `ignore` drops it. Nothing leaves without one of these."""
    require_permission(AGENT, "comments:write")
    if action == "approve":
        if not comment.reply_draft:
            raise ValueError("no drafted reply to approve")
        comment.reply_status = "reply_approved"
        return await _send_reply(session, comment, comment.reply_draft)
    if action == "edit":
        if not text or not text.strip():
            raise ValueError("edit requires the founder's reply text")
        comment.reply_draft = text.strip()
        comment.reply_status = "reply_approved"
        return await _send_reply(session, comment, comment.reply_draft)
    if action == "reject":
        comment.reply_note = note
        if note and comment.redraft_count < MAX_REGENERATIONS:
            comment.reply_status = "reply_rejected"  # a redraft may follow
            return {"status": "reply_rejected", "redraft_allowed": True}
        comment.reply_status = "reply_rejected"
        comment.reply_draft = None
        return {"status": "reply_rejected", "redraft_allowed": False}
    if action == "ignore":
        comment.reply_status = "ignored"
        return {"status": "ignored"}
    raise ValueError(f"unknown action '{action}'")


async def _send_reply(session: AsyncSession, comment: PostCommentRow, text: str) -> dict:
    """Publish the approved reply. STUB until go-live (no platform comment API
    yet) — built to flip live behind a CommentPublisher adapter, exactly like
    the post publishers. Honest status: approved → published only via here."""
    comment.reply_status = "reply_published"
    return {
        "status": "reply_published",
        "reply": text,
        "stub": True,
        "note": "queued for the live comment API at go-live; approval is recorded now",
    }


async def apply_comment_sentiment_to_signals(
    session: AsyncSession, *, founder_id: UUID, item_id: UUID
) -> float | None:
    """Aggregate this post's comment sentiment and write it onto its signal
    rows — closing the loop with the column reserved in Slice 1.1, so the
    self-learning memo can eventually weigh 'people react warmly to X'."""
    require_permission(AGENT, "signals:write")
    scores = (
        (
            await session.execute(
                select(PostCommentRow.sentiment).where(
                    PostCommentRow.item_id == item_id,
                    PostCommentRow.sentiment.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not scores:
        return None
    avg = round(mean(float(s) for s in scores), 3)
    await session.execute(
        update(SignalRow)
        .where(SignalRow.item_id == item_id, SignalRow.founder_id == founder_id)
        .values(comment_sentiment=avg)
    )
    return avg


async def list_comments(session: AsyncSession, item_id: UUID) -> list[dict]:
    require_permission(AGENT, "comments:read")
    rows = (
        (
            await session.execute(
                select(PostCommentRow)
                .where(PostCommentRow.item_id == item_id)
                .order_by(PostCommentRow.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [_view(r) for r in rows]


def _view(c: PostCommentRow) -> dict:
    return {
        "comment_id": str(c.comment_id),
        "platform": c.platform,
        "author_handle": c.author_handle,
        "text": c.text,
        "sentiment": float(c.sentiment) if c.sentiment is not None else None,
        "reply_draft": c.reply_draft,
        "reply_status": c.reply_status,
    }
