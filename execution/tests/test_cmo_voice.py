"""The live CMO voice call — grounded, spoken-style, fast-path replies."""

from mrk18_execution.agents.cmo import _company_brief, cmo_reply, cmo_system_prompt
from mrk18_execution.llm.socket import AgentRole, Usage

PROFILE = {
    "company_name": "Limitless Pendant",
    "website": "limitless.ai",
    "product_description": "A wearable AI pendant that records and summarises conversations.",
    "icp": "Founders in back-to-back meetings.",
    "tone": "bold, technical, premium",
    "primary_goal": "signups",
    "monthly_spend_inr": 150000,
    "target_platforms": ["linkedin", "x"],
    "top_competitors": ["Otter.ai", "Plaud"],
}


class FakeSocket:
    """Captures the chat() call so we can assert grounding + params, no network."""

    def __init__(self, reply: str = "Lead with the outcome, not the hardware. What's converting best right now?"):
        self.reply = reply
        self.seen: dict | None = None

    async def chat(self, role, system, messages, *, max_tokens=220, temperature=0.6):
        self.seen = {
            "role": role,
            "system": system,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        return self.reply, Usage(role.value, "fake", 10, 8)


def test_company_brief_grounds_in_the_real_business():
    brief = _company_brief(PROFILE)
    assert "Limitless Pendant" in brief
    assert "signups" in brief
    assert "₹150,000" in brief  # rupee budget, Indian formatting
    assert "Otter.ai" in brief


def test_company_brief_handles_empty_profile():
    assert "No company memory" in _company_brief({})


def test_system_prompt_is_spoken_style_and_grounded():
    sys = cmo_system_prompt(PROFILE)
    assert "LIVE VOICE CALL" in sys
    assert "1 to 3 sentences" in sys  # short spoken turns
    assert "NO markdown" in sys  # TTS-friendly
    assert "Limitless Pendant" in sys  # the company brief is embedded


async def test_cmo_reply_uses_personality_seat_and_short_turns():
    sock = FakeSocket()
    reply, usage = await cmo_reply(
        sock, profile=PROFILE, messages=[{"role": "user", "content": "Hey, where do I start?"}]
    )
    assert reply == sock.reply
    assert sock.seen["role"] == AgentRole.SYNTHESIS  # the personality / CMO seat
    assert sock.seen["max_tokens"] <= 220  # capped to short spoken turns
    assert "Limitless Pendant" in sock.seen["system"]  # grounded in their business
    assert usage.role == AgentRole.SYNTHESIS.value
