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
    # optional data-URL image for vision (a founder's ad/screenshot). The frontend
    # attaches ONE, on the current turn only. Generous cap for base64 payloads;
    # only a vision seat (Terra) can actually read it.
    image: str | None = Field(default=None, max_length=12_000_000)


def _wire(turns: list["VoiceTurn"]) -> list[dict]:
    """[{role, content}] for the socket. A turn carrying an image becomes OpenAI
    multimodal content (text + image_url) so vision seats can read it; text-only
    turns stay plain strings."""
    out: list[dict] = []
    for t in turns:
        if t.image:
            out.append(
                {
                    "role": t.role,
                    "content": [
                        {"type": "text", "text": t.content},
                        {"type": "image_url", "image_url": {"url": t.image}},
                    ],
                }
            )
        else:
            out.append({"role": t.role, "content": t.content})
    return out


def _reject_image_without_vision(request: Request, turns: list["VoiceTurn"]) -> None:
    """A picture only works on a vision-capable seat (the Terra chat socket). If one
    is attached while that's off, fail with a clear, friendly message instead of a
    raw model error."""
    if any(t.image for t in turns) and getattr(request.app.state, "chat_socket", None) is None:
        raise HTTPException(
            status_code=400,
            detail="Image analysis needs the upgraded CMO model — it's coming shortly.",
        )


def _resolve_chat_model(request: Request, model: str, has_image: bool = False):
    """Map the founder's model choice to (socket, units).

    • mrk 1  → the fast Groq seat, billed 1 unit.
    • mrk 2.0 → the premium Terra reply socket (chat_socket), billed 2 units — the
      "2× usage". An uploaded image forces that vision-capable seat regardless.

    mrk 2.0 degrades to Groq (1 unit) when Terra isn't configured, so the chat
    never hard-fails just because the premium model is off."""
    groq = getattr(request.app.state, "voice_socket", None) or getattr(
        request.app.state, "llm_socket", None
    )
    terra = getattr(request.app.state, "chat_socket", None)
    if (model == "mrk2" or has_image) and terra is not None:
        return terra, (2 if model == "mrk2" else 1)
    return (groq or terra), 1


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
    # a TEXT turn gets the Terra reply seat (chat_socket) when enabled; a live
    # VOICE turn always stays on the fast Groq voice socket (Terra is too slow).
    socket = (
        (getattr(request.app.state, "chat_socket", None) if body.mode == "text" else None)
        or getattr(request.app.state, "voice_socket", None)
        or getattr(request.app.state, "llm_socket", None)
    )
    if socket is None:
        raise HTTPException(
            status_code=503,
            detail="the CMO voice is unavailable — no model is configured (set GROQ_API_KEY).",
        )

    from ..agents.cmo import cmo_reply

    _reject_image_without_vision(request, body.messages)
    profile = await _profile(session, founder.id)
    messages = _wire(body.messages)
    try:
        reply, _usage = await cmo_reply(
            socket, profile=profile, messages=messages, mode=body.mode
        )
    except Exception as exc:  # noqa: BLE001 — a live call must fail soft, with a clear reason
        raise HTTPException(
            status_code=502, detail=f"the CMO couldn't respond right now: {exc}"
        ) from exc
    return {"reply": reply}


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # which slide's adapter to route to (see agents.cmo._SLIDE_ROLE)
    adapter: str = Field(pattern="^(verdict|market_intel|audience|usp|strategy|content)$")
    context: str = Field(min_length=1, max_length=8000)  # the slide's content, grounding
    messages: list[VoiceTurn] = Field(min_length=1, max_length=30)  # per-slide history


