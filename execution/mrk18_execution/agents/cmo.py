"""The live CMO voice call — the conversational half of the relationship.

When the founder taps "Call CMO", this is the brain on the other end: their AI
Chief Marketing Officer, talking in real time. Deliberately a SEPARATE,
latency-first path from the analysis pipeline — short spoken turns, grounded in
the founder's company memory, on a fast model (never the cold-start Brain on a
live call).
"""

from ..llm.socket import AgentRole, LLMSocket, Usage

_MAX_VOICE_TOKENS = 200  # short spoken turns on a live call
_MAX_TEXT_TOKENS = 700  # roomier replies for the text chat (can draft a full post)


def _company_brief(profile: dict) -> str:
    """A compact, spoken-friendly brief of who this founder is — so the CMO
    talks about THEIR business, not in generalities."""
    bits: list[str] = []
    if profile.get("company_name"):
        site = f" ({profile['website']})" if profile.get("website") else ""
        bits.append(f"Company: {profile['company_name']}{site}")
    if profile.get("product_description"):
        bits.append(f"What they do: {profile['product_description']}")
    if profile.get("icp"):
        bits.append(f"Who they serve: {profile['icp']}")
    if profile.get("primary_goal"):
        bits.append(f"Primary goal right now: {profile['primary_goal']}")
    if profile.get("monthly_spend_inr"):
        bits.append(f"Monthly marketing budget: ₹{profile['monthly_spend_inr']:,}")
    platforms = profile.get("target_platforms") or []
    if platforms:
        bits.append(f"Publishes on: {', '.join(str(p) for p in platforms)}")
    comps = [c for c in (profile.get("top_competitors") or []) if c]
    if comps:
        bits.append(f"Competitors: {', '.join(str(c) for c in comps[:5])}")
    return "\n".join(bits) if bits else "No company memory captured yet — ask the founder about their business."


def cmo_system_prompt(profile: dict, mode: str = "voice") -> str:
    tone = profile.get("tone", "direct, warm")
    company = profile.get("company_name", "this founder's company")
    if mode == "text":
        channel = (
            f"You are the AI Chief Marketing Officer for {company} — in a TEXT CHAT "
            "with the founder right now. You're their senior marketing partner: sharp, warm, "
            "decisive, and genuinely invested in their growth.\n\n"
            "HOW TO WRITE (the founder reads your replies, so you can go fuller than a spoken turn):\n"
            "- Be genuinely useful and complete, but tight — a few short paragraphs at most, never a wall of text.\n"
            "- When they ask you to write something (a post, hook, caption, subject line, ad), "
            "actually DRAFT it in full, ready to copy-paste — not a description of it.\n"
            "- Plain text only: short paragraphs and simple '- ' dashes for lists. "
            "No #headings, no **bold**, no tables — it renders as plain text.\n"
            f"- Match their brand voice: {tone}.\n"
        )
    else:
        channel = (
            f"You are the AI Chief Marketing Officer for {company} — on a LIVE VOICE CALL "
            "with the founder right now. You're their senior marketing partner: sharp, warm, "
            "decisive, and genuinely invested in their growth.\n\n"
            "HOW TO TALK (you are spoken aloud by a text-to-speech voice, not written):\n"
            "- Keep every turn SHORT: 1 to 3 sentences. It's a conversation, not a memo.\n"
            "- Talk like a real person on a call: contractions, plain words, warm energy.\n"
            "- NO markdown, NO bullet points, NO emojis, NO headings, NO numbered lists.\n"
            f"- Match their brand voice: {tone}.\n"
        )
    return (
        channel
        + "- Be useful fast: give a clear point of view or one concrete next step, then ask "
        "ONE good question to keep the conversation moving.\n"
        "- Ground everything in THEIR business below — their product, their customer, their "
        "goal. Never generic marketing fluff.\n"
        "- India-first: rupees, Indian platforms and buyer behaviour.\n"
        "- NEVER invent specific numbers, prices, stats or results you don't have. Speak "
        "from judgement, and say plainly when you'd need real data to be sure.\n"
        "- You ARE their AI CMO — be naturally, confidently yourself; no need to pretend "
        "otherwise.\n\n"
        f"THEIR COMPANY MEMORY:\n{_company_brief(profile)}"
    )


async def cmo_reply(
    socket: LLMSocket, *, profile: dict, messages: list[dict], mode: str = "voice"
) -> tuple[str, Usage]:
    """One CMO turn. `messages` is the running history as [{role, content}].
    `mode` is "voice" (short spoken turns — the live call, default) or "text" (the
    full-page chat: fuller, copy-pasteable, plain-text replies). Returns the reply
    + token usage. Uses the personality seat — on the fast socket that's Groq, so
    no cold start mid-turn."""
    system = cmo_system_prompt(profile, mode)
    max_tokens = _MAX_TEXT_TOKENS if mode == "text" else _MAX_VOICE_TOKENS
    return await socket.chat(
        AgentRole.SYNTHESIS, system, messages, max_tokens=max_tokens, temperature=0.6
    )
