"""Web-search grounding for the analysis agents.

Before the brand/audience/strategy agents reason, we fetch real, current web
context about the founder's brand AND each named competitor, then inject it into
their prompt — so the analysis names real competitors with real positioning
instead of reasoning from the founder's typed words alone.

Provider-agnostic (the WebResearcher protocol); Tavily is the default backend
(free tier, LLM-friendly snippets). Everything degrades to None on a missing key
or any error, so a run NEVER breaks because search was unavailable.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

import httpx

log = logging.getLogger("mrk18.research")


@dataclass
class SearchResult:
    query: str
    answer: str = ""
    snippets: list[str] = field(default_factory=list)


@runtime_checkable
class WebResearcher(Protocol):
    async def search(self, query: str, *, max_results: int = 3) -> SearchResult: ...

    async def fetch_page(self, url: str) -> str: ...


class TavilyResearcher:
    """Tavily web search (https://tavily.com) — free tier, returns clean snippets
    plus a synthesized answer, which is ideal to drop straight into an LLM prompt."""

    _URL = "https://api.tavily.com/search"
    _EXTRACT_URL = "https://api.tavily.com/extract"

    def __init__(self, api_key: str, *, timeout: float = 12.0) -> None:
        self._key = api_key
        self._timeout = timeout

    async def search(self, query: str, *, max_results: int = 3) -> SearchResult:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                self._URL,
                json={
                    "api_key": self._key,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": "basic",
                    "include_answer": True,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        snippets = [
            (r.get("content") or "").strip()
            for r in (data.get("results") or [])
            if r.get("content")
        ]
        return SearchResult(
            query=query, answer=(data.get("answer") or "").strip(), snippets=snippets
        )

    async def fetch_page(self, url: str) -> str:
        """Pull one page's clean text via Tavily Extract — Tavily fetches the URL
        (no SSRF on our backend). Used to read the founder's OWN website so the
        analysis + image prompts are grounded in the real product."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                self._EXTRACT_URL, json={"api_key": self._key, "urls": [url]}
            )
            resp.raise_for_status()
            data = resp.json()
        results = data.get("results") or []
        if not results:
            return ""
        return (results[0].get("raw_content") or results[0].get("content") or "").strip()


def _truncate(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


async def discover_competitors(
    researcher: WebResearcher | None,
    profile: dict,
    *,
    extract_fn,
    max_competitors: int = 4,
) -> list[str]:
    """Web-discover the brand's real competitors — no founder input needed.

    Runs a discovery search, then hands the raw results to `extract_fn` (an LLM
    call supplied by the caller) which returns clean competitor names. Returns []
    on any failure, so the caller falls back to analysis without competitors.
    """
    if researcher is None:
        return []
    company = (profile.get("company_name") or "").strip()
    website = (profile.get("website") or "").strip()
    desc = (profile.get("product_description") or "").strip()
    query = (
        f"Who are the main competitors and alternatives to {company} ({website}) in India? "
        f"{company} is: {desc[:160]}"
    ).strip()
    try:
        res = await researcher.search(query, max_results=6)
    except Exception as exc:  # noqa: BLE001 — discovery must never break a run
        log.warning("competitor discovery search failed: %s", exc)
        return []
    context = (res.answer + "\n\n" + "\n".join(res.snippets[:6])).strip()
    if not context:
        return []
    try:
        names = await extract_fn(context)
    except Exception as exc:  # noqa: BLE001
        log.warning("competitor name extraction failed: %s", exc)
        return []
    seen: set[str] = set()
    out: list[str] = []
    for n in names or []:
        name = (n or "").strip()
        key = name.lower()
        if not name or key in seen or (company and company.lower() in key):
            continue
        seen.add(key)
        out.append(name)
    return out[:max_competitors]


async def fetch_brand_page(
    researcher: WebResearcher | None, profile: dict, *, max_chars: int = 2200
) -> str | None:
    """Read the founder's OWN website (their product page) so the analysis AND the
    image prompts are grounded in the real product — its actual look, features, words.
    Degrades to None on no researcher / no fetch capability / any error."""
    if researcher is None:
        return None
    fetch = getattr(researcher, "fetch_page", None)
    if fetch is None:
        return None
    website = (profile.get("website") or "").strip()
    if not website:
        return None
    url = website if website.startswith(("http://", "https://")) else f"https://{website}"
    try:
        content = await fetch(url)
    except Exception as exc:  # noqa: BLE001 — a site fetch must never break a run
        log.warning("brand page fetch failed for %s: %s", url, exc)
        return None
    return _truncate(content, max_chars) if content else None


async def gather_market_research(
    researcher: WebResearcher | None,
    profile: dict,
    *,
    competitors: list[str] | None = None,
    max_competitors: int = 3,
    brand_page: str | None = None,
) -> str | None:
    """Search the brand + each competitor and render ONE prompt block.

    `competitors` overrides the founder's list — pass web-discovered names here.
    Returns None when there's no researcher or nothing usable came back. Searches
    run concurrently.
    """
    if researcher is None:
        return None

    company = (profile.get("company_name") or "").strip()
    website = (profile.get("website") or "").strip()
    if competitors is None:
        competitors = [c for c in (profile.get("top_competitors") or []) if isinstance(c, str)]
    competitors = [c.strip() for c in competitors if c and c.strip()][:max_competitors]

    # (kind, name, query, max_results)
    plan: list[tuple[str, str, str, int]] = [
        ("brand", company or website, f"{company} {website} India marketing positioning recent news".strip(), 3)
    ]
    for c in competitors:
        plan.append(("competitor", c, f"{c} India product positioning target customers pricing", 2))

    results = await asyncio.gather(
        *(researcher.search(q, max_results=n) for _, _, q, n in plan),
        return_exceptions=True,
    )

    blocks: list[str] = []
    for (kind, name, _q, _n), res in zip(plan, results):
        if isinstance(res, BaseException):
            log.warning("web search failed for %r: %s", name, res)
            continue
        if res is None:
            continue
        body = (res.answer or " ".join(res.snippets[:2])).strip()
        if not body:
            continue
        label = "Your brand" if kind == "brand" else f"Competitor — {name}"
        blocks.append(f"## {label}\n{_truncate(body, 480)}")

    # The founder's OWN website leads the block — it's the most authoritative source
    # on the real product (look, features, positioning) for grounding.
    if brand_page:
        blocks.insert(
            0, f"## The brand's own website (their real product page)\n{_truncate(brand_page, 1200)}"
        )

    if not blocks:
        return None

    header = (
        "WEB RESEARCH — real, current results retrieved for THIS run; the competitors "
        "below were DISCOVERED via web search (not named by the founder). Ground your "
        'claims in this and cite anything you use as source "web". You MUST name and '
        "analyze EACH competitor below — their positioning, who they target, and how "
        "this founder should differentiate. Do not skip any."
    )
    return header + "\n\n" + "\n\n".join(blocks)
