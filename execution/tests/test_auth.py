"""S1 auth hardening (perimeter, pulled ahead of Slice 2.4): the front door under attack.

The lesson this slice encodes: the dashboard is a window, not a wall. Every
test here talks STRAIGHT to the backend — no UI — and proves the wall holds:
no token, forged tokens, expired tokens, the alg-confusion classic, founder B
reaching for founder A's data (the URL-typing attack from the demo), and the
review-link capability being scoped to exactly one run.
"""

from uuid import UUID, uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.api.app import create_app
from mrk18_execution.db.models import AuditRow, RunRow
from mrk18_execution.security.reviewtoken import mint_review_token, verify_review_token
from tests.authtools import (
    MAINTENANCE_KEY,
    REVIEW_TOKEN_KEY,
    bearer,
    mint,
    mint_rogue,
)


async def _signup(client, email=None):
    """Register a founder with a fresh verified identity; returns (id, headers)."""
    headers = bearer(mint(uuid4(), email=email or f"{uuid4().hex[:8]}@auth.test"))
    resp = await client.post("/founders", json={}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["founder_id"], headers


async def _plant_run(engine, founder_id, status="done") -> str:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        run = RunRow(
            run_id=uuid4(),
            founder_id=UUID(founder_id),
            thread_id=str(uuid4()),
            status=status,
        )
        session.add(run)
        await session.commit()
        return str(run.run_id)


# ── the door without a badge ─────────────────────────────────────────────────


async def test_no_token_is_401(client):
    fid, _ = await _signup(client)
    resp = await client.get(f"/founders/{fid}/intake")
    assert resp.status_code == 401
    assert resp.headers.get("www-authenticate") == "Bearer"


async def test_garbage_token_is_401(client):
    fid, _ = await _signup(client)
    resp = await client.get(f"/founders/{fid}/intake", headers=bearer("not.a.jwt"))
    assert resp.status_code == 401


async def test_expired_token_is_401(client):
    fid, headers = await _signup(client)
    stale = bearer(mint(uuid4(), expires_in=-60))
    resp = await client.get(f"/founders/{fid}/intake", headers=stale)
    assert resp.status_code == 401


async def test_wrong_audience_is_401(client):
    fid, _ = await _signup(client)
    resp = await client.get(
        f"/founders/{fid}/intake", headers=bearer(mint(uuid4(), audience="anon"))
    )
    assert resp.status_code == 401


async def test_forged_key_is_401(client):
    """Structurally perfect token — but signed by a key Supabase never published."""
    fid, _ = await _signup(client)
    resp = await client.get(f"/founders/{fid}/intake", headers=bearer(mint_rogue()))
    assert resp.status_code == 401


async def test_hs256_alg_confusion_is_401(client):
    """The classic attack: claim HS256 so the public key becomes the HMAC secret."""
    fid, _ = await _signup(client)
    forged = mint(uuid4(), key="a-shared-secret-long-enough-for-hmac-sha256", alg="HS256")
    resp = await client.get(f"/founders/{fid}/intake", headers=bearer(forged))
    assert resp.status_code == 401


async def test_valid_token_but_no_founder_is_403(client):
    await _signup(client)  # someone else's founder exists
    stranger = bearer(mint(uuid4()))
    resp = await client.get(f"/founders/{uuid4()}/intake", headers=stranger)
    assert resp.status_code == 403


async def test_unconfigured_auth_fails_closed(engine):
    """No JWKS configured → 503 for everyone. Never open."""
    app = create_app(engine=engine)  # deliberately NO install_auth
    app.state.jwt_verifier = None  # independent of whatever the dev .env holds
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(f"/founders/{uuid4()}/intake")
        assert resp.status_code == 503
        resp = await client.post("/founders", json={"email": "a@b.co"})
        assert resp.status_code == 503


# ── the wall between founders ────────────────────────────────────────────────


async def test_own_data_allowed_others_denied_and_audited(client, engine):
    fid_a, headers_a = await _signup(client)
    fid_b, headers_b = await _signup(client)

    # A reads A: the window works
    own = await client.get(f"/founders/{fid_a}/intake", headers=headers_a)
    assert own.status_code == 200

    # B types A's id into the URL — the demo attack — and hits the wall
    cross = await client.get(f"/founders/{fid_a}/intake", headers=headers_b)
    assert cross.status_code == 403

    # ...same for the data-export door that started this conversation
    export = await client.get(f"/founders/{fid_a}/data-export", headers=headers_b)
    assert export.status_code == 403

    # and for erasure — B cannot erase A
    erase = await client.delete(f"/founders/{fid_a}", headers=headers_b)
    assert erase.status_code == 403

    # the attempts are evidence: security_alert rows persisted
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                select(AuditRow.outcome).where(AuditRow.event_type == "security_alert")
            )
        ).scalars().all()
    assert rows.count("authz_denied") >= 3


