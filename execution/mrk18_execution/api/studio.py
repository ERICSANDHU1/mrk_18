"""Studio — the "Taste the Brain" flow (Business DNA + Create Campaigns).

Phase 1 (here): EXAMINE. `POST /studio/dna` reads the founder's site and returns
the structured Business DNA — the shared object every downstream Studio flow
reads. `GET` returns it; `PATCH` edits it (edits propagate to Talk-to-CMO and
Create Campaigns).

Auth: a valid session JWT (signed-in), keyed by the auth user — a founder row is
NOT required, because the DNA screen comes right after signup, before onboarding.
Brain-ready: extraction runs on the socket (MARKET_INTEL -> the `brand_analysis`
LoRA when the Brain is on; the Groq pilot today).
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.brand_dna import extract_brand_copy
from ..config import get_settings
from ..db.models import BrandDNARow
from ..research.brandfetch import fetch_brand_kit
from .deps import get_session, get_verified_claims
from .taster import _cap_reached, _client_ip, _consume_daily, _daily_used, _normalize

log = logging.getLogger("mrk18.studio")
router = APIRouter(tags=["studio"])

_DNA_V = 3  # bump when the DNA payload shape changes (3 = logo kit fallback fix)


class DNARequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=3, max_length=300)


class DNAEdit(BaseModel):
    """Partial edit — only the sent fields change. Editing the DNA is a PAID
    capability in the product plan; entitlement gating lands with the payment
    system (Phase 5). Functional here so the flow can be built and tested."""

    model_config = ConfigDict(extra="forbid")

    business_overview: str | None = Field(default=None, max_length=600)
    tagline: str | None = Field(default=None, max_length=140)
    aesthetic_tags: list[str] | None = None
    tone_tags: list[str] | None = None
    brand_values: list[str] | None = None
    colors: list[str] | None = None
    heading_font: str | None = Field(default=None, max_length=60)
    body_font: str | None = Field(default=None, max_length=60)


def _sub(claims: dict) -> str:
    sub = (claims.get("sub") or "").strip()
    if not sub:
        raise HTTPException(status_code=401, detail="missing subject in token")
    return sub


def _socket(request: Request):
    # Brain-ready main socket first (MARKET_INTEL -> brand_analysis adapter when the
    # Brain is on); fall back to the fast Groq voice socket in dev.
    return getattr(request.app.state, "llm_socket", None) or getattr(
        request.app.state, "voice_socket", None
    )


def _sample_dna(domain: str, url: str) -> dict:
    return {
        "v": _DNA_V,
        "domain": domain,
        "source_url": url,
        "logo_url": f"https://logo.clearbit.com/{domain}",
        "business_overview": f"(SAMPLE — studio engine not configured) What {domain} does, in two sentences.",
        "tagline": "Your brand, in one honest line.",
        "aesthetic_tags": ["Warm minimalism", "Editorial", "Modern"],
        "tone_tags": ["Direct", "Confident"],
        "brand_values": ["Honesty", "Craft"],
        "colors": ["#b4532a", "#1c1a17", "#ede7da"],
        "heading_font": "Anton",
        "body_font": "Inter",
        "sample": True,
    }


async def _persist(session: AsyncSession, sub: str, payload: dict) -> None:
    """Upsert by account, preserving created_at (load-or-create, not merge)."""
    row = await session.get(BrandDNARow, sub)
    if row is None:
        session.add(BrandDNARow(auth_user_id=sub, payload=payload))
    else:
        row.payload = payload
    await session.commit()


async def _optional_sub(request: Request) -> str | None:
    """The signed-in account id, or None when anonymous. Never raises — the Studio
    read is public (it appears straight from the hero); auth only decides whether
    to ALSO link the DNA to the account."""
    verifier = getattr(request.app.state, "jwt_verifier", None)
    if verifier is None:
        return None
    scheme, _, raw = request.headers.get("authorization", "").partition(" ")
    token = raw.strip() if scheme.lower() == "bearer" else ""
    if not token:
        return None
    try:
        claims = await verifier.verify(token)
        return (claims.get("sub") or "").strip() or None
    except Exception:  # noqa: BLE001 — invalid token = anonymous, never a 500
        return None


@router.post("/studio/dna", response_model=dict)
async def create_dna(
    body: DNARequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Read the founder's site → Business DNA (sharp grounded copy + REAL Brandfetch
    kit). Anonymous-friendly so the combined read appears straight from the hero.
    Cached by domain — each brand spends ONE Brandfetch request ever — and also
    linked to the account when signed in."""
    settings = get_settings()
    sub = await _optional_sub(request)  # None when anonymous
    url, domain = _normalize(body.url)
    domain_key = f"domain:{domain}"

    # domain cache — a brand's DNA is stable; reuse it (protects the Brandfetch
    # free quota + Groq). Editing is per-account (PATCH), never touches this cache.
    cached = await session.get(BrandDNARow, domain_key)
    if cached is not None and (cached.payload or {}).get("v") == _DNA_V:
        payload = cached.payload
        if sub:
            await _persist(session, sub, payload)
        return payload

    socket = _socket(request)
    if socket is None or not settings.tavily_api_key:
        payload = _sample_dna(domain, url)  # dev: give the frontend a shape to render
        kit = await fetch_brand_kit(domain, settings.brandfetch_api_key)
        if kit:
            payload.update(
                {
                    "colors": kit.get("colors") or payload["colors"],
                    "heading_font": kit.get("heading_font") or payload["heading_font"],
                    "body_font": kit.get("body_font") or payload["body_font"],
                    "logo_url": kit.get("logo_url") or payload["logo_url"],
                    "brand_kit": "brandfetch" if (kit.get("logo_url") or kit.get("colors")) else "none",
                }
            )
        if settings.is_prod:
            raise HTTPException(status_code=503, detail="the Studio isn't available right now")
        await _persist(session, domain_key, payload)
        if sub:
            await _persist(session, sub, payload)
        return payload

    from ..research.web import TavilyResearcher

    researcher = TavilyResearcher(settings.tavily_api_key)
    try:
        site_text = await researcher.fetch_page(url)
    except Exception as exc:  # noqa: BLE001 — a fetch failure is a clean 422, never a 500
        log.warning("studio: site fetch failed for %s: %s", url, exc)
        site_text = ""
    if not site_text:
        raise HTTPException(
            status_code=422, detail="we couldn't read that site — check the URL and try again"
        )

    # Grounded copy (LLM) + the REAL brand kit (Brandfetch) in parallel. The kit
    # never raises (None on any failure); only a copy failure is a 503.
    try:
        (copy, _usage), kit = await asyncio.gather(
            extract_brand_copy(socket, site_text[:6000], url, domain),
            fetch_brand_kit(domain, settings.brandfetch_api_key),
        )
    except Exception as exc:  # noqa: BLE001 — engine failures surface as one honest 503
        log.warning("studio: DNA extraction failed for %s: %s", domain, exc)
        raise HTTPException(
            status_code=503, detail="the Studio engine is busy — try again in a moment"
        ) from exc

    kit = kit or {}
    payload = {
        "v": _DNA_V,
        "domain": domain,
        "source_url": url,
        **copy.model_dump(),
        # visual assets: REAL, from Brandfetch — never LLM-invented
        "colors": kit.get("colors") or [],
        "heading_font": kit.get("heading_font") or "",
        "body_font": kit.get("body_font") or "",
        "logo_url": kit.get("logo_url") or f"https://logo.clearbit.com/{domain}",
        "brand_kit": "brandfetch" if (kit.get("logo_url") or kit.get("colors")) else "none",
    }
    await _persist(session, domain_key, payload)
    if sub:
        await _persist(session, sub, payload)
    return payload


