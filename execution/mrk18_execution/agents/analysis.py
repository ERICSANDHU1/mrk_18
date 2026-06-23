"""The three analysis agents + synthesizer (Layer 2/3).

Each agent is a plain async function: profile in → validated ReportSection
out, through the model socket. No LangChain chains, no free-text parsing.

Source honesty rule (the zero-hallucination discipline): every claim is sourced —
"intake:<field>" (the founder's own words, HIGH), "web" (ONLY facts that appear in
the injected web research), or "model-knowledge" (MEDIUM/LOW). Never invent
specifics, and NEVER name a competitor that isn't in the intake or the web research.
"""

import json

from pydantic import BaseModel, Field

from ..llm.socket import AgentRole, LLMSocket, Usage
from ..schemas.report import ReportSection

SOURCE_RULES = (
    "SOURCE RULES (strict). For EVERY claim set `source` to ONE of: "
    "'intake:<field_name>' (a value the founder LITERALLY stated — high); "
    "'web' (a fact that actually appears in the WEB RESEARCH block below, if one "
    "is present — high/medium); 'experience' (a precedent from the REAL CAMPAIGN "
    "CASES block, if present — high/medium); or 'model-knowledge' (general industry "
    "knowledge — medium, low if unsure). NEVER tag a claim 'web' or 'experience' "
    "unless that exact fact is in the corresponding block. A number the founder "
    "did NOT give (a competitor's "
    "price, a market size, a churn %) is NEVER 'intake:'. NEVER invent specific "
    "statistics, prices, or named reports.\n"
    "COMPETITORS: name a competitor ONLY if it appears in the founder's intake or "
    "the WEB RESEARCH block. If NEITHER names any competitor, say so plainly (e.g. "
    "'no specific competitor surfaced — position on the category problem itself') "
    "and DO NOT invent company names. A made-up competitor is a critical, "
    "trust-destroying error.\n"
    "DISTINCT CLAIMS: every claim must make a DIFFERENT point. Never restate the "
    "same idea in new words — if you only have 3 real insights, return 3 claims."
)

# The single most trust-critical rule for a "never makes things up" CMO.
# Used by synthesis + content generation, which (unlike the analysis agents)
# have no per-claim source field to keep them honest.
NO_FABRICATION = (
    "GROUNDING (non-negotiable): do NOT invent specific numbers the founder "
    "did not provide — no prices, no discount amounts, no coupon/promo codes, "
    "no percentages or statistics stated as fact, no spend figures. You may "
    "use a number ONLY if it appears in the founder's intake or the analysis "
    "above. If a figure would help but you don't have it, either leave it out "
    "or name it as the founder's call to make (e.g. 'price your launch offer "
    "to clear stock' — never a specific rupee value you made up). A fabricated "
    "price or promo code in a founder's post is the worst error you can make. "
    "Likewise NEVER name a competitor or brand that is not in the analysis above "
    "or the founder's intake — no invented company names, ever."
)

INDIA_LENS = (
    "Always reason India-first: INR budgets, Tier-1/2/3 dynamics, Indian "
    "buyer behaviour, the founder's actual stage. Be direct and concrete — "
    "bitter truth over comfort, but point it at the data, never at named "
    "third parties."
)

AGENT_PROMPTS: dict[AgentRole, str] = {
    AgentRole.MARKET_INTEL: (
        "You are MRK18's Market Intelligence agent. Analyze the founder's "
        "market: category dynamics, demand signals, pricing context, and the "
        "competitive picture — naming and comparing ONLY the competitors that "
        "actually appear in the web research or intake (never invented; if none "
        "surfaced, say so and focus on the category problem). Be specific and "
        "concrete — every claim a sharp, grounded insight, never generic filler. "
        "Produce a tight summary and 3-6 DISTINCT claims (fewer is fine — no repetition)."
    ),
    AgentRole.AUDIENCE: (
        "You are MRK18's Audience & Positioning agent. Sharpen WHO the "
        "founder should target (from their ICP), what that audience actually "
        "cares about, and how to position against the competitors surfaced in "
        "the research (if any) — without attacking anyone and without inventing "
        "competitors. Be specific: a concrete persona and a positioning line they "
        "could actually use, not generic segments. Produce a tight summary and 3-6 "
        "DISTINCT claims."
    ),
    AgentRole.STRATEGY: (
        "You are MRK18's Content Strategy agent. Build an ACTIONABLE plan the founder "
        "could execute on Monday — not high-level angles. Be concrete: the posting "
        "cadence (which days, how often), the creative FORMATS (carousel, thread, reel, "
        "founder-POV post), the actual hooks to use, and how to split effort across the "
        "platforms they selected. Every claim is a SPECIFIC, executable move with the "
        "platform and the 'how' attached — never a generic best-practice or a restated "
        "value proposition. Produce a tight summary and 3-6 DISTINCT claims (each a "
        "different concrete move — no repetition)."
    ),
}


