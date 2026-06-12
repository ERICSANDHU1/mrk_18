"""The three analysis agents + synthesizer (Layer 2/3).

Each agent is a plain async function: profile in → validated ReportSection
out, through the model socket. No LangChain chains, no free-text parsing.

Source honesty rule (the zero-hallucination discipline): agents have no web
access in this slice, so every claim must be sourced either from the
founder's own intake ("intake:<field>") at HIGH confidence, or from general
model knowledge ("model-knowledge") at MEDIUM/LOW — never invented specifics.
"""

import json

from pydantic import BaseModel, Field

from ..llm.socket import AgentRole, LLMSocket, Usage
from ..schemas.report import ReportSection

SOURCE_RULES = (
    "SOURCE RULES (strict): you have NO web access. For every claim set "
    "`source` to either 'intake:<field_name>' (something the founder said — "
    "confidence high) or 'model-knowledge' (general industry knowledge — "
    "confidence medium, or low if you are unsure). NEVER invent specific "
    "statistics, prices, or named reports. If something would need fresh "
    "research, state it as low confidence."
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
        "competitive picture around their named competitors. Produce a tight "
        "summary and 4-8 claims."
    ),
    AgentRole.AUDIENCE: (
        "You are MRK18's Audience & Positioning agent. Sharpen WHO the "
        "founder should target (from their ICP), what that audience actually "
        "cares about, and how to position against each named competitor "
        "without attacking anyone. Produce a tight summary and 4-8 claims."
    ),
    AgentRole.STRATEGY: (
        "You are MRK18's Content Strategy agent. Recommend content angles, "
        "hooks, platform mix and cadence for the founder's goal and budget, "
        "specific to the platforms they selected. Produce a tight summary "
        "and 4-8 claims."
    ),
}


class SynthesisOut(BaseModel):
    synthesis: str = Field(min_length=50, description="The CMO's verdict, 150-300 words")


def _profile_brief(profile: dict, founder_flags: list[str]) -> str:
    brief = json.dumps(profile, ensure_ascii=False)
    flags = (
        "\n\nTHE FOUNDER DISAGREED with the previous analysis on these points — "
        "take them seriously and address each one explicitly:\n- " + "\n- ".join(founder_flags)
        if founder_flags
        else ""
    )
    return f"Founder intake (verbatim):\n{brief}{flags}"


async def run_analysis_agent(
    socket: LLMSocket, role: AgentRole, profile: dict, founder_flags: list[str]
) -> tuple[ReportSection, Usage]:
    system = f"{AGENT_PROMPTS[role]}\n\n{SOURCE_RULES}\n\n{INDIA_LENS}"
    return await socket.complete(role, system, _profile_brief(profile, founder_flags), ReportSection)


async def run_synthesis(
    socket: LLMSocket,
    profile: dict,
    sections: dict[str, dict],
    founder_flags: list[str],
) -> tuple[SynthesisOut, Usage]:
    system = (
        "You are MRK18, the AI CMO — bitter truth, India-first, no fluff. "
        "Merge the three analyses below into ONE verdict for the founder: "
        "what is actually true about their situation, the single most "
        "important next move, and why. 150-300 words, direct address "
        "('your', not 'the founder'). " + INDIA_LENS
    )
    user = (
        f"{_profile_brief(profile, founder_flags)}\n\n"
        f"MARKET INTEL:\n{json.dumps(sections['market_intel'], ensure_ascii=False)}\n\n"
        f"AUDIENCE & POSITIONING:\n{json.dumps(sections['audience'], ensure_ascii=False)}\n\n"
        f"CONTENT STRATEGY:\n{json.dumps(sections['strategy'], ensure_ascii=False)}"
    )
    return await socket.complete(AgentRole.SYNTHESIS, system, user, SynthesisOut)
