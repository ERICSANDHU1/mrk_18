"""Content Agent (Layer 4) — platform-native copy, validated at generation.

The platform rulebook (schemas/constraints.py) is enforced HERE, at creation:
a ContentItem that violates its platform's rules cannot be constructed, so
nothing malformed ever reaches the approval gate or an ops person.

This role (AgentRole.CONTENT) is adapter #7's future seat.
"""

from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from .analysis import NO_FABRICATION
from ..guardrails import GuardrailViolation, check_content, scan_input
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


def _provided_corpus(profile: dict, report: dict) -> str:
    """Everything the founder actually gave us — the ground truth the A4
    fabrication guardrail checks generated numbers/codes against."""
    import json

    return (json.dumps(profile, default=str) + " " + json.dumps(report, default=str)).lower()


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
    alt_text: str = Field(default="", description="Image accessibility text (auto-trimmed to 300 chars)")

    @field_validator("alt_text", mode="before")
    @classmethod
    def _cap_alt_text(cls, v: object) -> str:
        # alt_text is non-critical accessibility text — a verbose adapter must NEVER
        # fail a whole run's worth of generation over its length. Coerce + truncate
        # instead of rejecting (the old max_length=300 nuked otherwise-good posts).
        return str(v or "").strip()[:300]


FORMAT_BRIEFS: dict[ContentFormat, str] = {
    ContentFormat.LINKEDIN_POST: (
        "LinkedIn post — write the FULL 150-300 words (a one-line post is a FAILURE). Hook in "
        "line 1 (it gets truncated after ~2 lines), then DEVELOP it: the insight, a proof "
        "point, the 'why now', and a close. Story or insight > listicle. NO links in body — "
        "if a link is needed, put it in first_comment. 3-5 hashtags at the end."
    ),
    ContentFormat.X_THREAD: (
        "X thread of 3-4 segments (NOT one). Segment 1 = the hook (must stand alone). EVERY "
        "segment <= 270 characters (hard limit 280). Each segment carries a NEW point — no "
        "repeats. Put the full thread in `thread`; set `body` to segment 1 verbatim. No links."
    ),
    ContentFormat.IG_CAPTION: (
        "Instagram caption — write the FULL 100-200 words (not a single line). Strong first "
        "line, line breaks for rhythm, NO links anywhere (not clickable - say 'link in bio' "
        "if needed). Up to 8 hashtags in first_comment, not the body."
    ),
}