@router.get("/studio/dna", response_model=dict)
async def get_dna(
    claims: dict = Depends(get_verified_claims),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """The account's persisted Business DNA (404 until POST /studio/dna runs once)."""
    row = await session.get(BrandDNARow, _sub(claims))
    if row is None:
        raise HTTPException(
            status_code=404, detail="no Business DNA yet — POST /studio/dna with your url"
        )
    return row.payload


@router.patch("/studio/dna", response_model=dict)
async def edit_dna(
    body: DNAEdit,
    claims: dict = Depends(get_verified_claims),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Edit fields of the persisted DNA — updates the single shared object so the
    change propagates to Talk-to-CMO and Create Campaigns."""
    sub = _sub(claims)
    row = await session.get(BrandDNARow, sub)
    if row is None:
        raise HTTPException(status_code=404, detail="no Business DNA to edit yet")
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return row.payload
    row.payload = {**row.payload, **updates}
    await session.commit()
    return row.payload


# ── Create Campaigns (the "taste the Brain" conversion moment) ─────────────────


class CampaignBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=3, max_length=300)
    # round 2: the founder's own brief for the 2 more posts (round 1 sends none)
    prompt: str = Field(default="", max_length=400)


@router.post("/studio/campaign", response_model=dict)
async def create_campaign(
    body: CampaignBody,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Generate the 2 FREE branded creatives (Instagram + LinkedIn) from the
    account's Business DNA — headline + caption (ad_copy role) + FLUX base + the
    poster compositor. Capped per account/IP; 402 once the free creatives are
    spent (the paywall). Anonymous-friendly, so it works from the hero."""
    settings = get_settings()
    sub = await _optional_sub(request)
    url, domain = _normalize(body.url)
    key = sub or f"ip:{_client_ip(request)}"

    # the paywall — one free generation (2 creatives) per account/IP
    cap = settings.campaigns_per_account
    if _cap_reached(key, cap, bucket="campaign"):
        raise HTTPException(
            status_code=402,
            detail="that's your free creatives — unlock the Campaign Studio for unlimited",
        )

    # the creatives are built from the Business DNA; the Studio page already ran
    # /studio/dna (domain-cached) before this, so it's present.
    cached = await session.get(BrandDNARow, f"domain:{domain}")
    dna = cached.payload if cached and (cached.payload or {}).get("v") == _DNA_V else None
    if dna is None:
        raise HTTPException(status_code=409, detail="analyze your site first — open the Studio")

    socket = _socket(request)
    if socket is None:
        raise HTTPException(status_code=503, detail="the Studio engine isn't configured (set GROQ_API_KEY)")

    from ..creative.campaign import generate_campaign_creatives
    from ..llm.images import SupabaseMediaStore, pick_campaign_engine

    engine = pick_campaign_engine(settings)  # free FLUX (Pollinations) bridge
    media = (
        SupabaseMediaStore(settings.supabase_url, settings.supabase_service_key)
        if settings.supabase_url and settings.supabase_service_key
        else None  # dev → data-URI creatives, no storage needed
    )
    try:
        creatives = await generate_campaign_creatives(
            socket, engine, media, dna, domain, prompt=body.prompt or None
        )
    except Exception as exc:  # noqa: BLE001 — one honest 503, never a 500
        log.warning("studio: campaign generation failed for %s: %s", domain, exc)
        raise HTTPException(status_code=503, detail="couldn't build your creatives — try again") from exc
    if not creatives:
        raise HTTPException(status_code=503, detail="couldn't build your creatives — try again")

    for _ in creatives:
        _consume_daily(key, bucket="campaign")
    remaining = max(0, cap - _daily_used(key, bucket="campaign")) if cap > 0 else None
    return {"creatives": creatives, "remaining": remaining, "domain": domain}
