"""The live CMO voice call endpoint.

The founder taps "Call CMO"; the browser does speech-in (mic) and speech-out
(TTS); THIS endpoint is the brain on each turn — it loads their company memory
and replies AS their CMO. Stateless: the client posts the running transcript
each turn (the call is ephemeral; nothing is persisted unless the founder saves
it). Uses the fast voice socket (Groq) so a live call never waits on a cold-start
Brain.
"""

from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db.models import FounderProfileRow
from .deps import get_session, get_verified_claims, require_founder

router = APIRouter(tags=["cmo"])

GROQ_AUDIO_BASE = "https://api.groq.com/openai/v1/audio"
# Microsoft neural voice via edge-tts: free, unlimited, male Indian English —
# the CMO's spoken voice. Groq Orpheus (troy, 100 req/day free) is the fallback.
EDGE_VOICE = "en-IN-PrabhatNeural"
ORPHEUS_MODEL = "canopylabs/orpheus-v1-english"
ORPHEUS_VOICE = "troy"


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


async def _whisper_transcribe(request: Request) -> dict:
    """Shared STT: raw audio body (webm/mp4/wav) → Groq Whisper large-v3-turbo
    → {text}. Free tier: 2k requests/day."""
    settings = get_settings()
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="speech-to-text unavailable (set GROQ_API_KEY).")
    audio = await request.body()
    if not audio or len(audio) < 200:  # an empty/instant blob — nothing was said
        return {"text": ""}
    if len(audio) > 24_000_000:  # Groq free-tier file cap is 25MB
        raise HTTPException(status_code=413, detail="audio too long — keep turns short.")
    content_type = request.headers.get("content-type") or "audio/webm"
    ext = "mp4" if "mp4" in content_type else "wav" if "wav" in content_type else "webm"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                f"{GROQ_AUDIO_BASE}/transcriptions",
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                files={"file": (f"turn.{ext}", audio, content_type)},
                data={"model": "whisper-large-v3-turbo", "language": "en", "temperature": "0"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"couldn't reach Groq STT: {exc}") from exc
    if res.status_code != 200:
        raise HTTPException(
            status_code=502, detail=f"transcription failed ({res.status_code}): {res.text[:200]}"
        )
    return {"text": (res.json().get("text") or "").strip()}


class SpeakRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=600)  # spoken turns are one-liners


async def _synthesize_speech(text: str) -> Response:
    """Shared TTS: text → audio. Primary: Microsoft's en-IN male neural voice via
    edge-tts (free, unlimited). Fallback: Groq Orpheus male (100 req/day free).
    503 when neither works → the browser falls back to its own male voice."""
    # 1) edge-tts — free MS neural voice, no key. Lazy import so the API still
    #    boots (and falls back) if the package isn't installed yet.
    try:
        import edge_tts  # type: ignore[import-not-found]

        chunks: list[bytes] = []
        stream = edge_tts.Communicate(
            text, voice=EDGE_VOICE, rate="+8%", volume="+20%"
        ).stream()
        async for part in stream:
            if part.get("type") == "audio" and part.get("data"):
                chunks.append(part["data"])
        if chunks:
            return Response(content=b"".join(chunks), media_type="audio/mpeg")
    except Exception:  # noqa: BLE001 — fall through to Groq, then the browser voice
        pass

    # 2) Groq Orpheus (male "troy") — same key as the LLM; 100 requests/day free.
    settings = get_settings()
    if settings.groq_api_key:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                res = await client.post(
                    f"{GROQ_AUDIO_BASE}/speech",
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                    json={
                        "model": ORPHEUS_MODEL,
                        "voice": ORPHEUS_VOICE,
                        "input": text,
                        "response_format": "wav",
                    },
                )
            if res.status_code == 200 and res.content:
                return Response(content=res.content, media_type="audio/wav")
        except httpx.HTTPError:
            pass

    raise HTTPException(status_code=503, detail="tts unavailable — browser voice fallback.")


# ── founder-scoped ears + voice (the personal CMO call) ─────────────────────


@router.post("/founders/{founder_id}/cmo/stt", response_model=dict)
async def cmo_transcribe(
    founder_id: UUID,
    request: Request,
    founder=Depends(require_founder),
) -> dict:
    return await _whisper_transcribe(request)


@router.post("/founders/{founder_id}/cmo/tts")
async def cmo_speak(
    founder_id: UUID,
    body: SpeakRequest,
    founder=Depends(require_founder),
) -> Response:
    return await _synthesize_speech(body.text)


# ── guest call (signed in, but no company registered yet) ───────────────────
# Same ears and voice, but the brain answers as the mrk18 GUIDE — it knows the
# product and every page of the site, and nudges the visitor toward onboarding.
# Auth: a valid session JWT is still required (these burn Groq quota), it just
# doesn't have to map to a founder row yet.


@router.post("/cmo/guest/voice", response_model=dict)
async def cmo_guest_voice(
    body: VoiceRequest,
    request: Request,
    claims: dict = Depends(get_verified_claims),
) -> dict:
    """One spoken turn for a not-yet-onboarded user: empty profile → the guide
    persona (see agents.cmo.guide_system_prompt)."""
    socket = getattr(request.app.state, "voice_socket", None) or getattr(
        request.app.state, "llm_socket", None
    )
    if socket is None:
        raise HTTPException(
            status_code=503,
            detail="the CMO voice is unavailable — no model is configured (set GROQ_API_KEY).",
        )
    from ..agents.cmo import cmo_reply

    messages = [{"role": t.role, "content": t.content} for t in body.messages]
    try:
        reply, _usage = await cmo_reply(socket, profile={}, messages=messages, mode=body.mode)
    except Exception as exc:  # noqa: BLE001 — a live call must fail soft
        raise HTTPException(
            status_code=502, detail=f"the assistant couldn't respond right now: {exc}"
        ) from exc
    return {"reply": reply}


@router.post("/cmo/guest/stt", response_model=dict)
async def cmo_guest_transcribe(
    request: Request,
    claims: dict = Depends(get_verified_claims),
) -> dict:
    return await _whisper_transcribe(request)


@router.post("/cmo/guest/tts")
async def cmo_guest_speak(
    body: SpeakRequest,
    claims: dict = Depends(get_verified_claims),
) -> Response:
    return await _synthesize_speech(body.text)