async def test_runs_are_owner_scoped(client, engine):
    fid_a, headers_a = await _signup(client)
    _fid_b, headers_b = await _signup(client)
    run_id = await _plant_run(engine, fid_a)

    assert (await client.get(f"/runs/{run_id}", headers=headers_a)).status_code == 200
    assert (await client.get(f"/runs/{run_id}", headers=headers_b)).status_code == 403
    assert (await client.get(f"/runs/{run_id}/items", headers=headers_b)).status_code == 403
    assert (await client.get(f"/runs/{uuid4()}", headers=headers_a)).status_code == 404


async def test_gate_decisions_are_owner_scoped(client, engine):
    fid_a, _headers_a = await _signup(client)
    _fid_b, headers_b = await _signup(client)
    run_id = await _plant_run(engine, fid_a, status="awaiting_gate1")

    # no badge, no review link → 401
    naked = await client.post(f"/runs/{run_id}/gate1", json={"action": "approve"})
    assert naked.status_code == 401
    # B's badge on A's run → 403
    cross = await client.post(
        f"/runs/{run_id}/gate1", json={"action": "approve"}, headers=headers_b
    )
    assert cross.status_code == 403
    # tampered review link, no badge → 401
    bad_link = await client.post(
        f"/runs/{run_id}/gate1?t=12345.deadbeef", json={"action": "approve"}
    )
    assert bad_link.status_code == 401


# ── the review link: a capability for exactly one run ────────────────────────


async def test_review_link_flow(client, engine):
    fid_a, headers_a = await _signup(client)
    _fid_b, headers_b = await _signup(client)
    run_id = await _plant_run(engine, fid_a, status="awaiting_gate1")

    # only the owner can mint the link
    assert (
        await client.get(f"/runs/{run_id}/review-link", headers=headers_b)
    ).status_code == 403
    minted = await client.get(f"/runs/{run_id}/review-link", headers=headers_a)
    assert minted.status_code == 200
    url = minted.json()["url"]

    # the link opens the page — no Authorization header at all
    page = await client.get(url)
    assert page.status_code == 200
    assert "Approve report" in page.text

    # naked or tampered links do not
    assert (await client.get(f"/review/{run_id}")).status_code == 401
    assert (await client.get(f"/review/{run_id}?t=12345.beef")).status_code == 401

    # the link's token authorizes gate decisions on THIS run...
    token = url.split("t=")[1]
    gate = await client.post(f"/runs/{run_id}/gate1?t={token}", json={"action": "approve"})
    # auth passed — 503 is the graph being unconfigured in tests, NOT a 401/403
    assert gate.status_code == 503

    # ...but is useless on any other run
    other_run = await _plant_run(engine, fid_a, status="awaiting_gate1")
    assert not verify_review_token(REVIEW_TOKEN_KEY, other_run, token)


def test_review_token_expiry_and_tamper():
    run_id = uuid4()
    good = mint_review_token(REVIEW_TOKEN_KEY, run_id)
    assert verify_review_token(REVIEW_TOKEN_KEY, run_id, good)
    assert not verify_review_token(REVIEW_TOKEN_KEY, run_id, good + "0")
    assert not verify_review_token(REVIEW_TOKEN_KEY, uuid4(), good)
    expired = mint_review_token(REVIEW_TOKEN_KEY, run_id, ttl_s=-10)
    assert not verify_review_token(REVIEW_TOKEN_KEY, run_id, expired)
    assert not verify_review_token(REVIEW_TOKEN_KEY, run_id, "garbage")
    assert not verify_review_token("other-key", run_id, good)


# ── ops endpoints are not founder endpoints ──────────────────────────────────


async def test_maintenance_requires_ops_key(client):
    no_key = await client.post("/maintenance/expire-stale-approvals")
    assert no_key.status_code == 401
    wrong = await client.post(
        "/maintenance/expire-stale-approvals", headers={"X-Maintenance-Key": "guess"}
    )
    assert wrong.status_code == 401
    right = await client.post(
        "/maintenance/expire-stale-approvals",
        headers={"X-Maintenance-Key": MAINTENANCE_KEY},
    )
    assert right.status_code == 200
