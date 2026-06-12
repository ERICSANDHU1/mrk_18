"""Slice 2.5 — DPDP rights: correction + consent withdrawal.

(Access and erasure were proven in test_retention; auth on all of them in
test_auth.) Here: corrections work after the intake lock but can never make
the profile invalid; withdrawal stops processing one-call-easy, expires
whatever was waiting, and the road back runs through fresh affirmative consent.
"""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import AuditRow, ContentItemRow, FounderProfileRow, RunRow
from mrk18_execution.graph.lifecycle import start_run
from tests.authtools import mint
from tests.test_intake_api import FULL_INTAKE, make_founder


async def _completed_founder(client):
    fid = await make_founder(client, email=f"{uuid4().hex[:8]}@rights.test")
    await client.put(f"/founders/{fid}/intake", json=FULL_INTAKE)
    done = await client.post(f"/founders/{fid}/intake/complete")
    assert done.status_code == 200, done.text
    return fid


# ── right to correction ──────────────────────────────────────────────────────


async def test_correct_identity_fields(client, engine):
    fid = await _completed_founder(client)
    resp = await client.patch(
        f"/founders/{fid}", json={"display_name": "Aarav S.", "email": "new@rights.test"}
    )
    assert resp.status_code == 200
    assert sorted(resp.json()["fields"]) == ["display_name", "email"]
    async with engine.connect() as conn:
        outcomes = (await conn.execute(select(AuditRow.outcome))).scalars().all()
    assert "data_corrected" in outcomes


async def test_correct_locked_profile_field(client):
    fid = await _completed_founder(client)
    # intake is locked (PUT is 409) — but correction is a DPDP right
    locked = await client.put(f"/founders/{fid}/intake", json={"tone": "x"})
    assert locked.status_code == 409
    resp = await client.patch(
        f"/founders/{fid}", json={"profile": {"company_name": "Chai Robotics Pvt Ltd"}}
    )
    assert resp.status_code == 200
    read = await client.get(f"/founders/{fid}/intake")
    assert read.json()["profile"]["company_name"] == "Chai Robotics Pvt Ltd"


async def test_correction_cannot_invalidate_profile(client):
    fid = await _completed_founder(client)
    bad = await client.patch(
        f"/founders/{fid}", json={"profile": {"top_competitors": ["a", "b", "c", "d"]}}
    )
    assert bad.status_code == 422
    assert "invalid" in bad.json()["detail"]["message"]


async def test_correction_requires_something_and_unique_email(client):
    fid = await _completed_founder(client)
    assert (await client.patch(f"/founders/{fid}", json={})).status_code == 422
    other_email = f"{uuid4().hex[:8]}@rights.test"
    await make_founder(client, email=other_email)  # client now speaks as founder 2
    fid2 = await _completed_founder(client)
    taken = await client.patch(f"/founders/{fid2}", json={"email": other_email})
    assert taken.status_code == 409


async def test_correction_is_owner_only(client):
    fid = await _completed_founder(client)
    client.headers["Authorization"] = f"Bearer {mint(uuid4())}"  # a stranger
    resp = await client.patch(f"/founders/{fid}", json={"display_name": "hijack"})
    assert resp.status_code == 403


# ── right to withdraw consent ────────────────────────────────────────────────


async def test_withdraw_stops_processing_and_expires_waiting_work(client, engine):
    fid = await _completed_founder(client)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    # plant a run waiting at gate 2 with an item awaiting approval
    async with factory() as session:
        from uuid import UUID

        run = RunRow(
            run_id=uuid4(),
            founder_id=UUID(fid),
            thread_id=str(uuid4()),
            status="awaiting_gate2",
        )
        session.add(run)
        item = ContentItemRow(
            item_id=uuid4(),
            run_id=run.run_id,
            founder_id=UUID(fid),
            platform="linkedin",
            format="linkedin_post",
            body="pending",
            status="awaiting_approval",
        )
        session.add(item)
        await session.commit()
        run_id, item_id = run.run_id, item.item_id

    resp = await client.post(f"/founders/{fid}/consent/withdraw")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "consent_withdrawn"
    assert body["items_expired"] == 1 and body["runs_closed"] == 1

    async with factory() as session:
        from uuid import UUID

        assert (await session.get(FounderProfileRow, UUID(fid))).status == "consent_withdrawn"
        assert (await session.get(ContentItemRow, item_id)).status == "expired"
        run = await session.get(RunRow, run_id)
        assert run.status == "done" and run.gate2["consent_withdrawn"] is True

    # processing refuses: the run gate is closed to withdrawn founders
    from uuid import UUID

    import pytest

    with pytest.raises(ValueError, match="not complete"):
        await start_run(factory, UUID(fid))

    # and it's evidence
    async with engine.connect() as conn:
        outcomes = (await conn.execute(select(AuditRow.outcome))).scalars().all()
    assert "consent_withdrawn" in outcomes


async def test_road_back_requires_fresh_consent(client):
    fid = await _completed_founder(client)
    assert (await client.post(f"/founders/{fid}/consent/withdraw")).status_code == 200

    # completing again WITHOUT re-consent fails on the consent gate
    refused = await client.post(f"/founders/{fid}/intake/complete")
    assert refused.status_code == 422
    assert any("consent" in p for p in refused.json()["detail"]["problems"])

    # affirmative re-consent reopens the road
    re_consent = await client.put(
        f"/founders/{fid}/intake",
        json={"consent_given": True, "consent_text_version": "v1-2026-06"},
    )
    assert re_consent.status_code == 200
    done = await client.post(f"/founders/{fid}/intake/complete")
    assert done.status_code == 200
    assert done.json()["status"] == "ready_for_analysis"


async def test_withdraw_is_owner_only(client):
    fid = await _completed_founder(client)
    client.headers["Authorization"] = f"Bearer {mint(uuid4())}"
    assert (await client.post(f"/founders/{fid}/consent/withdraw")).status_code == 403
