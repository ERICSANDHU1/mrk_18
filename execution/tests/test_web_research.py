"""Web-search grounding: the analysis gets real context on the brand + EACH
named competitor, and never breaks a run when search is unavailable."""

from mrk18_execution.research.web import (
    SearchResult,
    discover_competitors,
    fetch_brand_page,
    gather_market_research,
)

PROFILE = {
    "company_name": "GridSense",
    "website": "gridsense.energy",
    "top_competitors": ["Schneider EcoStruxure", "Smarter Dharma", "in-house Excel"],
}


class StubResearcher:
    """No network — returns canned answers keyed by a substring of the query."""

    def __init__(self, by_substr: dict | None = None, fail_on: set | None = None):
        self.by_substr = by_substr or {}
        self.fail_on = fail_on or set()
        self.queries: list[str] = []

    async def search(self, query: str, *, max_results: int = 3) -> SearchResult:
        self.queries.append(query)
        for needle in self.fail_on:
            if needle in query:
                raise RuntimeError("search boom")
        for needle, answer in self.by_substr.items():
            if needle in query:
                return SearchResult(query=query, answer=answer)
        return SearchResult(query=query, answer="generic context")

    async def fetch_page(self, url: str) -> str:
        self.fetched = url
        return f"PRODUCT PAGE ({url}): a polished silver teardrop pendant on a leather cord."


# ----------------------------- brand-page (Level 1) ----------------------------


async def test_fetch_brand_page_reads_the_founders_site():
    sr = StubResearcher()
    page = await fetch_brand_page(sr, {"website": "limitless.ai"})
    assert page and "teardrop" in page
    assert sr.fetched == "https://limitless.ai"  # normalised to https


async def test_fetch_brand_page_degrades():
    assert await fetch_brand_page(None, {"website": "x.in"}) is None  # no researcher
    assert await fetch_brand_page(StubResearcher(), {"website": ""}) is None  # no site

    class NoFetch:
        async def search(self, q, *, max_results=3):
            return SearchResult(query=q)

    assert await fetch_brand_page(NoFetch(), {"website": "x.in"}) is None  # no fetch capability


async def test_brand_page_leads_the_research_block():
    sr = StubResearcher(by_substr={"GridSense": "competitor ctx"})
    block = await gather_market_research(
        sr, PROFILE, competitors=[], brand_page="REAL PRODUCT: a silver teardrop pendant on a cord."
    )
    assert "The brand's own website" in block
    assert "silver teardrop" in block


async def test_degrades_without_researcher():
    assert await gather_market_research(None, PROFILE) is None


async def test_names_every_competitor_and_brand():
    sr = StubResearcher(
        by_substr={
            "GridSense": "GridSense does no-capex energy monitoring",
            "Schneider": "Schneider sells EcoStruxure hardware projects",
            "Smarter Dharma": "Smarter Dharma does sustainability consulting",
            "Excel": "Excel is manual in-house tracking",
        }
    )
    block = await gather_market_research(sr, PROFILE)
    assert block is not None
    for comp in PROFILE["top_competitors"]:
        assert comp in block, f"{comp} missing from research block"
    assert "## Your brand" in block
    assert 'source "web"' in block  # the cite instruction survives


async def test_one_failed_search_does_not_break_the_rest():
    sr = StubResearcher(
        by_substr={"GridSense": "brand ctx", "Smarter Dharma": "sd ctx", "Excel": "excel ctx"},
        fail_on={"Schneider"},
    )
    block = await gather_market_research(sr, PROFILE)
    assert block is not None
    assert "Smarter Dharma" in block
    assert "Schneider EcoStruxure" not in block  # the failed one is simply absent


async def test_caps_competitors_at_max():
    profile = {**PROFILE, "top_competitors": ["A", "B", "C", "D", "E"]}
    sr = StubResearcher()
    await gather_market_research(sr, profile, max_competitors=3)
    assert len(sr.queries) == 4  # 1 brand + 3 competitors


async def test_gather_uses_explicit_competitors_over_profile():
    # the discovered list (passed explicitly) wins over the founder's field
    sr = StubResearcher(by_substr={"GridSense": "brand ctx", "Zeta": "zeta ctx"})
    block = await gather_market_research(sr, PROFILE, competitors=["Zeta"])
    assert block is not None
    assert "Zeta" in block
    assert "Schneider EcoStruxure" not in block  # the profile's list is ignored


# ----------------------------- competitor discovery ----------------------------

DISCOVER_PROFILE = {
    "company_name": "GridSense",
    "website": "gridsense.energy",
    "product_description": "AI energy monitoring for Indian factories, zero capex.",
}


async def test_discover_extracts_names_and_drops_own_brand():
    sr = StubResearcher(by_substr={"competitors and alternatives": "context about rivals"})

    async def extract(_context: str) -> list[str]:
        return ["Schneider EcoStruxure", "Smarter Dharma", "GridSense"]  # own brand included

    names = await discover_competitors(sr, DISCOVER_PROFILE, extract_fn=extract)
    assert "Schneider EcoStruxure" in names
    assert "Smarter Dharma" in names
    assert "GridSense" not in names  # own brand filtered out


async def test_discover_degrades_without_researcher():
    async def extract(_c: str) -> list[str]:
        return ["X"]

    assert await discover_competitors(None, DISCOVER_PROFILE, extract_fn=extract) == []


async def test_discover_survives_extraction_failure():
    sr = StubResearcher()

    async def boom(_context: str) -> list[str]:
        raise RuntimeError("llm down")

    assert await discover_competitors(sr, DISCOVER_PROFILE, extract_fn=boom) == []


async def test_discover_caps_at_max():
    sr = StubResearcher()

    async def extract(_c: str) -> list[str]:
        return ["A", "B", "C", "D", "E", "F"]

    names = await discover_competitors(sr, DISCOVER_PROFILE, extract_fn=extract, max_competitors=4)
    assert len(names) == 4


async def test_all_empty_results_returns_none():
    class Empty:
        async def search(self, query: str, *, max_results: int = 3) -> SearchResult:
            return SearchResult(query=query, answer="", snippets=[])

    assert await gather_market_research(Empty(), PROFILE) is None
