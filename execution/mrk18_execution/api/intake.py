"""Layer 1 — Intake endpoints.

The hard gate lives here: orchestration can only ever start from a validated
FounderProfile, and a FounderProfile only exists once /intake/complete passes.
Partial saves are first-class (founders close laptops); silence costs nothing.
"""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit.recorder import record
from ..db import repositories as repo
from ..db.models import FounderRow
from ..intake_quality import heuristic_problems
from ..schemas.enums import AuditEventType
from ..schemas.founder import FounderProfile
from ..schemas.intake import IntakeDraft, IntakeStatus
from .deps import current_founder, founder_scope, get_session, get_verified_claims

router = APIRouter(tags=["intake"])

AGENT = "system:intake"


class FounderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # fallback only — the verified token's email claim wins when present
    email: str | None = Field(
        default=None, min_length=5, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    )
    display_name: str | None = Field(default=None, max_length=200)


class FounderCreated(BaseModel):
    founder_id: UUID
    email: str
    status: str


class IntakeView(IntakeStatus):
    draft: dict
    profile: dict | None = None


class Me(BaseModel):
    founder_id: UUID
    email: str


@router.get("/me", response_model=Me)
async def whoami(founder: FounderRow = Depends(current_founder)) -> Me:
    """Resolve the verified caller to their founder id — the frontend's 'who am I'."""
    return Me(founder_id=founder.id, email=founder.email)


def evaluate_draft(
    founder_id: UUID, draft: dict
) -> tuple[FounderProfile | None, list[str], list[str]]:
    """Try to promote a raw draft into a validated FounderProfile.

    Returns (profile, missing_fields, problems). profile is None unless the
    draft passes the FULL contract — this function IS the 100%-complete gate.
    """
    candidate = {
        k: v for k, v in draft.items() if k not in ("consent_given", "consent_text_version")
    }
    if draft.get("consent_given") is not None or draft.get("consent_text_version"):
        candidate["consent"] = {
            "given": draft.get("consent_given"),
            "text_version": draft.get("consent_text_version") or "",
        }
    candidate["founder_id"] = str(founder_id)

    try:
        profile = FounderProfile.model_validate(candidate)
    except ValidationError as exc:
        missing: list[str] = []
        problems: list[str] = []
        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"]) or "intake"
            if err["type"] == "missing":
                missing.append(loc)
            else:
                problems.append(f"{loc}: {err['msg']}")
        if "consent" in missing:  # translate to the actual form fields
            missing.remove("consent")
            missing.extend(["consent_given", "consent_text_version"])
        return None, missing, problems

    # Structure is valid — now the Layer-1 semantic gate (deterministic, free):
    # reject keyboard-mashing / gibberish before it becomes the company memory.
    quality = heuristic_problems(draft)
    if quality:
        return None, [], quality
    return profile, [], []


def _status_view(row, founder_id: UUID) -> IntakeView:
    profile_obj, missing, problems = evaluate_draft(founder_id, row.draft or {})
    return IntakeView(
        founder_id=str(founder_id),
        status=row.status,
        complete=row.status == "ready_for_analysis",
        missing_fields=missing if row.status == "draft" else [],
        problems=problems if row.status == "draft" else [],
        draft=row.draft or {},
        profile=row.profile,
    )


async def _get_row_or_404(session: AsyncSession, founder_id: UUID):
    row = await repo.get_profile(session, founder_id)
    if row is None:
        raise HTTPException(status_code=404, detail="founder not found")
    return row


@router.post("/founders", status_code=201, response_model=FounderCreated)
async def create_founder(
    body: FounderCreate,
    claims: dict = Depends(get_verified_claims),
    session: AsyncSession = Depends(get_session),
) -> FounderCreated:
    # identity comes from the VERIFIED token, never from the request body
    auth_user_id = str(claims.get("sub") or "").strip()
    if not auth_user_id:
        raise HTTPException(status_code=401, detail="token has no usable subject claim")
    email = claims.get("email") or body.email
    if not email:
        raise HTTPException(
            status_code=422, detail="no email in the token — provide one in the body"
        )
    try:
        founder = await repo.create_founder(
            session, email, body.display_name, auth_user_id=auth_user_id
        )
    except IntegrityError:
        # Same email, DIFFERENT Clerk id (account re-created / a new Clerk session,
        # or dev vs prod instance): the verified token already proves they own this
        # email, so RELINK the existing founder to the current identity instead of
        # erroring. Idempotent when the sub already matches.
        await session.rollback()
        existing = await repo.get_founder_by_email(session, email)
        if existing is None:
            raise HTTPException(
                status_code=409, detail="a founder already exists for this account or email"
            )
        existing.auth_user_id = auth_user_id
        await session.commit()
        return FounderCreated(founder_id=existing.id, email=existing.email, status="draft")
    await record(
        session,
        event_type=AuditEventType.AGENT_ACTION,
        agent_id=AGENT,
        founder_id=founder.id,
        outcome="founder_created",
        detail={"email": founder.email},
    )
    await session.commit()
    return FounderCreated(founder_id=founder.id, email=founder.email, status="draft")


