"""The live CMO voice call — the conversational half of the relationship.

When the founder taps "Call CMO", this is the brain on the other end: their AI
Chief Marketing Officer, talking in real time. Deliberately a SEPARATE,
latency-first path from the analysis pipeline — short spoken turns, grounded in
the founder's company memory, on a fast model (never the cold-start Brain on a
live call).
"""

from ..llm.socket import AgentRole, LLMSocket, Usage

_MAX_VOICE_TOKENS = 70  # ONE short spoken sentence per turn on a live call
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


def _is_registered(profile: dict) -> bool:
    """Has this user actually told us who their company is (completed onboarding)?"""
    return bool(profile.get("company_name") or profile.get("product_description"))


# What the assistant knows when the caller HASN'T registered a company yet: the
# product itself. It guides them around mrk18 instead of pretending to know a
# business it was never told about.
_MRK18_GUIDE_BRIEF = """WHAT MRK18 IS:
mrk18 is an AI Chief Marketing Officer — "a CMO in your pocket" — built for Indian
startup founders who can't yet afford a senior marketer. It thinks, plans, creates
and executes: analyses their business, finds growth leaks, drafts platform-ready
content, watches competitors, and talks to the founder like a real CMO would —
including live voice calls like this one. India-first: rupees, Indian platforms,
Indian buyer behaviour. Early access is through the Founding 500 waitlist.

THE PAGES (so you can guide people around):
- Landing page (mrk18.com) — the product story, the Founding 500 waitlist, and
  "Talk to the founder" (the founders' LinkedIn profiles).
- Onboarding — the founder registers their company (what they sell, who they serve,
  goal, budget). THIS unlocks the personal CMO: every answer becomes about THEIR
  business. It starts from the Comrk page on first visit.
- Chat — a text conversation with the CMO: positioning, content, competitors, hooks.
- Comrk — the execution desk: marketing runs, channels and connectors (Meta ads
  coming soon), and the mrk device page.
- mrk (under Comrk) — the pocket hardware device (a small companion with a face)
  launching after the Founding 500 fills; proximity networking between founders.
- Chief — the oversight room: KPIs, weekly focus, what needs the founder's decision.
- Dashboard — settings, workspace and the week's plan.
- Call CMO — this live voice call, available on every page."""


def guide_system_prompt(mode: str = "voice") -> str:
    """The assistant persona for signed-in users who haven't registered a company:
    a warm product guide that knows mrk18 and its pages inside-out."""
    if mode == "text":
        style = (
            "HOW TO WRITE:\n"
            "- Be helpful and complete but tight — a few short paragraphs at most.\n"
            "- Plain text only: no #headings, no **bold**, no tables.\n"
        )
    else:
        style = (
            "HOW TO TALK (you are spoken aloud by text-to-speech):\n"
            "- Reply in ONE or TWO short, natural sentences. It's a real conversation.\n"
            "- Contractions, plain words, warm energy. NO markdown, NO lists, NO emojis.\n"
        )
    return (
        "You are the mrk18 assistant on a live call with a visitor who hasn't set up "
        "their company yet. You know the product and every page of the site — help them "
        "understand what mrk18 is, what each page does, and where to find things.\n\n"
        + style
        + "- Answer questions about mrk18 confidently and specifically, using the brief below.\n"
        "- If they ask for personal marketing advice about THEIR business, give one quick "
        "useful thought, then tell them the real magic starts once they register their "
        "company in onboarding — that unlocks their personal CMO.\n"
        "- Never invent features, prices or numbers that aren't in the brief.\n\n"
        + _MRK18_GUIDE_BRIEF
    )


def cmo_system_prompt(profile: dict, mode: str = "voice") -> str:
    # No registered company → the mrk18 guide, not a CMO guessing at an unknown business.
    if not _is_registered(profile):
        return guide_system_prompt(mode)
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
            "- Reply in ONE short, natural sentence — a single clear point OR one question. "
            "Never more than one sentence. It's a fast back-and-forth, not a monologue.\n"
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


# ── per-slide follow-up chat on a finished run ──────────────────────────────
# Each output slide routes its follow-up to that slide's ADAPTER: the verdict is
# the orchestrator (it already synthesises the whole run), the sections go to
# their analysis seat, posts to the ad-copy seat. The socket maps AgentRole ->
# the served adapter (Brain) or the pilot Groq seat, so this works today and
# auto-upgrades when the trained Brain is wired.
_SLIDE_ROLE: dict[str, AgentRole] = {
    "verdict": AgentRole.SYNTHESIS,
    "market_intel": AgentRole.MARKET_INTEL,
    "audience": AgentRole.AUDIENCE,
    "usp": AgentRole.USP,
    "strategy": AgentRole.STRATEGY,
    "content": AgentRole.CONTENT,
}
_SLIDE_PERSONA: dict[str, str] = {
    "verdict": "the founder's AI CMO, giving the bottom-line read across their whole run",
    "market_intel": "MRK18's market-intelligence analyst",
    "audience": "MRK18's audience and positioning strategist",
    "usp": "MRK18's differentiation (USP) strategist",
    "strategy": "MRK18's content and funnel strategist",
    "content": "MRK18's ad copywriter",
}


async def ask_about_run(
    socket: LLMSocket, *, adapter: str, profile: dict, context: str, messages: list[dict]
) -> tuple[str, Usage]:
    """A follow-up chat scoped to ONE piece of a finished run, routed to that
    piece's adapter. `context` is the slide's content; `messages` is the running
    per-slide history. Returns the reply + usage."""
    role = _SLIDE_ROLE.get(adapter, AgentRole.SYNTHESIS)
    persona = _SLIDE_PERSONA.get(adapter, _SLIDE_PERSONA["verdict"])
    system = (
        f"You are {persona}, in a follow-up chat with the founder about a specific part of "
        "their just-completed CMO run. Answer ONLY what they ask, grounded in the CONTEXT "
        "below and their company. Bitter-truth CMO voice: sharp, concrete, plain language. "
        "NEVER invent numbers, prices or results you don't have — reason from judgement and "
        "say plainly when you'd need real data. A few short paragraphs at most; plain text, "
        "no markdown headings, bold or tables.\n\n"
        f"THE PART THEY'RE ASKING ABOUT:\n{context}\n\n"
        f"THEIR COMPANY MEMORY:\n{_company_brief(profile)}"
    )
    return await socket.chat(role, system, messages, max_tokens=700, temperature=0.5)


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
