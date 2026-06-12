"""Slice 2.1 — S2: the token vault under attack.

Covered: envelope crypto (unique DEKs, wrong-key failure), the minimum-scope
policy, the full OAuth+PKCE flow against a mock provider, plaintext never in
the DB / audit / API views, single-use state, the <60s revocation rule with
pending-work cancellation, and the reconnect nudge.
"""

import base64
import hashlib
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.api.app import create_app
from mrk18_execution.db.models import (
    AuditRow,
    ConnectedAccountRow,
    ContentItemRow,
    FounderRow,
    PublishResultRow,
    RunRow,
)
from mrk18_execution.security.oauth import ProviderConfig, make_pkce_pair
from mrk18_execution.security.scopes import ScopeViolation, validate_scopes
from mrk18_execution.security.vault import (
    TokenVault,
    VaultError,
    needs_reconnect,
    revoke_account,
)
from tests.authtools import install_auth, mint

PLAINTEXT = "SECRET-ACCESS-TOKEN-xyz-123"


# ── envelope crypto ──────────────────────────────────────────────────────────


def test_envelope_roundtrip_and_unique_deks():
    vault = TokenVault(Fernet.generate_key().decode())
    w1, c1 = vault.seal(PLAINTEXT)
    w2, c2 = vault.seal(PLAINTEXT)
    assert vault.open(w1, c1) == PLAINTEXT
    assert vault.open(w2, c2) == PLAINTEXT
    assert (w1, c1) != (w2, c2)  # fresh DEK per record — no pattern leakage
    assert PLAINTEXT not in c1 and PLAINTEXT not in w1


def test_wrong_master_key_cannot_decrypt():
    vault_a = TokenVault(Fernet.generate_key().decode())
    vault_b = TokenVault(Fernet.generate_key().decode())
    wrapped, ciphertext = vault_a.seal(PLAINTEXT)
    with pytest.raises(VaultError, match="decryption failed"):
        vault_b.open(wrapped, ciphertext)


def test_missing_master_key_refused():
    with pytest.raises(VaultError, match="not configured"):
        TokenVault("")


# ── scope policy ─────────────────────────────────────────────────────────────


def test_minimum_scopes_pass():
    assert validate_scopes("linkedin", ["w_member_social", "openid"]) == [
        "w_member_social",
        "openid",
    ]


def test_forbidden_scope_hint_rejected():
    with pytest.raises(ScopeViolation, match="forbidden by policy"):
        validate_scopes("x", ["dm.write"])


def test_over_scope_rejected():
    with pytest.raises(ScopeViolation, match="exceeds the minimum-scope policy"):
        validate_scopes("linkedin", ["w_organization_social"])  # company pages: not ours


# ── PKCE ─────────────────────────────────────────────────────────────────────


def test_pkce_pair_is_valid_s256():
    verifier, challenge = make_pkce_pair()
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    assert challenge == expected
    assert 43 <= len(verifier) <= 128  # RFC 7636 bounds


# ── full flow against a mock provider ───────────────────────────────────────

MOCK_PROVIDER = ProviderConfig(
    platform="linkedin",
    authorize_url="https://mock.provider/authorize",
    token_url="https://mock.provider/token",
    client_id="mock-client",
    client_secret="mock-secret",
    redirect_uri="http://127.0.0.1:8000/oauth/callback",
)


def _mock_provider_transport():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        body = dict(pair.split("=", 1) for pair in request.content.decode().split("&"))
        seen.update(body)
        return httpx.Response(
            200,
            json={
                "access_token": PLAINTEXT,
                "refresh_token": "SECRET-REFRESH-abc",
                "expires_in": 60 * 60 * 24 * 60,  # 60 days (LinkedIn-style)
                "scope": "w_member_social openid profile",
            },
        )

    return httpx.MockTransport(handler), seen


@pytest.fixture
async def vault_client(engine):
    app = create_app(engine=engine)
    install_auth(app)
    app.state.vault = TokenVault(Fernet.generate_key().decode())
    app.state.oauth_providers = {"linkedin": MOCK_PROVIDER}
    transport, seen = _mock_provider_transport()
    app.state.oauth_transport = transport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        yield client, app, seen


async def _founder(engine, client) -> str:
    """Create a founder bound to a fresh auth identity; the client speaks as them."""
    sub = uuid4()
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        f = FounderRow(email=f"{uuid4().hex[:8]}@vault.test", auth_user_id=sub)
        session.add(f)
        await session.commit()
        fid = str(f.id)
    client.headers["Authorization"] = f"Bearer {mint(sub)}"
    return fid


