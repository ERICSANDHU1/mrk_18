"""Public follow-up chat on the taster verdict (POST /taster/chat).

The LLM call is faked, so these pin the walls that matter: the per-IP daily
cap, the last-message-must-be-user rule, turn accounting for the frontend
signup wall, and that the verdict is actually serialized into the model's
context.
"""

import pytest

import mrk18_execution.api.taster as taster_mod
import mrk18_execution.api.taster_chat as chat_mod
from mrk18_execution.config import Settings


@pytest.fixture(autouse=True)
def _reset_daily():
    taster_mod._daily.clear()
    yield
    taster_mod._daily.clear()


def _configure(monkeypatch, **overrides):
    settings = Settings(**{"_env_file": None, "groq_api_key": "gsk-test", **overrides})
    monkeypatch.setattr(chat_mod, "get_settings", lambda: settings)
    return settings


class _FakeResp:
    def __init__(self, text):
        msg = type("M", (), {"content": text})()
        self.choices = [type("C", (), {"message": msg})()]


def _fake_engine(monkeypatch, capture=None, reply="Focus on making your AI-first story visible."):
    """Replace AsyncOpenAI with a stub that records the messages it was sent."""

    class _FakeClient:
        def __init__(self, *a, **k):
            self.chat = type("Chat", (), {"completions": self})()

        async def create(self, **kwargs):
            if capture is not None:
                capture.update(kwargs)
            return _FakeResp(reply)

    monkeypatch.setattr(chat_mod, "AsyncOpenAI", _FakeClient)


CTX = {
    "company": "AltaIR Capital",
    "domain": "altair.vc",
    "offer": "AI-first VC",
    "competitors": ["Accel", "Sequoia Capital"],
    "results": {"usp": {"verdict": "Proven AI-focused unicorn builder", "score": 70,
                        "points": ["7 portfolio unicorns"]}},
    "key_insights": ["AI-first narrative is proven but not market-visible"],
}


async def test_chat_returns_a_reply_and_counts_turns(client, monkeypatch):
    _configure(monkeypatch)
    _fake_engine(monkeypatch)
    resp = await client.post("/taster/chat", json={
        "context": CTX,
        "messages": [{"role": "user", "content": "What should I fix first?"}],
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"]
    assert body["turns_used"] == 1
    assert body["turns_left"] == 4  # default free_turns=5


async def test_last_message_must_be_from_the_user(client, monkeypatch):
    _configure(monkeypatch)
    _fake_engine(monkeypatch)
    resp = await client.post("/taster/chat", json={
        "context": CTX,
        "messages": [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ],
    })
    assert resp.status_code == 422


async def test_daily_cap_answers_429(client, monkeypatch):
    _configure(monkeypatch, taster_chat_daily_per_ip=1)
    _fake_engine(monkeypatch)
    payload = {"context": CTX, "messages": [{"role": "user", "content": "one"}]}
    assert (await client.post("/taster/chat", json=payload)).status_code == 200
    capped = await client.post("/taster/chat", json=payload)
    assert capped.status_code == 429
    assert "sign up" in capped.json()["detail"]


async def test_the_verdict_is_serialized_into_the_model_context(client, monkeypatch):
    """The whole point: the model must actually be handed the analysis, so its
    answers are grounded in THIS company's result."""
    _configure(monkeypatch)
    sent: dict = {}
    _fake_engine(monkeypatch, capture=sent)
    await client.post("/taster/chat", json={
        "context": CTX,
        "messages": [{"role": "user", "content": "what next?"}],
    })
    system = sent["messages"][0]["content"]
    assert sent["messages"][0]["role"] == "system"
    assert "AltaIR Capital" in system
    assert "Accel" in system  # competitor made it into the briefing
    assert "Proven AI-focused unicorn builder" in system  # the USP verdict did too
    assert "<analysis>" in system  # untrusted data is delimited


async def test_history_is_capped_but_last_turn_is_kept(client, monkeypatch):
    _configure(monkeypatch)
    sent: dict = {}
    _fake_engine(monkeypatch, capture=sent)
    many = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(30)]
    many[-1] = {"role": "user", "content": "the final question"}
    await client.post("/taster/chat", json={"context": CTX, "messages": many})
    # system + at most MAX_HISTORY turns
    assert len(sent["messages"]) <= chat_mod.MAX_HISTORY + 1
    assert sent["messages"][-1]["content"] == "the final question"


def test_context_block_is_bounded_and_skips_empties():
    block = chat_mod._context_block({"company": "X", "offer": "", "competitors": []})
    assert "Company: X" in block
    assert "Competitors" not in block  # empty list omitted
    assert len(block) <= chat_mod.MAX_CONTEXT_CHARS
