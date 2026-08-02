"""Standalone Brain test — an isolated chat endpoint to exercise the routed
adapters (Groq now, the trained Brain when BRAIN_BASE_URL is set). NO auth, NO
founder, NO onboarding — deliberately separate from the real app flows so you can
paste a company and chat to test each adapter, without touching anything else.

Public + perimeter-rate-limited. Remove after the Brain is validated.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from ..agents.cmo import _ROLE_PERSONA, pick_adapter
from ..config import get_settings
from ..llm.socket import LLMSocket, brain_registry, default_registry

router = APIRouter(tags=["braintest"])


def _resolve_socket(request: Request):
    """The bench flips to the Brain on BRAIN_BASE_URL ALONE (no checkpointer
    needed, unlike the main app socket). Built once and cached on app.state."""
    settings = get_settings()
    if settings.brain_base_url:
        s = getattr(request.app.state, "_braintest_socket", None)
        if s is None:
            s = LLMSocket(
                brain_registry(
                    settings.brain_base_url, settings.brain_api_key, settings.brain_base_model
                )
            )
            request.app.state._braintest_socket = s
        return s
    # no Brain configured → the app's Groq socket
    return getattr(request.app.state, "llm_socket", None) or getattr(
        request.app.state, "voice_socket", None
    )


class _Msg(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class BrainChatBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[_Msg] = Field(min_length=1, max_length=30)
    company: str = Field(default="", max_length=400)   # optional grounding
    context: str = Field(default="", max_length=4000)   # optional extra context


@router.post("/brain/chat", response_model=dict)
async def brain_chat(body: BrainChatBody, request: Request) -> dict:
    """Route the message to an adapter and answer with it. Returns which adapter
    answered + whether the trained Brain is wired, so you can see routing work."""
    settings = get_settings()
    socket = _resolve_socket(request)
    if socket is None:
        raise HTTPException(status_code=503, detail="no model configured (set GROQ_API_KEY)")

    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    if msgs[-1]["role"] != "user":
        raise HTTPException(status_code=422, detail="last message must be from the user")

    query = msgs[-1]["content"]
    profile = {"company_name": body.company.strip()} if body.company.strip() else {}

    role = await pick_adapter(socket, query, profile)  # the router
    persona = _ROLE_PERSONA.get(role, "the founder's AI CMO")
    ctx = ""
    if body.company.strip():
        ctx += f"\n\nThe founder's company: {body.company.strip()}"
    if body.context.strip():
        ctx += f"\n\nContext to use:\n{body.context.strip()[:1500]}"
    system = (
        f"You are {persona}. Answer the founder's message directly, concretely, in plain text "
        "(no markdown headings, no tables). When asked to write something, draft it in full. "
        "Never invent numbers, prices, or results you don't have." + ctx
    )
    try:
        reply, _usage = await socket.chat(role, system, msgs, max_tokens=700, temperature=0.6)
    except Exception as exc:  # noqa: BLE001 — surface the reason for a test tool
        raise HTTPException(status_code=502, detail=f"model error: {exc}") from exc

    return {
        "reply": reply,
        "adapter": role.value,
        "brain_connected": bool(settings.brain_base_url),
        "base_model": settings.brain_base_model if settings.brain_base_url else "groq/gpt-oss",
    }
