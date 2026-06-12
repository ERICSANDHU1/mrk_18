"""Content Agent (Layer 4) — platform-native copy, validated at generation.

The platform rulebook (schemas/constraints.py) is enforced HERE, at creation:
a ContentItem that violates its platform's rules cannot be constructed, so
nothing malformed ever reaches the approval gate or an ops person.

This role (AgentRole.CONTENT) is adapter #7's future seat.
"""

from uuid import UUID

from pydantic import BaseModel, Field

from ..llm.socket import AgentRole, LLMSocket, Usage
from ..schemas.constraints import PLATFORM_CONSTRAINTS
from ..schemas.content import ContentItem
from ..schemas.enums import ContentFormat, Platform

# platform → the one format V1 generates per batch (PRD v2.0 Sheet 9)
PLATFORM_FORMAT: dict[Platform, ContentFormat] = {
    Platform.LINKEDIN: ContentFormat.LINKEDIN_POST,
    Platform.X: ContentFormat.X_THREAD,
    Platform.INSTAGRAM: ContentFormat.IG_CAPTION,
}

# which formats get a generated image (X stays text-first in the pilot)
IMAGE_FORMATS = {ContentFormat.LINKEDIN_POST, ContentFormat.IG_CAPTION}


class DraftCopy(BaseModel):
    body: str = Field(min_length=1)
    thread: list[str] | None = Field(
        default=None, description="ONLY for x_thread: 2-5 segments, each <= 280 chars"
    )
    first_comment: str | None = Field(
        default=None, description="LinkedIn: the link lives here. Instagram: hashtag dump."
    )
    image_prompt: str = Field(
        min_length=10,
        description="Visual brief for the image engine: scene, style, colors, mood. No text-in-image.",
    )
    alt_text: str = Field(default="", max_length=300)


FORMAT_BRIEFS: dict[ContentFormat, str] = {
    ContentFormat.LINKEDIN_POST: (
        "LinkedIn post, 150-300 words. Hook in line 1 (it gets truncated after ~2 lines). "
        "Story or insight > listicle. NO links in body — if a link is needed, put it in "
        "first_comment. 3-5 hashtags at the end."
    ),
    ContentFormat.X_THREAD: (
        "X thread of 3-4 segments. Segment 1 = the hook (must stand alone). EVERY segment "
        "<= 270 characters (hard limit 280). Put the full thread in `thread`; set `body` to "
        "segment 1 verbatim. No links."
    ),
    ContentFormat.IG_CAPTION: (
        "Instagram caption, 100-200 words. Strong first line, line breaks for rhythm, "
        "NO links anywhere (not clickable - say 'link in bio' if needed). Up to 8 hashtags "
        "in first_comment, not the body."
    ),
}


def _gen_prompt(profile: dict, report: dict, fmt: ContentFormat, platform: Platform) -> tuple[str, str]:
    c = PLATFORM_CONSTRAINTS[platform]
    system = (
        "You are MRK18's content engine writing AS the founder (first person), in their "
        f"brand voice. Voice/tone: {profile.get('tone', 'direct, warm')}. "
        "India-first, concrete, zero generic AI fluff. Never attack competitors by name. "
        f"\n\nFORMAT BRIEF: {FORMAT_BRIEFS[fmt]}"
        f"\nHard platform limits: max {c.max_body_chars} chars in body"
        + (f", max {c.max_hashtags} hashtags" if c.max_hashtags else "")
        + ". Also produce image_prompt: a rich visual brief matching the post (no words/text "
        "rendered inside the image) and a short alt_text."
    )
    strategy = report.get("content_strategy", {})
    user = (
        f"Founder profile: {profile}\n\n"
        f"Approved strategy summary: {strategy.get('summary', '')}\n"
        f"Strategy claims: {[c0['text'] for c0 in strategy.get('claims', [])][:6]}\n"
        f"CMO verdict: {report.get('synthesis', '')[:800]}\n\n"
        f"Write ONE {fmt.value} for {platform.value} executing this strategy."
    )
    return system, user


async def generate_item(
    socket: LLMSocket,
    run_id: str,
    profile: dict,
    report: dict,
    platform: Platform,
    *,
    item_id: str | None = None,
    prior_body: str | None = None,
    rejection_note: str | None = None,
    regeneration_count: int = 0,
) -> tuple[ContentItem, list[Usage]]:
    """Generate one validated ContentItem; feed rule violations back once.

    Regeneration mode (Gate 2 reject-with-note): same item_id, the founder's
    note steers the rewrite, regeneration_count increments (schema caps it).
    """
    fmt = PLATFORM_FORMAT[platform]
    system, user = _gen_prompt(profile, report, fmt, platform)
    if rejection_note:
        user += (
            f"\n\nTHE FOUNDER REJECTED the previous draft. Their note (follow it "
            f"exactly): {rejection_note}\nPrevious draft for reference:\n{prior_body or ''}"
            "\nWrite a clearly improved replacement, not a light edit."
        )
    usages: list[Usage] = []
    last_error: Exception | None = None

    for _ in range(2):  # one generation + one rule-violation retry
        copy, usage = await socket.complete(AgentRole.CONTENT, system, user, DraftCopy)
        usages.append(usage)
        try:
            kwargs: dict = {}
            if item_id is not None:
                kwargs["item_id"] = UUID(item_id)
            item = ContentItem(
                run_id=UUID(run_id),
                platform=platform,
                format=fmt,
                body=copy.body,
                thread=copy.thread if fmt == ContentFormat.X_THREAD else None,
                first_comment=copy.first_comment,
                image_prompt=copy.image_prompt,
                regeneration_note=rejection_note,
                regeneration_count=regeneration_count,
                **kwargs,
            )
            return item, usages
        except ValueError as exc:
            last_error = exc
            user += (
                f"\n\nYour previous draft broke these platform rules — fix them and "
                f"regenerate:\n{exc}"
            )
    raise RuntimeError(f"content generation failed platform rules twice: {last_error}")
