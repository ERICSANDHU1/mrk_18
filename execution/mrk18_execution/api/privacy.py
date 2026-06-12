"""DPDP rights endpoints — access, correction, erasure, consent withdrawal.

These are legal obligations (DPDP Act 2023): a founder can demand everything
we hold about them, correct what's wrong, withdraw consent (processing stops),
and demand erasure within 7 days. Every right belongs to the data principal
ALONE — the caller must prove they are this founder (require_founder), or
these endpoints would themselves be the breach.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit.recorder import record
from ..db.models import FounderProfileRow, FounderRow
from ..schemas.enums import AuditEventType
from ..schemas.founder import FounderProfile
from ..security.retention import erase_founder, export_founder_data, withdraw_consent
from .deps import founder_scope, get_session, require_founder

router = APIRouter(tags=["privacy"])

AGENT = "system:dpdp"


@router.get("/founders/{founder_id}/data-export", response_model=dict)
async def data_export(
    founder_id: UUID,
    request: Request,
    _founder: FounderRow = Depends(require_founder),
) -> dict:
    """Right to access — everything we hold, minus secret material."""
    factory = request.app.state.session_factory
    try:
        return await export_founder_data(factory, founder_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="founder not found")


class CorrectionBody(BaseModel):
    """Right to correction. Identity fields and/or locked-profile fields —
    profile corrections are re-validated through the FULL FounderProfile
    contract, so a correction can never make the profile invalid."""

    model_config = ConfigDict(extra="forbid")

    email: str | None = Field(
        default=None, min_length=5, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    )
    display_name: str | None = Field(default=None, max_length=200)
    profile: dict | None = None


@router.patch("/founders/{founder_id}", response_model=dict)
async def correct(
    founder_id: UUID,
    body: CorrectionBody,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Right to correction — fix identity fields anytime; fix profile fields
    even after intake locked (the lock stops *evolution*, not *correction*)."""
    corrected: list[str] = []
    if body.email is not None:
        founder.email = body.email.strip().lower()
        corrected.append("email")
    if body.display_name is not None:
        founder.display_name = body.display_name
        corrected.append("display_name")
    if corrected:
        try:
            await session.flush()  # surface a unique-email clash HERE, not mid-audit
        except IntegrityError:
            raise HTTPException(
                status_code=409, detail="that email already belongs to a founder"
            )

    if body.profile:
        row = await session.get(FounderProfileRow, founder_id)
        if row is None or row.profile is None:
            raise HTTPException(
                status_code=409,
                detail="intake is not completed yet — edit it via PUT /founders/{id}/intake",
            )
        merged = {**row.profile, **body.profile, "founder_id": str(founder_id)}
        try:
            validated = FounderProfile.model_validate(merged)
        except ValidationError as exc:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "correction rejected — it would make the profile invalid",
                    "problems": [
                        f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}"
                        for e in exc.errors()
                    ],
                },
            )
        row.profile = validated.model_dump(mode="json")
        row.draft = {**(row.draft or {}), **body.profile}
        corrected.extend(sorted(body.profile.keys()))

    if not corrected:
        raise HTTPException(status_code=422, detail="nothing to correct")
    await record(
        session,
        event_type=AuditEventType.AGENT_ACTION,
        agent_id=AGENT,
        founder_id=founder_id,
        outcome="data_corrected",
        detail={"fields": corrected},
    )
    try:
        await session.commit()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="that email already belongs to a founder")
    return {"status": "corrected", "fields": corrected}


@router.post("/founders/{founder_id}/consent/withdraw", response_model=dict)
async def consent_withdraw(
    founder_id: UUID,
    request: Request,
    _founder: FounderRow = Depends(require_founder),
) -> dict:
    """Right to withdraw consent — as easy as giving it. Processing stops:
    new runs are refused, waiting gates close, awaiting items expire. Data
    remains (erasure is its own right); re-consent goes through intake again."""
    factory = request.app.state.session_factory
    try:
        return await withdraw_consent(factory, founder_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="founder not found")


@router.delete("/founders/{founder_id}", response_model=dict)
async def erase(
    founder_id: UUID,
    request: Request,
    _founder: FounderRow = Depends(require_founder),
) -> dict:
    """Right to erasure — remove all personal data, keep a tamper-evident marker."""
    factory = request.app.state.session_factory
    media_store = _media_store(request)
    try:
        deleted = await erase_founder(factory, founder_id, media_store=media_store)
    except LookupError:
        raise HTTPException(status_code=404, detail="founder not found")
    return {"status": "erased", "deleted": deleted}


def _media_store(request: Request):
    """Build the storage client for image erasure, if Supabase is configured."""
    s = request.app.state
    settings = getattr(s, "settings", None)
    from ..config import get_settings

    cfg = settings or get_settings()
    if cfg.supabase_url and cfg.supabase_service_key:
        from ..llm.images import SupabaseMediaStore

        return SupabaseMediaStore(cfg.supabase_url, cfg.supabase_service_key)
    return None
