"""The live CMO voice call endpoint.

The founder taps "Call CMO"; the browser does speech-in (mic) and speech-out
(TTS); THIS endpoint is the brain on each turn — it loads their company memory
and replies AS their CMO. Stateless: the client posts the running transcript
each turn (the call is ephemeral; nothing is persisted unless the founder saves
it). Uses the fast voice socket (Groq) so a live call never waits on a cold-start
Brain.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import FounderProfileRow
from .deps import get_session, require_founder

router = APIRouter(tags=["cmo"])


class VoiceTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class VoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[VoiceTurn] = Field(min_length=1, max_length=40)
    # "voice" = short spoken turns (the live call, default); "text" = the full-page
    # chat — fuller, copy-pasteable, plain-text replies.
    mode: str = Field(default="voice", pattern="^(voice|text)$")


async def _profile(session: AsyncSession, founder_id: UUID) -> dict:
    row = await session.get(FounderProfileRow, founder_id)
    return (row.profile if row and row.profile else None) or (row.draft if row else {}) or {}


@router.post("/founders/{founder_id}/cmo/voice", response_model=dict)
async def cmo_voice_turn(
    founder_id: UUID,
    body: VoiceRequest,
    request: Request,
    founder=Depends(require_founder),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """One spoken turn of the live CMO call. Returns {reply} — the text the
    browser speaks aloud."""
    # Prefer the dedicated fast voice socket (Groq); fall back to the main socket
    # only if voice wasn't configured (degrades, with an honest reason).
    socket = getattr(request.app.state, "voice_socket", None) or getattr(
        request.app.state, "llm_socket", None
    )
    if socket is None:
        raise HTTPException(
            status_code=503,
            detail="the CMO voice is unavailable — no model is configured (set GROQ_API_KEY).",
        )

    from ..agents.cmo import cmo_reply

    profile = await _profile(session, founder.id)
    messages = [{"role": t.role, "content": t.content} for t in body.messages]
    try:
        reply, _usage = await cmo_reply(
            socket, profile=profile, messages=messages, mode=body.mode
        )
    except Exception as exc:  # noqa: BLE001 — a live call must fail soft, with a clear reason
        raise HTTPException(
            status_code=502, detail=f"the CMO couldn't respond right now: {exc}"
        ) from exc
    return {"reply": reply}