class SynthesisOut(BaseModel):
    synthesis: str = Field(min_length=50, description="The CMO's verdict, 150-300 words")


def _profile_brief(
    profile: dict,
    founder_flags: list[str],
    performance_memo: str | None = None,
    company_knowledge: str | None = None,
    web_research: str | None = None,
    experience: str | None = None,
) -> str:
    brief = json.dumps(profile, ensure_ascii=False)
    flags = (
        "\n\nTHE FOUNDER DISAGREED with the previous analysis on these points — "
        "take them seriously and address each one explicitly:\n- " + "\n- ".join(founder_flags)
        if founder_flags
        else ""
    )
    # Slice 3.2 — measured lessons ride along; a memo claim counts as sourced
    # data (it IS measurement), but flags still outrank it
    memo = f"\n\n{performance_memo}" if performance_memo else ""
    # Slice 3.3 — the founder's own documents ground the analysis
    knowledge = f"\n\n{company_knowledge}" if company_knowledge else ""
    # Web-search grounding — real, current context on the brand + competitors
    research = f"\n\n{web_research}" if web_research else ""
    # RAG Tier 1/2 — shared experience base (real campaign cases) to reason FROM
    exp = f"\n\n{experience}" if experience else ""
    return f"Founder intake (verbatim):\n{brief}{flags}{memo}{knowledge}{research}{exp}"


async def run_analysis_agent(
    socket: LLMSocket,
    role: AgentRole,
    profile: dict,
    founder_flags: list[str],
    performance_memo: str | None = None,
    company_knowledge: str | None = None,
    web_research: str | None = None,
    experience: str | None = None,
) -> tuple[ReportSection, Usage]:
    system = f"{AGENT_PROMPTS[role]}\n\n{SOURCE_RULES}\n\n{INDIA_LENS}"
    return await socket.complete(
        role,
        system,
        _profile_brief(
            profile, founder_flags, performance_memo, company_knowledge, web_research, experience
        ),
        ReportSection,
    )


async def run_synthesis(
    socket: LLMSocket,
    profile: dict,
    sections: dict[str, dict],
    founder_flags: list[str],
    performance_memo: str | None = None,
    company_knowledge: str | None = None,
    web_research: str | None = None,
    experience: str | None = None,
) -> tuple[SynthesisOut, Usage]:
    system = (
        "You are MRK18, the AI CMO — bitter truth, India-first, no fluff. "
        "Merge the three analyses below into ONE sharp verdict. Do NOT restate the "
        "founder's inputs back to them ('your ICP is…', 'your goal is…') — they know "
        "their business; tell them what they DON'T see. Name the one thing that is "
        "actually true about their situation, then COMMIT to the single most important "
        "next move — a specific, concrete action for THIS week (the offer, the angle, "
        "the channel, the thing to stop). End on that decision, not a summary. Sound "
        "like a senior CMO who has decided, not a consultant listing options. 150-300 "
        "words, direct address ('your', not 'the founder'). " + INDIA_LENS + " " + NO_FABRICATION
    )
    user = (
        f"{_profile_brief(profile, founder_flags, performance_memo, company_knowledge, web_research, experience)}\n\n"
        f"MARKET INTEL:\n{json.dumps(sections['market_intel'], ensure_ascii=False)}\n\n"
        f"AUDIENCE & POSITIONING:\n{json.dumps(sections['audience'], ensure_ascii=False)}\n\n"
        f"CONTENT STRATEGY:\n{json.dumps(sections['strategy'], ensure_ascii=False)}"
    )
    return await socket.complete(AgentRole.SYNTHESIS, system, user, SynthesisOut)
