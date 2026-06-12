"""SQLAlchemy ORM models mirroring the migration SQL.

These models are written to work on both PostgreSQL (production, created by
the SQL migrations) and SQLite (fast offline tests via create_all). Postgres
extras — the append-only trigger and RLS — exist only in the migration and
are verified against the live database.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

JSONType = JSON().with_variant(JSONB(), "postgresql")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class FounderRow(Base):
    __tablename__ = "founders"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    # Supabase auth.users.id (the JWT `sub` claim) — the verified identity that
    # owns this row. NULL = not reachable through the API until linked.
    auth_user_id: Mapped[UUID | None] = mapped_column(Uuid, unique=True, nullable=True)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class FounderProfileRow(Base):
    __tablename__ = "founder_profiles"

    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    draft: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    profile: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class RunRow(Base):
    __tablename__ = "runs"

    run_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), nullable=False
    )
    thread_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="generating")
    tokens_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    images_generated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_inr: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    report: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    gate1: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    gate2: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ContentItemRow(Base):
    __tablename__ = "content_items"

    item_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    run_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("runs.run_id", ondelete="CASCADE"), nullable=False
    )
    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    format: Mapped[str] = mapped_column(String(32), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    thread: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    link_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    media: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    regeneration_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    regeneration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ApprovalEventRow(Base):
    __tablename__ = "approval_events"

    event_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    run_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("runs.run_id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("content_items.item_id", ondelete="CASCADE"), nullable=False
    )
    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), nullable=False
    )
    decision: Mapped[str] = mapped_column(String(16), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PublishResultRow(Base):
    __tablename__ = "publish_results"

    result_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    request_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    item_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("content_items.item_id", ondelete="CASCADE"), nullable=False
    )
    run_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("runs.run_id", ondelete="CASCADE"), nullable=False
    )
    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    adapter: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    platform_post_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    public_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    thread_ids: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    raw_response: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_estimate_usd: Mapped[float | None] = mapped_column(Numeric(10, 5), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ConnectedAccountRow(Base):
    __tablename__ = "connected_accounts"
    __table_args__ = (UniqueConstraint("founder_id", "platform"),)

    account_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="connected")
    scopes: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    external_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    wrapped_dek: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class OAuthStateRow(Base):
    __tablename__ = "oauth_states"

    state: Mapped[str] = mapped_column(Text, primary_key=True)
    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    code_verifier: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SignalRow(Base):
    """Eagle-View metrics — mirrors the frozen SignalRecord contract (Slice 1.1).
    One row per item × platform × window; re-entry updates (founders correct
    numbers), so the latest value wins."""

    __tablename__ = "signals"
    __table_args__ = (UniqueConstraint("item_id", "platform", "window_point"),)

    signal_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("content_items.item_id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    window_point: Mapped[str] = mapped_column(String(8), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    pulled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    reach: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    engagement_rate: Mapped[float] = mapped_column(Numeric(10, 6), nullable=False, default=0)
    follower_delta_48h: Mapped[int | None] = mapped_column(Integer, nullable=True)
    link_ctr: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    comment_sentiment: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    saves: Mapped[int | None] = mapped_column(Integer, nullable=True)
    half_life_hours: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class PostCommentRow(Base):
    """Comment Agent (Slice 3.4): one row per comment on a published post, plus
    its drafted reply and where that reply stands. Nothing is ever sent without
    the founder flipping reply_status to approved — no auto-reply, ever."""

    __tablename__ = "post_comments"
    __table_args__ = (UniqueConstraint("item_id", "external_id"),)

    comment_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("content_items.item_id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    external_id: Mapped[str] = mapped_column(Text, nullable=False)  # platform's comment id
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    author_handle: Mapped[str | None] = mapped_column(Text, nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    sentiment: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    reply_draft: Mapped[str | None] = mapped_column(Text, nullable=True)
    reply_status: Mapped[str] = mapped_column(String(24), nullable=False, default="new")
    reply_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    redraft_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class KnowledgeChunkRow(Base):
    """Company Brain corpus (Slice 3.3, free-tier edition). Embeddings live in
    a portable JSON column — exact cosine in Python at MVP scale; the Pro
    upgrade (vector(1024) + HNSW) is one documented migration away."""

    __tablename__ = "knowledge_chunks"
    __table_args__ = (UniqueConstraint("founder_id", "source", "seq"),)

    chunk_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    founder_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("founders.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(200), nullable=False)  # doc:/url:/insight:
    seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list] = mapped_column(JSONType, nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class AuditRow(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer(), "sqlite"), primary_key=True, autoincrement=True
    )
    record_id: Mapped[UUID] = mapped_column(Uuid, unique=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    agent_id: Mapped[str] = mapped_column(Text, nullable=False)
    founder_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    run_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    approval_event_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    platform: Mapped[str | None] = mapped_column(String(32), nullable=True)
    outcome: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # Slice 2.4 — tamper-evident chain (per founder scope; see audit/recorder.py).
    # redacted = DPDP erasure blanked the content but the chain link survives.
    prev_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    row_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    redacted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
