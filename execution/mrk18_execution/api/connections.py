"""S2 endpoints — connect / list / revoke platform accounts.

Views NEVER contain tokens (not even ciphertext): status, scopes, expiry and
the reconnect nudge only. Providers are config: real platforms at go-live,
a mock in tests — same code path.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from ..config import get_settings
from ..db.models import ConnectedAccountRow, FounderRow
from ..security import oauth as oauth_flow
from ..security.scopes import ScopeViolation, default_scopes
from ..security.tenant import tenant_session
from ..security.vault import needs_reconnect, revoke_account
from .deps import require_founder

log = logging.getLogger("mrk18.connections")

router = APIRouter(tags=["connections"])


def _schedule_meta_pull(request: Request, founder_id: UUID) -> None:
    """Fire-and-forget: PULL the founder's Meta ad data right after connect so it's
    ready for them to review. Best-effort — never blocks the redirect, never raises
    into the request. NO analysis runs here: the data is stored as a pending
    snapshot and the founder approves before the CMO diagnoses it. No-op without a
    vault."""
    vault = getattr(request.app.state, "vault", None)
    if vault is None:
        return
    factory = request.app.state.session_factory
    transport = getattr(request.app.state, "meta_transport", None)
    tasks: set = request.app.state.background_tasks

    async def _run() -> None:
        from ..integrations import meta_ads

        try:
            async with tenant_session(factory, founder_id) as session:
                await meta_ads.pull_founder(session, vault, founder_id, transport=transport)
        except Exception:  # noqa: BLE001 — the pull must never crash anything
            log.exception("meta pull failed for founder %s", founder_id)

    task = asyncio.create_task(_run())
    tasks.add(task)
    task.add_done_callback(tasks.discard)


def _vault_or_503(request: Request):
    vault = getattr(request.app.state, "vault", None)
    if vault is None:
        raise HTTPException(status_code=503, detail="token vault not configured (TOKEN_VAULT_KEY)")
    return vault


def _provider_or_503(request: Request, platform: str):
    providers = getattr(request.app.state, "oauth_providers", {}) or {}
    provider = providers.get(platform)
    if provider is None:
        raise HTTPException(
            status_code=503,
            detail=f"{platform} OAuth app not configured yet (go-live step)",
        )
    return provider


@router.get("/founders/{founder_id}/connections", response_model=list[dict])
async def list_connections(
    founder_id: UUID,
    request: Request,
    _founder: FounderRow = Depends(require_founder),
) -> list[dict]:
    factory = request.app.state.session_factory
    async with tenant_session(factory, founder_id) as session:
        if await session.get(FounderRow, founder_id) is None:
            raise HTTPException(status_code=404, detail="founder not found")
        rows = (
            (
                await session.execute(
                    select(ConnectedAccountRow).where(
                        ConnectedAccountRow.founder_id == founder_id
                    )
                )
            )
            .scalars()
            .all()
        )
    return [
        {
            "platform": r.platform,
            "status": r.status,
            "scopes": r.scopes,
            "external_ref": r.external_ref,
            "token_expires_at": str(r.token_expires_at) if r.token_expires_at else None,
            "needs_reconnect": needs_reconnect(r),
            # deliberately NO token fields — not even ciphertext
        }
        for r in rows
    ]


@router.post("/founders/{founder_id}/connections/{platform}/start", response_model=dict)
async def start_connection(
    founder_id: UUID,
    platform: str,
    request: Request,
    _founder: FounderRow = Depends(require_founder),
) -> dict:
    _vault_or_503(request)
    provider = _provider_or_503(request, platform)
    factory = request.app.state.session_factory
    async with tenant_session(factory, founder_id) as session:
        if await session.get(FounderRow, founder_id) is None:
            raise HTTPException(status_code=404, detail="founder not found")
        try:
            result = await oauth_flow.start_connection(
                session, provider, founder_id, default_scopes(platform)
            )
        except ScopeViolation as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        await session.commit()
    return result


@router.get("/oauth/callback", response_model=dict)
async def oauth_callback(state: str, code: str, request: Request) -> dict:
    # Deliberately NOT bearer-protected: this is a top-level browser redirect
    # from the platform, which carries no Authorization header. The single-use,
    # expiring `state` minted in start_connection IS the credential here.
    vault = _vault_or_503(request)
    factory = request.app.state.session_factory
    transport = getattr(request.app.state, "oauth_transport", None)

    async with factory() as session:
        try:
            pending = await oauth_flow.consume_state(session, state)
        except oauth_flow.OAuthError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        provider = _provider_or_503(request, pending.platform)
        try:
            tokens = await oauth_flow.exchange_code(
                provider, code, pending.code_verifier, transport=transport
            )
        except oauth_flow.OAuthError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        # Meta quirk: the code exchange returns a SHORT-lived token and no ad
        # account. Swap it for a ~60-day token and link the primary ad account
        # before anything is stored.
        if pending.platform == "meta":
            from ..integrations import meta_ads

            meta_transport = getattr(request.app.state, "meta_transport", None)
            try:
                finalized = await meta_ads.finalize_oauth(
                    provider, tokens["access_token"], transport=meta_transport
                )
            except meta_ads.MetaError as exc:
                raise HTTPException(status_code=502, detail=str(exc))
            tokens = {**tokens, **finalized}  # long-lived access_token, expires_in, external_ref

        expires_at = None
        if tokens.get("expires_in"):
            expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=int(tokens["expires_in"])
            )
        try:
            await vault.store_tokens(
                session,
                founder_id=pending.founder_id,
                platform=pending.platform,
                access_token=tokens["access_token"],
                refresh_token=tokens.get("refresh_token"),
                expires_at=expires_at,
                scopes=(tokens.get("scope") or "").split() or default_scopes(pending.platform),
                external_ref=tokens.get("external_ref"),
            )
        except ScopeViolation as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        await session.commit()

    # auto-pull the founder's ad data so it's ready for review — analysis waits
    # for their explicit approval (no auto-diagnosis on connect)
    if pending.platform == "meta":
        _schedule_meta_pull(request, pending.founder_id)

    # Browser redirect back to the app when configured; else legacy JSON (tests).
    web = (get_settings().web_base_url or "").rstrip("/")
    if web:
        return RedirectResponse(
            url=f"{web}/console/leaks?connected={pending.platform}", status_code=303
        )
    return {"platform": pending.platform, "status": "connected"}


@router.delete("/founders/{founder_id}/connections/{platform}", response_model=dict)
async def disconnect(
    founder_id: UUID,
    platform: str,
    request: Request,
    _founder: FounderRow = Depends(require_founder),
) -> dict:
    factory = request.app.state.session_factory
    try:
        return await revoke_account(factory, founder_id, platform)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
