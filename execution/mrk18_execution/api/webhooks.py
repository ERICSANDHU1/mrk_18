"""Clerk webhooks — provision a founder the moment a Clerk account is created.

Authenticated by the Svix signature, NOT a founder JWT: the signed payload is
the proof. ``user.created``/``user.updated`` keep the founders table in sync
with Clerk, so a founder shell exists from signup and the full profile arrives
later at onboarding. Idempotent: replays and duplicates are no-ops.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit.recorder import record
from ..db import repositories as repo
from ..schemas.enums import AuditEventType
from ..security.clerkwebhook import WebhookError, verify_svix
from .deps import get_session

router = APIRouter(tags=["webhooks"])

AGENT = "system:clerk-webhook"


def _primary_email(data: dict) -> str | None:
    pid = data.get("primary_email_address_id")
    addrs = data.get("email_addresses", []) or []
    for e in addrs:
        if e.get("id") == pid:
            return e.get("email_address")
    return addrs[0].get("email_address") if addrs else None


def _full_name(data: dict) -> str | None:
    name = " ".join(p for p in [data.get("first_name"), data.get("last_name")] if p).strip()
    return name or None


@router.post("/webhooks/clerk")
async def clerk_webhook(
    request: Request, session: AsyncSession = Depends(get_session)
) -> dict:
    secret = getattr(request.app.state, "clerk_webhook_secret", None)
    if not secret:
        raise HTTPException(status_code=503, detail="clerk webhook not configured")

    body = await request.body()
    try:
        verify_svix(
            secret,
            svix_id=request.headers.get("svix-id", ""),
            svix_timestamp=request.headers.get("svix-timestamp", ""),
            svix_signature=request.headers.get("svix-signature", ""),
            body=body,
        )
    except WebhookError as exc:
        raise HTTPException(status_code=401, detail=f"invalid webhook signature: {exc}")

    event = json.loads(body or b"{}")
    etype = event.get("type", "")
    data = event.get("data", {}) or {}
    clerk_id = data.get("id")
    if not clerk_id:
        return {"ok": True, "ignored": "no user id"}

    if etype in ("user.created", "user.updated"):
        existing = await repo.get_founder_by_auth_user(session, clerk_id)
        if existing is not None:
            return {"ok": True, "existing": str(existing.id)}
        email = _primary_email(data) or f"{clerk_id}@placeholder.clerk"
        try:
            founder = await repo.create_founder(
                session, email, _full_name(data), auth_user_id=clerk_id
            )
        except IntegrityError:
            await session.rollback()
            return {"ok": True, "note": "already provisioned"}
        await record(
            session,
            event_type=AuditEventType.AGENT_ACTION,
            agent_id=AGENT,
            founder_id=founder.id,
            outcome="founder_provisioned",
            detail={"event": etype},
        )
        await session.commit()
        return {"ok": True, "created": str(founder.id)}

    # user.deleted etc. — acknowledge; DPDP erase-on-delete is wired separately.
    return {"ok": True, "ignored": etype}
