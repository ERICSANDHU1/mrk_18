"""PublishRequest / PublishResult — the adapter interface (L6).

Shapes verified against live platform APIs (research, 11 Jun 2026).
PublishResult is deliberately MUTABLE: the Instagram ops queue completes
asynchronously (queued_manual -> ops pastes the live URL later).
"""

from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .content import MediaSpec
from .enums import Platform, PublishStatus, Visibility


class PublishError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    is_token_expired: bool = False
    retry_after_seconds: int | None = None


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_id: str = Field(min_length=8, description="Idempotency key — retries never double-post")
    item_id: UUID
    approval_event_id: UUID  # publisher re-verifies this exists before acting
    platform: Platform
    account_ref: str = Field(min_length=1, description="Internal connected-account id")
    author_handle: str = Field(min_length=1)
    body: str = Field(min_length=1)
    thread: list[str] | None = None
    media: list[MediaSpec] = Field(default_factory=list)
    first_comment: str | None = None
    link_url: str | None = None
    scheduled_at: datetime
    visibility: Visibility = Visibility.PUBLIC


class PublishResult(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)  # mutable

    request_id: str
    status: PublishStatus
    platform_post_id: str | None = None  # LinkedIn URN / X tweet id / IG media id
    public_url: str | None = None
    thread_ids: list[str] | None = None
    published_at: datetime | None = None
    raw_response: dict = Field(default_factory=dict)  # verbatim, incl. headers, for audit
    error: PublishError | None = None
    cost_estimate_usd: float | None = None  # X pay-per-use transparency
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
