"""Company Brain builder — at onboarding, analyse the founder's business on the
FREE model and ingest the result into their RAG store, so the paid Brain chat is
grounded from message one.

Runs the taster verdict (USP · competition · GTM · insights) + the Business DNA
(grounded copy + real Brandfetch kit) on the founder's site, assembles one
document, and chunks + embeds it (BGE-M3) into the Company Brain under
source='business_analysis'. Re-running replaces that source (fresh analysis).
"""

import logging

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..llm.socket import LLMSocket
from ..rag import store
from .brand_dna import extract_brand_copy

log = logging.getLogger("mrk18.company_brain")

SOURCE = "business_analysis"


def _fmt_card(name: str, card: dict) -> str:
    if not isinstance(card, dict):
        return ""
    lines = [f"{name} — {str(card.get('verdict') or '').strip()}"]
    score = card.get("score")
    if isinstance(score, (int, float)):
        lines[0] += f" (CMO grade {int(score)}/100)"
    if card.get("motion") or card.get("primary_channel"):
        lines.append(f"  Motion: {card.get('motion', '')} → {card.get('primary_channel', '')}")
    for r in card.get("rivals") or []:
        if isinstance(r, dict) and r.get("name"):
            lines.append(f"  Rival — {r['name']}: {r.get('lane', '')}")
    for p in (card.get("points") or [])[:6]:
        lines.append(f"  - {p}")
    return "\n".join(lines)


def _document(company: str, domain: str, offer: str, verdict: dict, extras: dict,
              competitors: list, copy, kit: dict) -> str:
    kit = kit or {}
    parts = [
        f"BUSINESS ANALYSIS — {company} ({domain})",
        f"What they do: {offer}" if offer else "",
        "",
        "BUSINESS DNA",
        f"Overview: {copy.business_overview}",
        f"Tagline: {copy.tagline}" if copy.tagline else "",
        f"Brand voice/tone: {', '.join(copy.tone_tags)}" if copy.tone_tags else "",
        f"Brand values: {', '.join(copy.brand_values)}" if copy.brand_values else "",
        f"Brand aesthetic: {', '.join(copy.aesthetic_tags)}" if copy.aesthetic_tags else "",
        f"Brand colours: {', '.join(kit.get('colors') or [])}" if kit.get("colors") else "",
        f"Brand fonts: {kit.get('heading_font', '')} / {kit.get('body_font', '')}" if kit.get("heading_font") else "",
        "",
        "CMO VERDICT",
        f"Positioning line the CMO would run: {extras.get('positioning', '')}" if extras.get("positioning") else "",
        _fmt_card("USP", verdict.get("usp", {})),
        _fmt_card("Competition", verdict.get("differentiation", {})),
        _fmt_card("Go-to-market", verdict.get("gtm", {})),
        f"Competitors found (live web search): {', '.join(competitors)}" if competitors else "",
        "",
        "KEY INSIGHTS:\n" + "\n".join(f"- {x}" for x in extras.get("key_insights") or []),
        "QUICK WINS (this week):\n" + "\n".join(f"- {x}" for x in extras.get("quick_wins") or []),
    ]
    return "\n".join(p for p in parts if p is not None and p != "")


async def build_company_brain(
    session: AsyncSession, socket: LLMSocket, engine, founder_id, url: str
) -> dict:
    """Analyse the founder's site (free model) → ingest into their Company Brain.
    `engine` is the embedding engine (BGE-M3). Returns the ingest summary."""
    settings = get_settings()
    if engine is None:
        raise ValueError("no embedding engine configured (set CF_ACCOUNT_ID / CF_API_TOKEN)")

    # reuse the taster's headless pieces — same free-model analysis as the public taster
    from ..research.brandfetch import fetch_brand_kit
    from ..research.web import TavilyResearcher
    from ..api.taster import (
        _MINI_MODEL, _SITE_CHAR_CAP, _combined_call, _gather_context, _normalize, _resolve_engine,
    )

    _, domain = _normalize(url)
    if not settings.tavily_api_key:
        raise ValueError("no TAVILY_API_KEY — can't read the site")
    researcher = TavilyResearcher(settings.tavily_api_key)
    site_text = (await researcher.fetch_page(f"https://{domain}"))[:_SITE_CHAR_CAP]
    if not site_text:
        raise ValueError("couldn't read the site")

    tengine = _resolve_engine(settings)
    if tengine is None:
        raise ValueError("no analysis engine (set GROQ_API_KEY)")
    base_url, api_key = tengine
    client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=100.0, max_retries=0)
    mini = _MINI_MODEL if not settings.taster_base_url else settings.taster_model

    # competitor research + verdict (free model)
    blocks: dict = {}
    competitors: list = []
    company, offer = domain, ""
    try:
        blocks, competitors, company, offer = await _gather_context(
            researcher, client, mini, site_text, f"https://{domain}", domain,
            settings.taster_max_competitors,
        )
    except Exception as exc:  # noqa: BLE001 — research is a bonus, never a blocker
        log.warning("company_brain: research degraded for %s: %s", domain, exc)

    from ..api.taster import TASTER_ADAPTERS
    all_blocks = "\n\n".join(blocks[c] for c in TASTER_ADAPTERS if c in blocks)
    content = f"Website: https://{domain}\n\nSITE CONTENT (untrusted page text):\n{site_text}"
    if all_blocks:
        content += f"\n\n{all_blocks}"
    verdict, extras = await _combined_call(client, settings.taster_model, content, 4000)

    # Business DNA copy + real brand kit
    copy, _usage = await extract_brand_copy(socket, site_text, f"https://{domain}", domain)
    kit = await fetch_brand_kit(domain, settings.brandfetch_api_key)

    doc = _document(company or domain, domain, offer, verdict, extras, competitors, copy, kit)
    result = await store.ingest(
        session, founder_id=founder_id, source=SOURCE, text=doc, engine=engine,
        max_chunks=settings.knowledge_max_chunks,
    )
    await session.commit()  # persist the chunks (ingest only stages them)
    log.info("company_brain: ingested %s chunks for %s", result.get("chunks"), domain)
    return {**result, "domain": domain, "company": company}
