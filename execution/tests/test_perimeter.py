"""Slice 2.4 — the perimeter under attack.

Covered: rate limits (hammering → 429 + Retry-After + alarm, refill restores),
security headers on every response, the review page's nonce CSP, the
hash-chained audit log (tampering detected, redaction survives, erasure
doesn't break the chain), and the siren — the demo this slice owes: a
publish-without-approval attempt FIRES a critical alert, not just a row.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.api.app import create_app
from mrk18_execution.audit.recorder import (
    clear_alert_hooks,
    record,
    register_alert_hook,
    verify_audit_chain,
)
from mrk18_execution.db.models import ApprovalEventRow, AuditRow, ContentItemRow, FounderRow, RunRow
from mrk18_execution.publishers.service import publish_run
from mrk18_execution.schemas.enums import AuditEventType
from mrk18_execution.security.ratelimit import RateLimiter
from mrk18_execution.security.retention import erase_founder, purge_audit_older_than
from tests.authtools import MAINTENANCE_KEY, install_auth

KEY = "test-approval-signing-key"


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture(autouse=True)
def _clean_hooks():
    clear_alert_hooks()
    yield
    clear_alert_hooks()


# ── rate limits ──────────────────────────────────────────────────────────────


def test_limiter_buckets_refill_and_classify():
    clock = [0.0]
    limiter = RateLimiter(default_per_min=60, clock=lambda: clock[0])
    assert limiter.classify("POST", f"/founders/{uuid4()}/runs") == ("run_start", 10)
    assert limiter.classify("POST", f"/runs/{uuid4()}/gate2") == ("gates", 60)
    assert limiter.classify("GET", "/founders/x/intake") == ("default", 60)

    key = "1.2.3.4"
    for _ in range(60):
        allowed, _, _ = limiter.check(key, "GET", "/x")
        assert allowed
    allowed, retry_after, should_alert = limiter.check(key, "GET", "/x")
    assert not allowed and retry_after > 0 and should_alert
    # second refusal inside the cooldown does NOT re-alarm
    assert limiter.check(key, "GET", "/x")[2] is False
    # other callers are unaffected
    assert limiter.check("5.6.7.8", "GET", "/x")[0]
    # one second refills one token at 60/min
    clock[0] += 1.0
    assert limiter.check(key, "GET", "/x")[0]


async def test_hammering_endpoint_429_and_alarmed(engine):
    app = create_app(engine=engine)
    install_auth(app)
    app.state.rate_limiter = RateLimiter(default_per_min=3)
    fired = []
    register_alert_hook(lambda rec: fired.append(rec.outcome))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        for _ in range(3):
            assert (await client.get("/founders")).status_code in (404, 405)  # any route counts
        blocked = await client.get("/founders")
        assert blocked.status_code == 429
        assert int(blocked.headers["retry-after"]) >= 1
        # health stays reachable even while throttled
        assert (await client.get("/health")).status_code == 200
    assert "rate_limit_exceeded" in fired
    async with engine.connect() as conn:
        outcomes = (
            await conn.execute(
                select(AuditRow.outcome).where(AuditRow.event_type == "security_alert")
            )
        ).scalars().all()
    assert "rate_limit_exceeded" in outcomes


# ── security headers ─────────────────────────────────────────────────────────


async def test_security_headers_on_every_response(client):
    resp = await client.get("/health")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert resp.headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in resp.headers["content-security-policy"]
    assert resp.headers["cache-control"] == "no-store"
    assert "max-age" in resp.headers["strict-transport-security"]


async def test_review_page_nonce_csp(client, engine):
    from tests.authtools import REVIEW_TOKEN_KEY

    from mrk18_execution.security.reviewtoken import mint_review_token

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        f = FounderRow(email=f"{uuid4().hex[:8]}@csp.test")
        session.add(f)
        await session.flush()
        run = RunRow(run_id=uuid4(), founder_id=f.id, thread_id=str(uuid4()), status="done")
        session.add(run)
        await session.commit()
        run_id = run.run_id

    t = mint_review_token(REVIEW_TOKEN_KEY, run_id)
    page = await client.get(f"/review/{run_id}?t={t}")
    assert page.status_code == 200
    csp = page.headers["content-security-policy"]
    assert "script-src 'nonce-" in csp and "style-src 'nonce-" in csp
    nonce = csp.split("script-src 'nonce-")[1].split("'")[0]
    assert f'<script nonce="{nonce}">' in page.text  # the page's own script runs
    assert "default-src 'none'" in csp  # everything else doesn't


# ── the hash chain ───────────────────────────────────────────────────────────


async def _record_n(factory, founder_id, n, outcome="step"):
    async with factory() as session:
        for i in range(n):
            await record(
                session,
                event_type=AuditEventType.AGENT_ACTION,
                agent_id="system:test",
                founder_id=founder_id,
                outcome=f"{outcome}_{i}",
            )
        await session.commit()


async def test_chain_links_and_detects_tampering(factory):
    fid = uuid4()
    await _record_n(factory, fid, 3)
    result = await verify_audit_chain(factory)
    assert result["ok"] and result["checked"] == 3 and not result["breaks"]

    # rows actually link
    async with factory() as session:
        rows = (
            (await session.execute(select(AuditRow).order_by(AuditRow.id))).scalars().all()
        )
    assert rows[0].prev_hash == "genesis"
    assert rows[1].prev_hash == rows[0].row_hash
    assert rows[2].prev_hash == rows[1].row_hash

    # an attacker rewrites history straight in the DB
    async with factory() as session:
        await session.execute(
            update(AuditRow)
            .where(AuditRow.id == rows[1].id)
            .values(outcome="never happened")
        )
        await session.commit()
    result = await verify_audit_chain(factory)
    assert not result["ok"]
    assert result["breaks"][0]["row_id"] == rows[1].id
    assert result["breaks"][0]["reason"] == "content mismatch"


async def test_chains_are_per_scope(factory):
    a, b = uuid4(), uuid4()
    await _record_n(factory, a, 2)
    await _record_n(factory, b, 2)
    await _record_n(factory, None, 1)  # global scope (system events)
    result = await verify_audit_chain(factory)
    assert result["ok"] and result["scopes"] == 3 and result["checked"] == 5


async def test_purge_redacts_old_rows_and_chain_survives(factory):
    """Retention purge past the window REDACTS in place (never hard-deletes), so
    the tamper-evident chain still verifies — lawful retention must not look
    like rewritten history (A3)."""
    fid = uuid4()
    await _record_n(factory, fid, 4)
    # backdate the two oldest rows beyond the 24-month window
    old = datetime.now(timezone.utc) - timedelta(days=800)
    async with factory() as session:
        rows = (await session.execute(select(AuditRow).order_by(AuditRow.id))).scalars().all()
        for r in rows[:2]:
            await session.execute(
                update(AuditRow).where(AuditRow.id == r.id).values(created_at=old)
            )
        await session.commit()

    redacted = await purge_audit_older_than(factory)  # default 730-day window
    assert redacted == 2

    result = await verify_audit_chain(factory)
    assert result["ok"], result  # lawful retention — NOT tampering
    assert result["redacted"] == 2

    async with factory() as session:
        rows = (await session.execute(select(AuditRow).order_by(AuditRow.id))).scalars().all()
    assert len(rows) == 4  # nothing hard-deleted — the chain skeleton survives
    assert rows[0].redacted and rows[0].detail == {"redacted": True}
    assert not rows[3].redacted  # recent rows untouched


async def test_erasure_redacts_but_chain_survives(factory):
    async with factory() as session:
        f = FounderRow(email=f"{uuid4().hex[:8]}@chain.test")
        session.add(f)
        await session.commit()
        fid = f.id
    await _record_n(factory, fid, 3)

    counts = await erase_founder(factory, fid)
    assert counts["audit_log_redacted"] == 3

    result = await verify_audit_chain(factory)
    assert result["ok"], result  # redaction is lawful — NOT tampering
    assert result["redacted"] == 3
    # and the erasure marker itself extended the founder's chain
    async with factory() as session:
        marker = (
            await session.execute(
                select(AuditRow).where(
                    AuditRow.founder_id == fid, AuditRow.outcome == "founder_erased"
                )
            )
        ).scalar_one()
    assert marker.row_hash and marker.prev_hash


async def test_verify_endpoint_behind_maintenance_key(client, factory):
    await _record_n(factory, uuid4(), 1)
    naked = await client.post("/maintenance/verify-audit-chain")
    assert naked.status_code == 401
    ok = await client.post(
        "/maintenance/verify-audit-chain", headers={"X-Maintenance-Key": MAINTENANCE_KEY}
    )
    assert ok.status_code == 200
    assert ok.json()["ok"] is True


# ── THE DEMO: publish-without-approval fires the siren ───────────────────────


async def test_rogue_publish_fires_critical_alert(factory, engine, tmp_path, caplog):
    async with factory() as session:
        founder = FounderRow(email=f"{uuid4().hex[:8]}@siren.test")
        session.add(founder)
        await session.flush()
        run = RunRow(
            run_id=uuid4(), founder_id=founder.id, thread_id=str(uuid4()), status="done"
        )
        session.add(run)
        item = ContentItemRow(
            item_id=uuid4(),
            run_id=run.run_id,
            founder_id=founder.id,
            platform="linkedin",
            format="linkedin_post",
            body="never approved, trying anyway",
            status="approved",
        )
        session.add(item)
        # forged approval with no signature — the 2.3 guard will refuse it
        session.add(
            ApprovalEventRow(
                event_id=uuid4(),
                run_id=run.run_id,
                item_id=item.item_id,
                founder_id=founder.id,
                decision="approved",
            )
        )
        await session.commit()
        run_id = run.run_id

    heard = []
    register_alert_hook(lambda rec: heard.append(rec.outcome))
    with caplog.at_level(logging.CRITICAL, logger="mrk18.audit"):
        summary = await publish_run(
            factory, run_id, mode="export", export_dir=tmp_path, signing_key=KEY
        )

    assert summary[0]["status"] == "REFUSED"  # blocked...
    assert "publish_refused_no_valid_approval" in heard  # ...the hook heard it...
    assert any(
        "SECURITY ALERT" in r.message and r.levelno == logging.CRITICAL
        for r in caplog.records
    )  # ...and the siren actually sounded