@router.post("/founders/{founder_id}/runs/{run_id}/ask", response_model=dict)
async def run_slide_ask(
    founder_id: UUID,
    run_id: UUID,
    body: AskRequest,
    request: Request,
    founder=Depends(require_founder),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Per-slide follow-up on a finished run, routed to that slide's adapter. Uses
    the MAIN socket (per-role registry -> the Brain's adapter, or the pilot Groq
    seat), falling back to the fast voice socket. `context` is client-provided (the
    founder's own slide), so no run data is loaded server-side."""
    socket = getattr(request.app.state, "llm_socket", None) or getattr(
        request.app.state, "voice_socket", None
    )
    if socket is None:
        raise HTTPException(
            status_code=503, detail="the CMO is unavailable — no model is configured (set GROQ_API_KEY)."
        )
    from ..agents.cmo import ask_about_run

    profile = await _profile(session, founder.id)
    messages = _wire(body.messages)
    try:
        reply, _usage = await ask_about_run(
            socket, adapter=body.adapter, profile=profile, context=body.context, messages=messages
        )
    except Exception as exc:  # noqa: BLE001 — fail soft with a clear reason
        raise HTTPException(
            status_code=502, detail=f"the CMO couldn't respond right now: {exc}"
        ) from exc
    return {"reply": reply}


class ComrkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[VoiceTurn] = Field(min_length=1, max_length=40)
    # which CMO model answers: "mrk1" (fast Groq, 1 unit) or "mrk2" (premium
    # Terra, 2 units). Both are unlocked once onboarded; the UI sends the choice.
    model: str = Field(default="mrk1", pattern="^(mrk1|mrk2)$")


@router.post("/founders/{founder_id}/comrk", response_model=dict)
async def comrk_chat(
    founder_id: UUID,
    body: ComrkRequest,
    request: Request,
    founder=Depends(require_founder),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """The Comrk free-form chat: retrieve the founder's Company-Brain knowledge,
    a cheap classifier routes the message to the right adapter, and that adapter
    replies — grounded in profile + RAG, in plain chat text (not slides).

    Brain-ready: the router picks an AgentRole; the socket serves the matching
    trained adapter on the Brain, or the pilot Groq seat today — one env flip."""
    # The founder's model choice picks the reply socket: mrk 2.0 → Terra (2 units),
    # mrk 1 → Groq (1 unit). The router inside (pick_adapter → STRUCTURE seat) stays
    # on that same socket. An uploaded image forces the Terra vision seat.
    has_image = any(t.image for t in body.messages)
    socket, units = _resolve_chat_model(request, body.model, has_image)
    if socket is None:
        raise HTTPException(
            status_code=503, detail="the CMO is unavailable — no model configured (set GROQ_API_KEY)."
        )
    if body.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="the last message must be from the user")

    from ..agents.cmo import comrk_reply, pick_adapter

    _reject_image_without_vision(request, body.messages)

    # daily free-chat cap (per account) — onboarded founders get the bigger allowance
    from . import chat_limit

    limit_key = chat_limit.onboarded_key(founder.email)  # fresh-10 tier, separate counter
    snap = await chat_limit.state(session, limit_key, chat_limit.ONBOARDED_PER_DAY)
    if snap["remaining"] < units:  # a 2-unit mrk 2.0 turn needs 2 chats left
        raise HTTPException(
            status_code=402,
            detail={
                "message": "you've used today's free chats",
                "limit_reached": True,
                "onboarded": True,
                "resets_in": snap["resets_in"],
            },
        )

    profile = await _profile(session, founder.id)
    messages = _wire(body.messages)
    query = body.messages[-1].content  # the TEXT (for routing + RAG); wire content may be multimodal

    # RAG — the founder's own Company-Brain knowledge (skipped if no embed engine)
    chunks: list[dict] = []
    engine = getattr(request.app.state, "embedding_engine", None)
    if engine is not None:
        try:
            from ..rag import store

            chunks = await store.retrieve(
                session, founder_id=founder.id, query=query, engine=engine, k=6
            )
        except Exception:  # noqa: BLE001 — retrieval is a bonus, never a blocker
            chunks = []

    role = await pick_adapter(socket, query, profile)  # the router
    try:
        reply, _usage = await comrk_reply(
            socket, profile=profile, messages=messages, chunks=chunks, role=role
        )
    except Exception as exc:  # noqa: BLE001 — fail soft with a clear reason
        raise HTTPException(
            status_code=502, detail=f"the CMO couldn't respond right now: {exc}"
        ) from exc
    await chat_limit.consume(session, limit_key, units)  # mrk 2.0 bills 2, mrk 1 bills 1
    usage = {
        **(await chat_limit.state(session, limit_key, chat_limit.ONBOARDED_PER_DAY)),
        "onboarded": True,
        "model": body.model,
    }
    return {"reply": reply, "adapter": role.value, "usage": usage}


@router.get("/cmo/capabilities", response_model=dict)
async def cmo_capabilities(request: Request) -> dict:
    """What the CMO chat can do right now. The frontend reads this to enable the
    image-upload button — vision is live only when the Terra chat socket is on."""
    return {"vision": getattr(request.app.state, "chat_socket", None) is not None}


@router.get("/cmo/chat-quota", response_model=dict)
async def chat_quota(
    claims: dict = Depends(get_verified_claims),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """The caller's daily free-chat allowance (per account). The chat UI reads this
    on load for the "N left today" counter and to know if they're already capped.
    Onboarded founders get the bigger daily cap."""
    from . import chat_limit
    from ..db import repositories as repo

    sub = (claims.get("sub") or "").strip() or None
    email = (claims.get("email") or "").strip() or None

    founder = None
    if sub:
        founder = await repo.get_founder_by_auth_user(session, sub)
    if founder is None and email:
        founder = await repo.get_founder_by_email(session, email)

    prof = await session.get(FounderProfileRow, founder.id) if founder is not None else None
    onboarded = False
    if prof is not None:
        onboarded = bool(getattr(prof, "status", "") == "ready_for_analysis")

    if founder is not None:
        email = (founder.email or email or "").strip() or None
        sub = (founder.auth_user_id or sub or "").strip() or None

    # onboarded → the fresh-10 tier on its OWN key; else the pre-onboarding 5
    if onboarded:
        key = chat_limit.onboarded_key(email, sub)
        cap = chat_limit.ONBOARDED_PER_DAY
    else:
        key = chat_limit.account_key(email, sub)
        cap = chat_limit.FREE_PER_DAY
    return {**(await chat_limit.state(session, key, cap)), "onboarded": onboarded}


@router.post("/founders/{founder_id}/brain/build", response_model=dict)
async def build_brain(
    founder_id: UUID,
    request: Request,
    founder=Depends(require_founder),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Onboarding hook / 'refresh my Brain': analyse the founder's site on the FREE
    model (taster verdict + Business DNA) and ingest it into their Company Brain
    (RAG), so the routed Brain chat is grounded from message one."""
    profile = await _profile(session, founder.id)
    url = (profile.get("website") or "").strip()
    if not url:
        raise HTTPException(status_code=422, detail="no website on file — add it in onboarding")
    socket = getattr(request.app.state, "llm_socket", None) or getattr(
        request.app.state, "voice_socket", None
    )
    engine = getattr(request.app.state, "embedding_engine", None)
    if socket is None or engine is None:
        raise HTTPException(
            status_code=503,
            detail="Brain build needs GROQ + Cloudflare embeddings configured",
        )
    from ..agents.company_brain import build_company_brain

    try:
        return await build_company_brain(session, socket, engine, founder.id, url)
    except Exception as exc:  # noqa: BLE001 — surface a clear reason
        raise HTTPException(status_code=502, detail=f"couldn't build your Brain: {exc}") from exc


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
    session: AsyncSession = Depends(get_session),
) -> dict:
    """One spoken turn for a not-yet-onboarded user: empty profile → the guide
    persona (see agents.cmo.guide_system_prompt)."""
    # the free tier is LOCKED to mrk 1 (Groq) — mrk 2.0 unlocks only after
    # onboarding. An uploaded image is the one exception: it needs the Terra vision
    # seat. A live VOICE turn always stays on the fast Groq voice socket.
    if body.mode == "text":
        socket, _units = _resolve_chat_model(
            request, "mrk1", has_image=any(t.image for t in body.messages)
        )
    else:
        socket = getattr(request.app.state, "voice_socket", None) or getattr(
            request.app.state, "llm_socket", None
        )
    if socket is None:
        raise HTTPException(
            status_code=503,
            detail="the CMO voice is unavailable — no model is configured (set GROQ_API_KEY).",
        )
    from ..agents.cmo import cmo_reply

    _reject_image_without_vision(request, body.messages)

    # daily free-chat cap — 5 typed chats / 24h / account (the "gmail"). A live
    # voice turn (mode voice) is never charged.
    from . import chat_limit

    metered = body.mode == "text"
    limit_key = chat_limit.account_key(claims.get("email"), claims.get("sub"))
    if metered:
        snap = await chat_limit.state(session, limit_key, chat_limit.FREE_PER_DAY)
        if snap["limit_reached"]:
            raise HTTPException(
                status_code=402,
                detail={
                    "message": "you've used today's free chats",
                    "limit_reached": True,
                    "onboarded": False,
                    "resets_in": snap["resets_in"],
                },
            )

    messages = _wire(body.messages)
    try:
        reply, _usage = await cmo_reply(socket, profile={}, messages=messages, mode=body.mode)
    except Exception as exc:  # noqa: BLE001 — a live call must fail soft
        raise HTTPException(
            status_code=502, detail=f"the assistant couldn't respond right now: {exc}"
        ) from exc
    if metered:
        await chat_limit.consume(session, limit_key)
    usage = (
        {**(await chat_limit.state(session, limit_key, chat_limit.FREE_PER_DAY)), "onboarded": False}
        if metered
        else None
    )
    return {"reply": reply, "usage": usage}


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