@router.put("/founders/{founder_id}/intake", response_model=IntakeView)
async def save_intake(
    founder_id: UUID,
    body: IntakeDraft,
    _founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> IntakeView:
    row = await _get_row_or_404(session, founder_id)
    if row.status == "ready_for_analysis":
        raise HTTPException(status_code=409, detail="intake is complete and locked")
    patch = body.non_null_fields()
    await repo.merge_draft(row, patch)
    await record(
        session,
        event_type=AuditEventType.AGENT_ACTION,
        agent_id=AGENT,
        founder_id=founder_id,
        outcome="intake_draft_saved",
        detail={"fields_saved": sorted(patch.keys())},
    )
    await session.commit()
    return _status_view(row, founder_id)


@router.get("/founders/{founder_id}/intake", response_model=IntakeView)
async def read_intake(
    founder_id: UUID,
    _founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> IntakeView:
    row = await _get_row_or_404(session, founder_id)
    return _status_view(row, founder_id)


async def _build_brain_bg(app, founder_id: UUID, url: str) -> None:
    """After onboarding, analyse the site on the FREE model (taster verdict +
    Business DNA) and ingest it into the Company Brain (RAG) — so the routed Brain
    chat is grounded from message one. Best-effort: never raises, so a build
    failure can't undo a founder's completed onboarding."""
    import logging

    try:
        socket = getattr(app.state, "llm_socket", None) or getattr(app.state, "voice_socket", None)
        engine = getattr(app.state, "embedding_engine", None)
        if socket is None or engine is None or not url:
            return
        from ..agents.company_brain import build_company_brain

        async with app.state.session_factory() as session:
            await build_company_brain(session, socket, engine, founder_id, url)
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("mrk18.intake").warning(
            "company-brain build failed for %s: %s", founder_id, exc
        )


@router.post("/founders/{founder_id}/intake/complete", response_model=IntakeView)
async def complete_intake(
    founder_id: UUID,
    request: Request,
    background: BackgroundTasks,
    _founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> IntakeView:
    row = await _get_row_or_404(session, founder_id)
    if row.status == "ready_for_analysis":
        raise HTTPException(status_code=409, detail="intake already completed")

    # Layer 0 (structure) + Layer 1 (deterministic gibberish heuristics) — the
    # BLOCKING gate. Layer 1 instantly catches keyboard-mashing.
    #
    # Layer 2 (AI coherence) is deliberately NOT run here: against the trained
    # Brain it adds a multi-minute cold start + false-positive risk to every
    # onboarding submit — spurious friction for a real founder. coherence_problems
    # stays in intake_quality for later use behind a fast, dedicated model.
    profile_obj, missing, problems = evaluate_draft(founder_id, row.draft or {})

    if profile_obj is None:
        await record(
            session,
            event_type=AuditEventType.AGENT_ACTION,
            agent_id=AGENT,
            founder_id=founder_id,
            outcome="intake_complete_rejected",
            detail={"missing_fields": missing, "problems": problems},
        )
        await session.commit()  # the rejection evidence persists even though the request fails
        raise HTTPException(
            status_code=422,
            detail={
                "message": "intake is not complete — fix the items below and try again",
                "missing_fields": missing,
                "problems": problems,
            },
        )

    row.profile = profile_obj.model_dump(mode="json")
    row.status = "ready_for_analysis"
    await record(
        session,
        event_type=AuditEventType.GATE_DECISION,
        agent_id=AGENT,
        founder_id=founder_id,
        outcome="intake_completed",
        detail={"company_name": profile_obj.company_name},
    )
    await session.commit()
    # Onboarding done → build the Company Brain (free analysis + DNA → RAG) in the
    # background, so the chat is grounded. Best-effort; the founder isn't blocked.
    url = str((row.profile or {}).get("website") or "").strip()
    if url:
        background.add_task(_build_brain_bg, request.app, founder_id, url)
    return _status_view(row, founder_id)