async def test_full_connect_flow_stores_only_ciphertext(vault_client, engine):
    client, app, seen = vault_client
    fid = await _founder(engine, client)

    start = await client.post(f"/founders/{fid}/connections/linkedin/start")
    assert start.status_code == 200
    url = start.json()["authorize_url"]
    assert "code_challenge_method=S256" in url and "state=" in url
    state = start.json()["state"]

    done = await client.get(f"/oauth/callback?state={state}&code=mock-code")
    assert done.status_code == 200, done.text
    assert done.json() == {"platform": "linkedin", "status": "connected"}
    # PKCE verifier actually reached the provider
    assert "code_verifier" in seen and len(seen["code_verifier"]) >= 43

    # DB holds ciphertext only — the plaintext appears NOWHERE
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        acct = (
            await session.execute(select(ConnectedAccountRow))
        ).scalar_one()
        audits = (
            (await session.execute(select(AuditRow))).scalars().all()
        )
    assert acct.status == "connected"
    assert acct.token_ciphertext and PLAINTEXT not in acct.token_ciphertext
    assert PLAINTEXT not in (acct.refresh_ciphertext or "")
    for a in audits:  # tokens never audited
        assert PLAINTEXT not in str(a.detail)

    # API view exposes no token material at all
    view = (await client.get(f"/founders/{fid}/connections")).json()
    assert PLAINTEXT not in str(view)
    assert "ciphertext" not in str(view)
    assert view[0]["status"] == "connected"

    # but the vault CAN hand the adapter the real token
    async with factory() as session:
        token = await app.state.vault.get_access_token(
            session, acct.founder_id, "linkedin"
        )
    assert token == PLAINTEXT


async def test_state_is_single_use(vault_client, engine):
    client, app, seen = vault_client
    fid = await _founder(engine, client)
    state = (await client.post(f"/founders/{fid}/connections/linkedin/start")).json()["state"]
    assert (await client.get(f"/oauth/callback?state={state}&code=c")).status_code == 200
    replay = await client.get(f"/oauth/callback?state={state}&code=c")
    assert replay.status_code == 400  # replayed/CSRF state refused


async def test_unconfigured_provider_503(vault_client, engine):
    client, app, seen = vault_client
    fid = await _founder(engine, client)
    resp = await client.post(f"/founders/{fid}/connections/x/start")
    assert resp.status_code == 503


# ── revocation: the <60s rule ────────────────────────────────────────────────


async def test_revoke_destroys_ciphertext_and_cancels_pending(vault_client, engine):
    client, app, seen = vault_client
    fid = await _founder(engine, client)
    state = (await client.post(f"/founders/{fid}/connections/linkedin/start")).json()["state"]
    await client.get(f"/oauth/callback?state={state}&code=c")

    # plant a pending publish task for this founder+platform
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        from uuid import UUID

        run = RunRow(run_id=uuid4(), founder_id=UUID(fid), thread_id=str(uuid4()), status="done")
        item = ContentItemRow(
            item_id=uuid4(),
            run_id=run.run_id,
            founder_id=UUID(fid),
            platform="linkedin",
            format="linkedin_post",
            body="pending post",
            status="approved",
        )
        pending = PublishResultRow(
            request_id=f"{item.item_id}:linkedin_api",
            item_id=item.item_id,
            run_id=run.run_id,
            founder_id=UUID(fid),
            platform="linkedin",
            adapter="linkedin_api",
            status="retryable",
        )
        session.add_all([run, item, pending])
        await session.commit()
        pending_id = pending.result_id

    resp = await client.delete(f"/founders/{fid}/connections/linkedin")
    assert resp.status_code == 200
    body = resp.json()
    assert body["pending_cancelled"] == 1
    assert body["seconds"] < 60  # the rule — in practice it's instant

    async with factory() as session:
        acct = (await session.execute(select(ConnectedAccountRow))).scalar_one()
        cancelled = await session.get(PublishResultRow, pending_id)
    assert acct.status == "revoked"
    assert acct.token_ciphertext is None and acct.wrapped_dek is None  # destroyed
    assert cancelled.status == "failed" and "revoked" in cancelled.error

    # and the vault now refuses to produce a token
    async with factory() as session:
        with pytest.raises(VaultError, match="no connected"):
            await app.state.vault.get_access_token(session, acct.founder_id, "linkedin")


async def test_revoke_unknown_connection_404(vault_client, engine):
    client, app, seen = vault_client
    fid = await _founder(engine, client)
    resp = await client.delete(f"/founders/{fid}/connections/linkedin")
    assert resp.status_code == 404


# ── reconnect nudge ─────────────────────────────────────────────────────────


def test_needs_reconnect_at_day_55_of_60():
    acct = ConnectedAccountRow(
        founder_id=uuid4(),
        platform="linkedin",
        status="connected",
        token_expires_at=datetime.now(timezone.utc) + timedelta(days=5),
    )
    assert needs_reconnect(acct) is True
    acct.token_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    assert needs_reconnect(acct) is False
    acct.status = "revoked"
    assert needs_reconnect(acct) is False


async def test_revoke_via_service_function_directly(engine):
    """revoke_account also works without HTTP (ops/cron path)."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    vault = TokenVault(Fernet.generate_key().decode())
    async with factory() as session:
        f = FounderRow(email="direct@vault.test")
        session.add(f)
        await session.flush()
        await vault.store_tokens(
            session,
            founder_id=f.id,
            platform="x",
            access_token=PLAINTEXT,
            scopes=["tweet.write", "tweet.read"],
        )
        await session.commit()
        fid = f.id
    result = await revoke_account(factory, fid, "x")
    assert result["seconds"] < 60
