"""Ad-content harness — the FULL web-research-grounded chain, on the Brain.

    founder + website
       │
       ├─ Tavily: fetch the brand's OWN site (brand_page) + competitor research
       │
       ├─ analysis adapters (GROUNDED in that research) → market intel · audience
       │   · strategy → synthesis (the CMO verdict)            [= the report]
       │
       └─ ad_copy adapter → LinkedIn · X · Instagram posts, each with an
           image_prompt grounded in the REAL product page

    cd execution
    .venv\\Scripts\\python.exe scripts\\content_debug.py
    .venv\\Scripts\\python.exe scripts\\content_debug.py --website sleepyowl.co --company "Sleepy Owl"
    BRAIN_BASE_URL= .venv\\Scripts\\python.exe scripts\\content_debug.py   # force Groq (free)
"""

import argparse
import asyncio
import sys
from uuid import uuid4

sys.stdout.reconfigure(encoding="utf-8")

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from mrk18_execution.agents.analysis import run_analysis_agent, run_synthesis  # noqa: E402
from mrk18_execution.agents.content import generate_item  # noqa: E402
from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.llm.socket import (  # noqa: E402
    AgentRole,
    LLMSocket,
    brain_registry,
    default_registry,
)
from mrk18_execution.research.web import (  # noqa: E402
    TavilyResearcher,
    fetch_brand_page,
    gather_market_research,
)
from mrk18_execution.schemas.enums import Platform  # noqa: E402

# A real Indian D2C brand by default — a fetchable site so the web research +
# image grounding actually have something to bite on. Override via --website.
DEFAULT_PROFILE = {
    "company_name": "Sleepy Owl Coffee",
    "website": "sleepyowl.co",
    "product_description": (
        "Cold brew coffee bags, instant coffee and brew kits delivered to your door "
        "— good café-grade coffee at home or your desk, no machine, no barista."
    ),
    "icp": "22-35 yr urban professionals and students who want good coffee at home/work without the effort or the cost of a café.",
    "top_competitors": ["Blue Tokai", "Rage Coffee", "Country Bean"],
    "tone": "playful, modern, a little cheeky — never corporate",
    "primary_goal": "signups",
    "monthly_spend_inr": 60000,
    "target_platforms": ["linkedin", "x", "instagram"],
}


def _show_section(title, section) -> None:
    print(f"\n   ── {title} ──\n   {section.summary}")
    for c in section.claims[:4]:
        print(f"     • [{c.confidence}] {c.text[:150]}")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--website")
    ap.add_argument("--company")
    args = ap.parse_args()

    profile = dict(DEFAULT_PROFILE)
    if args.website:
        profile["website"] = args.website
    if args.company:
        profile["company_name"] = args.company

    s = get_settings()
    researcher = TavilyResearcher(s.tavily_api_key) if s.tavily_api_key else None

    # ── 1. WEB RESEARCH — the brand's own site + competitor context ──────────
    print(f"{'=' * 74}\n  {profile['company_name']} — {profile['website']}\n{'=' * 74}")
    print("\n>> 1/3  WEB RESEARCH (Tavily)")
    brand_page = await fetch_brand_page(researcher, profile)
    web_research = await gather_market_research(
        researcher, profile, competitors=profile["top_competitors"], brand_page=brand_page
    )
    if brand_page:
        print(f"   brand page fetched ({len(brand_page)} chars): {brand_page[:200].strip()}…")
    else:
        print("   no brand page (no Tavily key / unreachable) — image grounding will be generic")
    print(f"   competitor + brand research block: {'YES' if web_research else 'none'}")

    if s.brain_base_url:
        reg = brain_registry(s.brain_base_url, s.brain_api_key, s.brain_base_model)
        print("\n>> model: the BRAIN (your trained adapters on RunPod)")
    else:
        reg = default_registry(s.groq_api_key)
        print("\n>> model: Groq fallback (free)")
    socket = LLMSocket(reg)

    # ── 2. ANALYSIS — grounded in the web research → the report ──────────────
    print("\n>> 2/3  ANALYSIS (grounded in the research)")
    sections: dict[str, dict] = {}
    for role, key in (
        (AgentRole.MARKET_INTEL, "market_intel"),
        (AgentRole.AUDIENCE, "audience"),
        (AgentRole.STRATEGY, "strategy"),
    ):
        section, _u = await run_analysis_agent(
            socket, role, profile, [], web_research=web_research
        )
        sections[key] = section.model_dump(mode="json")
        _show_section(key.upper(), section)
    synth, _u = await run_synthesis(socket, profile, sections, [], web_research=web_research)
    print(f"\n   ── CMO VERDICT ──\n   {synth.synthesis}")

    report = {
        "content_strategy": sections["strategy"],
        "synthesis": synth.synthesis,
        "market_intel": sections["market_intel"],
        "audience_positioning": sections["audience"],
    }

    # ── 3. AD CONTENT — 3 platforms, each with a grounded image prompt ───────
    print(f"\n>> 3/3  AD CONTENT — 3 platforms\n{'=' * 74}")
    for platform in (Platform.LINKEDIN, Platform.X, Platform.INSTAGRAM):
        print(f"\n================= {platform.value.upper()} =================")
        try:
            item, _usages = await generate_item(
                socket, str(uuid4()), profile, report, platform, brand_page=brand_page
            )
            if item.thread:
                for i, seg in enumerate(item.thread, 1):
                    print(f"  {i}/{len(item.thread)}: {seg}")
            else:
                print(f"BODY:\n{item.body}")
            if item.first_comment:
                print(f"\nFIRST COMMENT: {item.first_comment}")
            print(f"\nIMAGE PROMPT:\n{item.image_prompt}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED: {type(exc).__name__}: {str(exc)[:400]}")


asyncio.run(main())
