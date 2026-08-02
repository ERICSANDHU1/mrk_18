"""Create Campaigns — generate branded creatives from the Business DNA.

One LLM call writes TWO DELIBERATELY DIFFERENT posts (Instagram + LinkedIn) —
different angle, headline, image scene and caption each — plus a text-free image
prompt per post. The free FLUX engine renders each base scene; the compositor
bakes the headline, logo and palette on top; the poster is stored (Supabase) or
returned as a data URI in dev. Brain-ready: copy runs on AgentRole.CONTENT → the
`ad_copy` LoRA when the Brain is on; the Groq pilot today.

Round 1 auto-generates from the DNA; round 2 takes the founder's own `prompt`.
"""

import base64
import logging
import uuid

import httpx
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..llm.images import to_jpeg
from ..llm.socket import AgentRole, LLMSocket
from .poster import compose_poster

log = logging.getLogger("mrk18.campaign")


class CampaignPost(BaseModel):
    """One post's copy — the LLM half; the compositor renders headline/logo."""

    model_config = ConfigDict(extra="ignore")

    platform: str = Field(default="Instagram", max_length=20)
    headline: str = Field(min_length=1, max_length=70)       # baked ONTO the poster
    caption: str = Field(min_length=1, max_length=1400)      # the platform caption
    image_prompt: str = Field(min_length=10, max_length=600)  # product scene, NO text
    cta: str = Field(default="", max_length=24)

    @field_validator("headline", "cta", "platform", mode="after")
    @classmethod
    def _oneline(cls, v: str) -> str:
        return " ".join(str(v).split())


class CampaignSet(BaseModel):
    """The two distinct posts for one round (Instagram + LinkedIn)."""

    model_config = ConfigDict(extra="ignore")

    posts: list[CampaignPost] = Field(min_length=1, max_length=2)


def _brand_name(dna: dict) -> str:
    d = str(dna.get("domain") or "").split(".")[0]
    return (d[:1].upper() + d[1:]) if d else "your brand"


async def _write_set(socket: LLMSocket, dna: dict, prompt: str | None) -> CampaignSet:
    brand = _brand_name(dna)
    voice = ", ".join((dna.get("tone_tags") or [])[:4]) or "direct, warm"
    values = ", ".join((dna.get("brand_values") or [])[:4])
    system = (
        "You are mrk18's ad creative director writing AS the brand, in its own voice. "
        "Concrete, specific, zero generic AI fluff. NEVER invent prices, offers, stats, or "
        "claims the brand hasn't made — write an honest CTA instead."
    )
    ask = (
        f"The founder's brief for this campaign: {prompt.strip()[:400]}\n"
        "Build both posts around that brief."
        if prompt and prompt.strip()
        else "Pick TWO of the brand's strongest, most distinct angles from its positioning."
    )
    user = (
        f"Brand: {brand} ({dna.get('domain')})\n"
        f"What they do: {str(dna.get('business_overview', ''))[:400]}\n"
        f"Tagline: {dna.get('tagline', '')}\nVoice: {voice}\nValues: {values}\n\n"
        f"{ask}\n\n"
        "Return EXACTLY TWO posts in `posts` — the first platform 'Instagram', the second "
        "'LinkedIn'. They must be DELIBERATELY DIFFERENT from each other: different angle, "
        "different headline, DIFFERENT image scene, different caption. Do NOT reuse the same "
        "headline or image idea across the two.\n"
        "Each post has:\n"
        "- platform: 'Instagram' or 'LinkedIn'.\n"
        "- headline: MAX 6 words, punchy — goes ON the image (no hashtags, no quotes).\n"
        "- caption: written for THAT platform's voice. Instagram = casual, visual, a hook + a "
        "line of substance + soft CTA + 2-4 relevant hashtags. LinkedIn = professional, "
        "insight-led, no hashtags. The two captions must read clearly differently.\n"
        "- image_prompt: a rich, SPECIFIC visual brief for a scene that DIRECTLY depicts THIS "
        "brand's actual product, topic or customer moment — NEVER a generic office, boardroom, or "
        "people-round-a-screen stock shot unless that literally IS the product. Name concrete "
        "subjects, setting, props, lighting and mood. Compose so the LOWER THIRD is relatively "
        "clean/empty for a headline. END the prompt with these quality cues verbatim: "
        "'professional editorial photography, natural light, high detail, sharp focus, shallow "
        "depth of field, cinematic color grading, 8k'. NO text, words, letters, logos, charts, UI, "
        "or watermarks in the image. Make the two scenes clearly different from each other.\n"
        "- cta: MAX 3 words (e.g. 'Shop now', 'Learn more')."
    )
    cset, _usage = await socket.complete(AgentRole.CONTENT, system, user, CampaignSet)
    return cset


async def _logo_bytes(url: str) -> bytes | None:
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(url, follow_redirects=True)
            r.raise_for_status()
            return r.content
    except Exception:  # noqa: BLE001 — a missing logo must never fail the creative
        return None


async def _store(media_store, domain: str, platform: str, jpeg: bytes) -> str:
    if media_store is not None:
        try:
            path = f"campaigns/{domain}/{platform.lower()}-{uuid.uuid4().hex[:8]}.jpg"
            return await media_store.save(path, jpeg)
        except Exception as exc:  # noqa: BLE001 — fall back to an inline data URI
            log.warning("campaign: media store failed, using data URI: %s", exc)
    return "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()


async def _render(image_engine, media_store, dna, domain, post: CampaignPost, logo) -> dict:
    raw = await image_engine.generate(post.image_prompt, 1080, 1350)
    base = to_jpeg(raw, 1080, 1350)
    poster = compose_poster(
        base, post.headline, width=1080, height=1350,
        palette=dna.get("colors") or [], logo_png=logo,
        cta=post.cta or None, brand_name=_brand_name(dna),
    )
    platform = post.platform if post.platform in ("Instagram", "LinkedIn") else "Instagram"
    url = await _store(media_store, domain, platform, poster)
    return {"platform": platform, "image_url": url, "headline": post.headline, "caption": post.caption}


async def generate_campaign_creatives(
    socket: LLMSocket, image_engine, media_store, dna: dict, domain: str, prompt: str | None = None
) -> list[dict]:
    """Two DISTINCT branded creatives (Instagram + LinkedIn). Round 1 auto from
    the DNA; round 2 from the founder's `prompt`. Sequential rendering (the free
    FLUX engine is slow/rate-limited); one post failing never kills both."""
    cset = await _write_set(socket, dna, prompt)
    logo = await _logo_bytes(dna.get("logo_url") or "")
    # ensure the two are labelled distinctly even if the model repeats a platform
    posts = cset.posts[:2]
    for i, p in enumerate(posts):
        p.platform = "Instagram" if i == 0 else "LinkedIn"
    out: list[dict] = []
    for post in posts:
        try:
            out.append(await _render(image_engine, media_store, dna, domain, post, logo))
        except Exception as exc:  # noqa: BLE001
            log.warning("campaign: %s creative failed for %s: %s", post.platform, domain, exc)
    return out