def _gen_prompt(
    profile: dict,
    report: dict,
    fmt: ContentFormat,
    platform: Platform,
    performance_memo: str | None = None,
    company_knowledge: str | None = None,
    brand_page: str | None = None,
) -> tuple[str, str]:
    c = PLATFORM_CONSTRAINTS[platform]
    # Level 1 image grounding: when we've read the founder's real website, the
    # image_prompt must describe the ACTUAL product, not a generic stand-in.
    image_rule = (
        "Also produce image_prompt: a rich visual brief matching the post (no words/text "
        "rendered inside the image) and a short alt_text. "
    )
    if brand_page:
        image_rule += (
            "GROUND the image_prompt in the REAL product as described on the brand's own "
            "website below — its actual form factor, shape, material, colour and design. "
            "Describe THAT product specifically; never invent a generic stand-in. "
        )
    system = (
        "You are MRK18's content engine writing AS the founder (first person), in their "
        f"brand voice. Voice/tone: {profile.get('tone', 'direct, warm')}. "
        "India-first, concrete, zero generic AI fluff. Never attack competitors by name. "
        f"\n\n{NO_FABRICATION} In a post this means: NEVER state a specific price, "
        "offer amount, or coupon/promo code unless the founder gave it — write an honest "
        "CTA instead ('launch offer inside', 'first-kit discount — link below'). "
        f"\n\nFORMAT BRIEF: {FORMAT_BRIEFS[fmt]}"
        f"\nHard platform limits: max {c.max_body_chars} chars in body"
        + (f", max {c.max_hashtags} hashtags" if c.max_hashtags else "")
        + ". "
        "\n\nDEPTH (non-negotiable): write a FULLY DEVELOPED post that fills the brief's word "
        "count — a sharp hook, then two to four sentences of real substance (the insight, the "
        "proof, the tension, the 'why now'), then a clear close. A single line, a bare slogan, "
        "or a one-sentence post is a FAILURE; develop the idea. The first_comment must be a "
        "DISTINCT element (a link or a short standalone CTA) — NEVER a copy or near-copy of the "
        "body. "
        + image_rule
    )
    strategy = report.get("content_strategy", {})
    memo = f"{performance_memo}\n\n" if performance_memo else ""
    knowledge = f"{company_knowledge}\n\n" if company_knowledge else ""
    page = (
        f"THE BRAND'S OWN WEBSITE (real product — use for the image_prompt's look):\n{brand_page}\n\n"
        if brand_page
        else ""
    )
    user = (
        f"Founder profile: {profile}\n\n"
        f"Approved strategy summary: {strategy.get('summary', '')}\n"
        f"Strategy claims: {[c0['text'] for c0 in strategy.get('claims', [])][:6]}\n"
        f"CMO verdict: {report.get('synthesis', '')[:800]}\n\n"
        f"{memo}"
        f"{knowledge}"
        f"{page}"
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
    performance_memo: str | None = None,
    company_knowledge: str | None = None,
    brand_page: str | None = None,
) -> tuple[ContentItem, list[Usage]]:
    """Generate one validated ContentItem; feed rule violations back once.

    Regeneration mode (Gate 2 reject-with-note): same item_id, the founder's
    note steers the rewrite, regeneration_count increments (schema caps it).
    """
    fmt = PLATFORM_FORMAT[platform]
    system, user = _gen_prompt(
        profile, report, fmt, platform, performance_memo, company_knowledge, brand_page
    )
    if rejection_note:
        # A4 — pre-LLM input filter: a rejection note is founder free-text that
        # gets appended to the prompt. If it carries injection/role-override,
        # withhold the raw text and fall back to a neutral rewrite instruction.
        if scan_input(rejection_note):
            user += (
                "\n\nTHE FOUNDER REJECTED the previous draft (their note was withheld "
                "by the input filter). Write a clearly improved, more specific "
                f"replacement.\nPrevious draft for reference:\n{prior_body or ''}"
            )
        else:
            user += (
                f"\n\nTHE FOUNDER REJECTED the previous draft. Their note (follow it "
                f"exactly): {rejection_note}\nPrevious draft for reference:\n{prior_body or ''}"
                "\nWrite a clearly improved replacement, not a light edit."
            )

    usages: list[Usage] = []
    last_error: Exception | None = None
    provided = _provided_corpus(profile, report)  # A4 — the founder's ground truth
    do_not_claim = profile.get("do_not_claim") or []
    words_to_avoid = profile.get("words_to_avoid") or []

    for _ in range(2):  # one generation + one retry (platform rules OR guardrails)
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
        except ValueError as exc:  # platform-rule violation (schema-enforced)
            last_error = exc
            user += (
                f"\n\nYour previous draft broke these platform rules — fix them and "
                f"regenerate:\n{exc}"
            )
            continue

        # A4 — post-generation guardrails: brand-safety, do-not-claim, banned
        # words, fabricated specifics. The prompt asks; this enforces.
        result = check_content(
            body=item.body,
            thread=item.thread,
            first_comment=item.first_comment,
            do_not_claim=do_not_claim,
            words_to_avoid=words_to_avoid,
            provided=provided,
        )
        if result.ok:
            return item, usages
        last_error = GuardrailViolation("; ".join(result.violations))
        user += (
            f"\n\nYour previous draft FAILED content guardrails — fix EVERY issue "
            f"and regenerate:\n{last_error}"
        )
    raise RuntimeError(f"content generation failed rules/guardrails twice: {last_error}")
