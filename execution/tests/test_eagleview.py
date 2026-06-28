"""Slice 3.1 — Eagle-View under test (and under attack).

The demo this slice owes: a published post gets signals across windows →
the founder sees the performance curve, half-life, and ranking — and founder
B reading founder A's numbers hits the wall like everywhere else.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import (
    AuditRow,
    ContentItemRow,
    FounderRow,
    PublishResultRow,
    RunRow,
    SignalRow,
)
from mrk18_execution.monitor.eagleview import (
    due_pulls,
    estimate_half_life_hours,
    pull_due_signals,
)
from mrk18_execution.monitor.sources import StubSignalSource
from mrk18_execution.schemas.enums import WindowPoint
from mrk18_execution.security.manifests import PermissionViolation, require_permission
from tests.authtools import MAINTENANCE_KEY, bearer, mint


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


async def seed_published_post(factory, *, sub=None, hours_ago=2.0, platform="linkedin"):
    """Founder (auth-linked) + run + item + a measurable publish result."""
    sub = sub or uuid4()
    async with factory() as session:
        founder = FounderRow(email=f"{uuid4().hex[:10]}@eagle.test", auth_user_id=sub)
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
            platform=platform,
            format={"x": "x_thread", "instagram": "ig_caption"}.get(platform, "linkedin_post"),
            body="Bitter truth: reach is rented, email lists are owned.",
            status="exported",
        )
        session.add(item)
        result = PublishResultRow(
            request_id=f"{item.item_id}:export",
            item_id=item.item_id,
            run_id=run.run_id,
            founder_id=founder.id,
            platform=platform,
            adapter="export",
            status="exported",
            published_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
        )
        session.add(result)
        await session.commit()
        return {
            "sub": sub,
            "founder_id": str(founder.id),
            "run_id": str(run.run_id),
            "item_id": str(item.item_id),
            "result_id": str(result.result_id),
        }


ENTRY = {"window_point": "1h", "reach": 900, "engagement_rate": 0.051, "saves": 12}


# ── the demo: signals in → performance out ───────────────────────────────────


async def test_manual_entry_to_performance_view(client, factory, engine):
    post = await seed_published_post(factory)
    headers = bearer(mint(post["sub"]))

    one_h = await client.post(
        f"/publish-results/{post['result_id']}/signals", json=ENTRY, headers=headers
    )
    assert one_h.status_code == 200, one_h.text
    day = await client.post(
        f"/publish-results/{post['result_id']}/signals",
        json={"window_point": "24h", "reach": 2400, "engagement_rate": 0.034},
        headers=headers,
    )
    assert day.status_code == 200

    perf = await client.get(f"/runs/{post['run_id']}/performance", headers=headers)
    assert perf.status_code == 200
    body = perf.json()
    assert body["items_measured"] == 1
    top = body["ranking"][0]
    assert top["windows"]["1h"]["reach"] == 900
    assert top["windows"]["24h"]["reach"] == 2400
    assert top["latest_reach"] == 2400  # latest window wins
    assert top["half_life_hours"] is not None

    # founder-wide view works too, and the writes are audited
    wide = await client.get(f"/founders/{post['founder_id']}/performance", headers=headers)
    assert wide.status_code == 200 and wide.json()["items_measured"] == 1
    async with engine.connect() as conn:
        outcomes = (await conn.execute(select(AuditRow.outcome))).scalars().all()
    assert outcomes.count("signal_recorded") == 2


async def test_re_entry_corrects_not_duplicates(client, factory):
    post = await seed_published_post(factory)
    headers = bearer(mint(post["sub"]))
    url = f"/publish-results/{post['result_id']}/signals"
    assert (await client.post(url, json=ENTRY, headers=headers)).status_code == 200
    fixed = {**ENTRY, "reach": 950}  # founder mistyped, corrects it
    assert (await client.post(url, json=fixed, headers=headers)).status_code == 200
    async with factory() as session:
        rows = (await session.execute(select(SignalRow))).scalars().all()
    assert len(rows) == 1 and rows[0].reach == 950


# ── the wall, same as everywhere ─────────────────────────────────────────────


async def test_cross_tenant_signals_blocked_and_alarmed(client, factory, engine):
    post_a = await seed_published_post(factory)
    post_b = await seed_published_post(factory)
    headers_b = bearer(mint(post_b["sub"]))

    # B reports numbers onto A's post → 403
    write = await client.post(
        f"/publish-results/{post_a['result_id']}/signals", json=ENTRY, headers=headers_b
    )
    assert write.status_code == 403
    # B reads A's performance → 403; no token at all → 401
    assert (
        await client.get(f"/runs/{post_a['run_id']}/performance", headers=headers_b)
    ).status_code == 403
    assert (
        await client.get(f"/founders/{post_a['founder_id']}/performance", headers=headers_b)
    ).status_code == 403
    assert (await client.get(f"/runs/{post_a['run_id']}/performance")).status_code == 401

    async with engine.connect() as conn:
        outcomes = (
            await conn.execute(
                select(AuditRow.outcome).where(AuditRow.event_type == "security_alert")
            )
        ).scalars().all()
    assert outcomes.count("authz_denied") >= 3


async def test_garbage_entry_rejected(client, factory):
    post = await seed_published_post(factory)
    headers = bearer(mint(post["sub"]))
    url = f"/publish-results/{post['result_id']}/signals"
    bad_window = await client.post(
        url, json={**ENTRY, "window_point": "2h"}, headers=headers
    )
    assert bad_window.status_code == 422
    bad_sentiment = await client.post(
        url, json={**ENTRY, "comment_sentiment": 2.0}, headers=headers
    )
    assert bad_sentiment.status_code == 422
    unknown = await client.post(
        f"/publish-results/{uuid4()}/signals", json=ENTRY, headers=headers
    )
    assert unknown.status_code == 404


# ── due-window math + automated pull ─────────────────────────────────────────


async def test_due_pulls_only_past_unpulled_windows(factory):
    post = await seed_published_post(factory, hours_ago=7.0)  # 1h + 6h due, 24h not
    async with factory() as session:
        work = await due_pulls(session)
    assert [w["window_point"] for w in work] == [WindowPoint.H1, WindowPoint.H6]
    assert str(work[0]["item_id"]) == post["item_id"]


async def test_pull_via_stub_source_fills_due_windows(factory):
    await seed_published_post(factory, hours_ago=200.0)  # all five windows due
    summary = await pull_due_signals(factory, {"linkedin": StubSignalSource()})
    assert summary == {"due": 5, "pulled": 5, "skipped_no_source": 0}
    # second pass: nothing left to do
    again = await pull_due_signals(factory, {"linkedin": StubSignalSource()})
    assert again["due"] == 0
    async with factory() as session:
        rows = (await session.execute(select(SignalRow))).scalars().all()
    assert len(rows) == 5 and all(r.source == "stub" for r in rows)
    # reach grows window over window (the stub models a real curve)
    by_window = {r.window_point: r.reach for r in rows}
    assert by_window["1h"] < by_window["24h"] < by_window["7d"]


async def test_pull_without_source_skips_honestly(factory):
    await seed_published_post(factory, hours_ago=2.0, platform="x")
    summary = await pull_due_signals(factory, {})  # no sources configured
    assert summary["pulled"] == 0 and summary["skipped_no_source"] == 1


async def test_maintenance_pull_endpoint(factory, engine):
    from httpx import ASGITransport, AsyncClient

    from mrk18_execution.api.app import create_app
    from tests.authtools import install_auth

    await seed_published_post(factory, hours_ago=7.0)
    app = create_app(engine=engine)
    install_auth(app)
    app.state.signal_sources = {"linkedin": StubSignalSource()}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        naked = await client.post("/maintenance/pull-signals")
        assert naked.status_code == 401
        ok = await client.post(
            "/maintenance/pull-signals", headers={"X-Maintenance-Key": MAINTENANCE_KEY}
        )
        assert ok.status_code == 200
        assert ok.json()["pulled"] == 2  # 1h + 6h windows


# ── half-life math ───────────────────────────────────────────────────────────


def test_half_life_interpolation():
    windows = {
        "1h": {"reach": 1000, "engagement_rate": 0.05},   # cum 50
        "24h": {"reach": 2000, "engagement_rate": 0.05},  # cum 100
    }
    # half of final (50) reached exactly at the 1h point
    assert estimate_half_life_hours(windows) == 1.0
    assert estimate_half_life_hours({}) is None  # no data, no claim
    assert estimate_half_life_hours({"1h": {"reach": 100, "engagement_rate": 0.1}}) is None


# ── sandbox ──────────────────────────────────────────────────────────────────


def test_eagle_view_manifest_is_signals_only():
    require_permission("agent:eagle_view", "signals:write")
    require_permission("agent:eagle_view", "signals:read")
    with pytest.raises(PermissionViolation):
        require_permission("agent:eagle_view", "publish:linkedin")
    with pytest.raises(PermissionViolation):
        require_permission("agent:eagle_view", "llm:complete")
