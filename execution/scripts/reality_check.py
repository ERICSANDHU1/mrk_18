"""Reality check — what does the AI CMO ACTUALLY write, on the real model?

Every test in the suite uses a FAKE model to prove the plumbing. This script
uses the REAL one (Groq free tier) through the REAL agent prompts, so we can
read the actual marketing quality before wrapping a UI around it. No database,
no checkpointer, no app — just: realistic founder in, real CMO output out.

    cd execution
    .\\.venv\\Scripts\\python.exe scripts\\reality_check.py
"""

import asyncio
import sys
from pathlib import Path
from uuid import uuid4

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mrk18_execution.agents.analysis import run_analysis_agent, run_synthesis  # noqa: E402
from mrk18_execution.agents.content import generate_item  # noqa: E402
from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.llm.socket import AgentRole, LLMSocket, default_registry  # noqa: E402
from mrk18_execution.schemas.enums import Platform  # noqa: E402
from mrk18_execution.schemas.report import MarketingIntelligenceReport, ReportSection  # noqa: E402

# A realistic Indian early-stage founder — the kind of design partner we want.
PROFILE = {
    "company_name": "PariWala",
    "website": "https://pariwala.in",
    "product_description": (
        "A subscription app that delivers fresh, pre-portioned North-Indian "
        "meal kits (sabzi + masala + roti dough) to working professionals in "
        "Bengaluru and Pune — cook a home meal in 12 minutes, no planning."
    ),
    "icp": "25-38 yr old working professionals in metro tech hubs who want home-cooked food but have no time to plan or shop.",
    "top_competitors": ["Swiggy Instamart", "FreshMenu"],
    "tone": "warm, witty, a little desi, never corporate",
    "primary_goal": "signups",
    "monthly_spend_inr": 40000,
    "target_platforms": ["linkedin", "x"],
    "consent": {"given": True, "text_version": "v1-2026-06"},
}

ROLE_TITLES = {
    AgentRole.MARKET_INTEL: "MARKET INTELLIGENCE",
    AgentRole.AUDIENCE: "AUDIENCE & POSITIONING",
    AgentRole.STRATEGY: "CONTENT STRATEGY",
}


def banner(t):
    print(f"\n{'=' * 74}\n  {t}\n{'=' * 74}")


def show_section(title, section: ReportSection):
    print(f"\n── {title} ──")
    print(f"  {section.summary}\n")
    for c in section.claims:
        print(f"   • [{c.confidence}] {c.text}")
        print(f"       └ source: {c.source}")


async def main():
    settings = get_settings()
    if not settings.groq_api_key:
        print("GROQ_API_KEY missing — fill execution/.env")
        return
    socket = LLMSocket(default_registry(settings.groq_api_key))
    total_in = total_out = 0
    cost = 0.0

    banner(f"FOUNDER: {PROFILE['company_name']} — {PROFILE['product_description'][:60]}…")
    print("  Running the real analysis pipeline on Groq… (a few model calls)")

    # 1) the three analysis agents
    sections: dict[str, ReportSection] = {}
    for role in (AgentRole.MARKET_INTEL, AgentRole.AUDIENCE, AgentRole.STRATEGY):
        section, usage = await run_analysis_agent(socket, role, PROFILE, [])
        sections[role.value] = section
        total_in += usage.tokens_in
        total_out += usage.tokens_out
        cost += usage.cost_inr
        show_section(ROLE_TITLES[role], section)

    # 2) the synthesis — the CMO's bitter-truth verdict
    synthesis, usage = await run_synthesis(
        socket, PROFILE, {k: v.model_dump() for k, v in sections.items()}, []
    )
    total_in += usage.tokens_in
    total_out += usage.tokens_out
    cost += usage.cost_inr
    banner("THE CMO'S VERDICT (synthesis)")
    print(f"\n  {synthesis.synthesis}\n")

    # 3) assemble the report exactly like the graph does, then generate content
    report = MarketingIntelligenceReport(
        run_id=uuid4(),
        market_intel=sections["market_intel"],
        audience_positioning=sections["audience"],
        content_strategy=sections["strategy"],
        synthesis=synthesis.synthesis,
        founder_flags=[],
    ).model_dump(mode="json")

    banner("GENERATED CONTENT (what the founder would review at Gate 2)")
    for platform in (Platform.LINKEDIN, Platform.X):
        item, usages = await generate_item(socket, str(uuid4()), PROFILE, report, platform)
        for u in usages:
            total_in += u.tokens_in
            total_out += u.tokens_out
            cost += u.cost_inr
        print(f"\n── {platform.value.upper()} ({item.format.value}) ──")
        if item.thread:
            for i, seg in enumerate(item.thread, 1):
                print(f"   {i}/{len(item.thread)}: {seg}")
        else:
            print(f"   {item.body}")
        if item.first_comment:
            print(f"   [first comment] {item.first_comment}")
        print(f"   [image brief]   {(item.image_prompt or '')[:140]}…")

    banner("METER")
    print(f"  tokens: {total_in:,} in / {total_out:,} out across the full run")
    print(f"  would-be cost at paid rates: ₹{cost:.4f}  (Groq free tier billed: ₹0)")
    print("\n  ↑ Read the content above as a founder would. Is it sharp enough to ship?")


if __name__ == "__main__":
    asyncio.run(main())
