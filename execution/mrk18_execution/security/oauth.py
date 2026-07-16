"""S2 — OAuth 2.1 with PKCE (S256): how a founder connects an account
without MRK18 ever seeing their password.

Flow: start() mints a state + code_verifier, stores them server-side, and
returns the provider authorize URL carrying the S256 challenge. The provider
redirects back with ?state&code; complete() validates the state (single-use,
expiring) and exchanges code+verifier for tokens, which go straight into the
vault. Provider endpoints are config — real platforms at go-live, a mock in
tests; the flow logic is identical.
"""

import base64
import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import OAuthStateRow

STATE_TTL_MINUTES = 10


class OAuthError(Exception):
    pass


@dataclass(frozen=True)
class ProviderConfig:
    platform: str
    authorize_url: str
    token_url: str
    client_id: str
    client_secret: str
    redirect_uri: str
    # Facebook Login for Business (what Meta gives new Business apps) takes its
    # permissions from a saved Configuration in the app dashboard, identified by
    # this id — it IGNORES `scope`, and a scope-only dialog gets rejected. Empty
    # = the classic scope-based flow (every other provider).
    config_id: str = ""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def make_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) per RFC 7636, S256."""
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


async def start_connection(
    session: AsyncSession,
    provider: ProviderConfig,
    founder_id: UUID,
    scopes: list[str],
) -> dict:
    """Mint state+verifier, persist them, return the authorize URL."""
    verifier, challenge = make_pkce_pair()
    state = secrets.token_urlsafe(32)
    session.add(
        OAuthStateRow(
            state=state,
            founder_id=founder_id,
            platform=provider.platform,
            code_verifier=verifier,
            expires_at=_utcnow() + timedelta(minutes=STATE_TTL_MINUTES),
        )
    )
    params = {
        "response_type": "code",
        "client_id": provider.client_id,
        "redirect_uri": provider.redirect_uri,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if provider.config_id:
        # Login for Business: the Configuration carries the permissions. Sending
        # `scope` alongside it is ignored at best, so it's left off entirely —
        # `scopes` still gates the caller via default_scopes/ScopeViolation.
        params["config_id"] = provider.config_id
    else:
        params["scope"] = " ".join(scopes)
    return {"authorize_url": f"{provider.authorize_url}?{urlencode(params)}", "state": state}


async def consume_state(session: AsyncSession, state: str) -> OAuthStateRow:
    """Validate and DESTROY the state row (single-use, expiring)."""
    row = await session.get(OAuthStateRow, state)
    if row is None:
        raise OAuthError("unknown or already-used state (possible CSRF)")
    expires = row.expires_at
    if expires.tzinfo is None:  # SQLite test DB strips tz
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < _utcnow():
        await session.delete(row)
        raise OAuthError("state expired — restart the connection")
    await session.delete(row)  # single-use, always
    return row


async def exchange_code(
    provider: ProviderConfig,
    code: str,
    code_verifier: str,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict:
    """code + verifier → tokens. `transport` lets tests inject a mock provider."""
    async with httpx.AsyncClient(timeout=30, transport=transport) as client:
        resp = await client.post(
            provider.token_url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": provider.redirect_uri,
                "client_id": provider.client_id,
                "client_secret": provider.client_secret,
                "code_verifier": code_verifier,
            },
            headers={"Accept": "application/json"},
        )
    if resp.status_code != 200:
        raise OAuthError(f"token exchange failed: HTTP {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    if "access_token" not in data:
        raise OAuthError("token exchange response missing access_token")
    return data
