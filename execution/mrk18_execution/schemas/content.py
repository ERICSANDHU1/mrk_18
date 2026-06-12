"""ContentItem + MediaSpec — one post flowing through the pipeline (L4-L6).

Status lifecycle (silence = rejection, enforced by an expiry job):

    draft -> awaiting_approval -> approved   -> published | exported | failed
                                | rejected   -> draft (regenerate, capped)
                                | expired    (terminal: gate timeout)
"""

import re
from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .constraints import PLATFORM_CONSTRAINTS, validate_body, validate_media
from .enums import ContentFormat, ContentStatus, Platform

_URL_RE = re.compile(r"https?://", re.IGNORECASE)

MAX_REGENERATIONS = 2  # reflection loop cap (PRD reliability rule R-4)

ALLOWED_TRANSITIONS: dict[ContentStatus, frozenset[ContentStatus]] = {
    ContentStatus.DRAFT: frozenset({ContentStatus.AWAITING_APPROVAL}),
    ContentStatus.AWAITING_APPROVAL: frozenset(
        {ContentStatus.APPROVED, ContentStatus.REJECTED, ContentStatus.EXPIRED}
    ),
    ContentStatus.APPROVED: frozenset(
        {ContentStatus.PUBLISHED, ContentStatus.EXPORTED, ContentStatus.FAILED}
    ),
    ContentStatus.REJECTED: frozenset({ContentStatus.DRAFT}),  # regenerate-with-note
    ContentStatus.EXPIRED: frozenset(),
    ContentStatus.PUBLISHED: frozenset(),
    ContentStatus.EXPORTED: frozenset({ContentStatus.PUBLISHED}),  # manual post later
    ContentStatus.FAILED: frozenset({ContentStatus.APPROVED}),  # retry path
}


def can_transition(current: ContentStatus, new: ContentStatus) -> bool:
    return new in ALLOWED_TRANSITIONS[current]


_FORMAT_PLATFORM: dict[ContentFormat, Platform] = {
    ContentFormat.LINKEDIN_POST: Platform.LINKEDIN,
    ContentFormat.X_SINGLE: Platform.X,
    ContentFormat.X_THREAD: Platform.X,
    ContentFormat.IG_CAPTION: Platform.INSTAGRAM,
}


class MediaSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, description="Object-storage URL — blobs never travel in state")
    mime: str = Field(min_length=1)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    size_bytes: int = Field(gt=0)
    alt_text: str = Field(default="", max_length=4000)


class ContentItem(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    item_id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    platform: Platform
    format: ContentFormat
    body: str = Field(min_length=1)
    thread: list[str] | None = None  # X threads only
    link_url: str | None = None
    first_comment: str | None = None  # LinkedIn link-in-comment / IG hashtag comment
    image_prompt: str | None = None
    media: list[MediaSpec] = Field(default_factory=list)
    status: ContentStatus = ContentStatus.DRAFT
    regeneration_note: str | None = None
    regeneration_count: int = Field(default=0, ge=0, le=MAX_REGENERATIONS)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    @model_validator(mode="after")
    def enforce_platform_rules(self) -> "ContentItem":
        # 1. Format must match platform.
        if _FORMAT_PLATFORM[self.format] != self.platform:
            raise ValueError(
                f"format {self.format.value} does not belong to platform {self.platform.value}"
            )
        c = PLATFORM_CONSTRAINTS[self.platform]
        # 2. Thread rules.
        if self.format == ContentFormat.X_THREAD:
            if not self.thread or len(self.thread) < 2:
                raise ValueError("x_thread requires a thread of >= 2 items")
            if c.max_thread_items is not None and len(self.thread) > c.max_thread_items:
                raise ValueError(
                    f"thread has {len(self.thread)} items, max {c.max_thread_items}"
                )
            for i, seg in enumerate(self.thread):
                if len(seg) > 280:
                    raise ValueError(f"thread item {i} is {len(seg)} chars, max 280")
        elif self.thread is not None:
            raise ValueError("thread is only allowed for x_thread format")
        # 3. Body length / hashtag constraints.
        errors = validate_body(self.platform, self.body)
        # 4. Link policy: platforms with links_in_body=False must carry NO url
        #    in the body at all (not just the link_url field — bare URLs too).
        if c.links_in_body is False and _URL_RE.search(self.body):
            errors.append(
                f"{self.platform.value}: links must not appear in body "
                "(LinkedIn -> first_comment, Instagram -> link in bio)"
            )
        # 5. Media constraints: per-image + count.
        if len(self.media) > c.max_images_per_post:
            errors.append(
                f"{self.platform.value}: {len(self.media)} images, max {c.max_images_per_post}"
            )
        for m in self.media:
            errors.extend(
                validate_media(
                    self.platform,
                    mime=m.mime,
                    size_bytes=m.size_bytes,
                    width=m.width,
                    height=m.height,
                )
            )
        if errors:
            raise ValueError("; ".join(errors))
        return self
