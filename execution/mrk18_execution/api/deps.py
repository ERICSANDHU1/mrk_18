"""Shared FastAPI dependencies.

The session is NOT auto-committing: endpoints commit explicitly. This matters
for the audit trail — a rejected gate attempt still commits its audit record
before the error response goes out (evidence survives failure).

Auth (S1) lives here too. The chain is:

    get_verified_claims  →  current_founder  →  require_founder / require_run

* ``get_verified_claims`` — the Bearer JWT is verified (signature, expiry,
  audience) against the Supabase JWKS. No token → 401. Auth unconfigured →
  503, never open.
* ``current_founder`` — the verified ``sub`` must map to a founder row.
* ``require_founder`` — the founder in the URL must BE the caller (403 +
  audit otherwise). ``require_run`` does the same through a run's owner.

The rule these encode: the dashboard is a window, not a wall — ownership is
enforced HERE, on the server, never in the browser.
"""

from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import repositories as repo
from ..db.models import FounderRow, RunRow
from ..security.auth import AuthError
from ..security.tenant import apply_tenant_scope

AUTH_AGENT = "system:auth"

# B1 — declare the Bearer JWT as an OpenAPI security scheme so /docs shows an
# Authorize button and generated clients know auth is required. auto_error=False
# keeps get_verified_claims the single source of the 401/503 semantics below.
bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="BearerJWT",
    description="Clerk/Supabase session JWT — send as `Authorization: Bearer <token>`.",
)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    factory = request.app.state.session_factory
    async with factory() as session:
        yield session
        # uncommitted work is rolled back when the session closes


async def get_verified_claims(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """Verify the Bearer JWT and return its claims. 401 without proof, 503 unconfigured."""
    verifier = getattr(request.app.state, "jwt_verifier", None)
    if verifier is None:
        raise HTTPException(
            status_code=503,
            detail="auth not configured (SUPABASE_JWKS_URL) — refusing to serve data unauthenticated",
        )
    # Via FastAPI DI, `credentials` is the parsed Bearer header (or None). When
    # called directly (e.g. _authorize_gate passes only `request`), the default
    # Depends marker arrives instead — fall back to parsing the header ourselves.
    if isinstance(credentials, HTTPAuthorizationCredentials):
        token = (credentials.credentials or "").strip()
    else:
        scheme, _, raw = request.headers.get("authorization", "").partition(" ")
        token = raw.strip() if scheme.lower() == "bearer" else ""
    if not token:
        raise HTTPException(
            status_code=401,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return await verifier.verify(token)
    except AuthError as exc:
        raise HTTPException(
            status_code=401,
            detail=f"invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def current_founder(
    claims: dict = Depends(get_verified_claims),
    session: AsyncSession = Depends(get_session),
) -> FounderRow:
    sub = (claims.get("sub") or "").strip()
    founder = await repo.get_founder_by_auth_user(session, sub) if sub else None
    if founder is None:
        # Self-heal: the Clerk session subject can change (account re-created, a new
        # local-dev session, dev vs prod instance). The verified token still proves
        # this email, so RELINK the existing founder to the current sub instead of
        # 403-ing — which would strand an already-onboarded founder (no chats, no
        # quota, /me fails). Idempotent when the sub already matches.
        email = (claims.get("email") or "").strip()
        if email:
            existing = await repo.get_founder_by_email(session, email)
            if existing is not None:
                if sub and existing.auth_user_id != sub:
                    existing.auth_user_id = sub
                    await session.commit()
                return existing
        raise HTTPException(
            status_code=403,
            detail="no founder is linked to this account — create one via POST /founders",
        )
    return founder


async def record_denial(session: AsyncSession, request: Request, founder_id: UUID) -> None:
    """Cross-tenant attempts are evidence — persist them before the 403 goes out."""
    from ..audit.recorder import record
    from ..schemas.enums import AuditEventType

    await record(
        session,
        event_type=AuditEventType.SECURITY_ALERT,
        agent_id=AUTH_AGENT,
        founder_id=founder_id,
        outcome="authz_denied",
        detail={"method": request.method, "path": request.url.path},
    )
    await session.commit()


async def require_founder(
    founder_id: UUID,
    request: Request,
    founder: FounderRow = Depends(current_founder),
    session: AsyncSession = Depends(get_session),
) -> FounderRow:
    """The {founder_id} in the path must be the authenticated caller."""
    if founder.id != founder_id:
        await record_denial(session, request, founder.id)
        raise HTTPException(status_code=403, detail="you can only access your own data")
    return founder


async def require_run(
    run_id: UUID,
    request: Request,
    founder: FounderRow = Depends(current_founder),
    session: AsyncSession = Depends(get_session),
) -> RunRow:
    """Load the run and prove the authenticated caller owns it."""
    row = await session.get(RunRow, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="run not found")
    if row.founder_id != founder.id:
        await record_denial(session, request, founder.id)
        raise HTTPException(status_code=403, detail="you can only access your own runs")
    return row


# ── RLS scope dependencies ───────────────────────────────────────────────────
# These run AFTER the API-layer ownership check (require_founder/require_run),
# which keeps the clean 403/404 semantics and the security_alert audit. They
# add the DB-enforced second wall: everything the endpoint touches afterward is
# scoped to the tenant role, so even an app bug can't reach another founder's
# rows. SET LOCAL self-resets on the endpoint's commit — no leak to the pool.


async def founder_scope(
    founder: FounderRow = Depends(require_founder),
    session: AsyncSession = Depends(get_session),
) -> FounderRow:
    await apply_tenant_scope(session, founder.id)
    return founder


async def run_scope(
    run: RunRow = Depends(require_run),
    session: AsyncSession = Depends(get_session),
) -> RunRow:
    await apply_tenant_scope(session, run.founder_id)
    return run
