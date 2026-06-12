"""Per-platform publishing constraints (research-verified 11 Jun 2026).

Single source of truth used by BOTH the Content Agent (validate at generation
time, so ops never bounces a post) and the publisher adapters (final check).
"""

from dataclasses import dataclass, field

from .enums import Platform


@dataclass(frozen=True)
class PlatformConstraints:
    max_body_chars: int
    image_mimes: frozenset[str]
    max_image_bytes: int
    max_images_per_post: int
    # Aspect ratio bounds as width/height; None = unconstrained.
    min_aspect: float | None = None
    max_aspect: float | None = None
    max_hashtags: int | None = None
    max_thread_items: int | None = None
    links_in_body: bool = True
    notes: str = ""
    _extra: dict = field(default_factory=dict)


PLATFORM_CONSTRAINTS: dict[Platform, PlatformConstraints] = {
    Platform.LINKEDIN: PlatformConstraints(
        max_body_chars=3000,
        image_mimes=frozenset({"image/jpeg", "image/png", "image/gif"}),
        max_image_bytes=30 * 1024 * 1024,
        max_images_per_post=9,
        links_in_body=False,  # house style: link goes in first_comment (reach)
        notes="Post URN returned in x-restli-id header; store URL at publish time.",
    ),
    Platform.X: PlatformConstraints(
        max_body_chars=280,
        image_mimes=frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"}),
        max_image_bytes=5 * 1024 * 1024,
        max_images_per_post=4,
        max_thread_items=10,
        notes="URL in body costs $0.20/post on pay-per-use API vs $0.015 without.",
    ),
    Platform.INSTAGRAM: PlatformConstraints(
        max_body_chars=2200,
        image_mimes=frozenset({"image/jpeg"}),  # JPEG only — hard platform rule
        max_image_bytes=8 * 1024 * 1024,
        max_images_per_post=10,
        min_aspect=0.8,  # 4:5
        max_aspect=1.91,
        max_hashtags=30,
        links_in_body=False,  # links not clickable in captions — strip, "link in bio"
        notes="Width 320-1440px, sRGB. Validate at generation time, not publish time.",
    ),
}


def validate_body(platform: Platform, body: str) -> list[str]:
    """Return a list of human-readable violations (empty = valid)."""
    errors: list[str] = []
    c = PLATFORM_CONSTRAINTS[platform]
    if len(body) > c.max_body_chars:
        errors.append(
            f"{platform.value}: body is {len(body)} chars, max {c.max_body_chars}"
        )
    if c.max_hashtags is not None:
        n_tags = body.count("#")
        if n_tags > c.max_hashtags:
            errors.append(f"{platform.value}: {n_tags} hashtags, max {c.max_hashtags}")
    return errors


def validate_media(
    platform: Platform,
    *,
    mime: str,
    size_bytes: int,
    width: int,
    height: int,
) -> list[str]:
    """Return a list of human-readable violations (empty = valid)."""
    errors: list[str] = []
    c = PLATFORM_CONSTRAINTS[platform]
    if mime not in c.image_mimes:
        errors.append(f"{platform.value}: mime {mime} not in {sorted(c.image_mimes)}")
    if size_bytes > c.max_image_bytes:
        errors.append(
            f"{platform.value}: {size_bytes} bytes exceeds {c.max_image_bytes}"
        )
    if height > 0 and (c.min_aspect is not None or c.max_aspect is not None):
        aspect = width / height
        if c.min_aspect is not None and aspect < c.min_aspect:
            errors.append(f"{platform.value}: aspect {aspect:.2f} below {c.min_aspect}")
        if c.max_aspect is not None and aspect > c.max_aspect:
            errors.append(f"{platform.value}: aspect {aspect:.2f} above {c.max_aspect}")
    return errors
