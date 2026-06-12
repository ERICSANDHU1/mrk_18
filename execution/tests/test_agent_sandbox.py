"""Slice 2.3 — the agent sandbox under attack.

The demo this slice owes: a deliberate rogue publish attempt is BLOCKED and
ALARMED. Covered here:
  * a forged "approved" row written straight into the DB (no signature)
  * a real approval whose content was edited afterwards (hash mismatch)
  * a signature replayed onto a different decision
  * an adapter called directly, around the guarded pipeline (no step token)
  * an agent asking for a capability outside its manifest
And the honest path: founder decides at Gate 2 → signed events → publish OK.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import (
    ApprovalEventRow,
    AuditRow,
    ContentItemRow,
    FounderRow,
    RunRow,
)
from mrk18_execution.graph.lifecycle import mint_gate2_decisions
from mrk18_execution.llm.socket import AgentRole
from mrk18_execution.publishers.adapters import ExportAdapter
from mrk18_execution.publishers.base import request_for
from mrk18_execution.publishers.service import publish_run
from mrk18_execution.security.approvalsig import (
    item_content_hash,
    sign_approval,
    verify_approval_signature,
)
from mrk18_execution.security.manifests import (
    AGENT_MANIFESTS,
    PermissionViolation,
    require_permission,
)
from mrk18_execution.security.steptokens import mint_step_token, verify_step_token

KEY = "test-approval-signing-key"


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


async def seed_item(factory, status="approved", run_status="done"):
    """Founder + run + one content item — NO approval event (tests add their own)."""
    async with factory() as session:
        founder = FounderRow(email=f"{uuid4().hex[:10]}@sandbox.test")
        session.add(founder)
        await session.flush()
        run = RunRow(
            run_id=uuid4(), founder_id=founder.id, thread_id=str(uuid4()), status=run_status
        )
        session.add(run)
        item = ContentItemRow(
            item_id=uuid4(),
            run_id=run.run_id,
            founder_id=founder.id,
            platform="linkedin",
            format="linkedin_post",
            body="Bitter truth: distribution beats product polish. #buildinpublic",
            status=status,
        )
        session.add(item)
        await session.commit()
        return run.run_id, item.item_id, founder.id


async def security_alerts(engine, outcome=None):
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                select(AuditRow.outcome).where(AuditRow.event_type == "security_alert")
            )
        ).scalars().all()
    return [r for r in rows if outcome is None or r == outcome]


# ── the honest path: gate decision → signed event → publish ─────────────────


async def test_gate2_mints_signed_events_and_publish_succeeds(factory, engine, tmp_path):
    run_id, item_id, founder_id = await seed_item(
        factory, status="awaiting_approval", run_status="awaiting_gate2"
    )
    await mint_gate2_decisions(
        factory, run_id, [{"item_id": str(item_id), "action": "approve"}], signing_key=KEY
    )
    async with factory() as session:
        event = (
            await session.execute(
                select(ApprovalEventRow).where(ApprovalEventRow.item_id == item_id)
            )
        ).scalar_one()
        item = await session.get(ContentItemRow, item_id)
        assert event.signature and event.signature.startswith("v1.")
        assert verify_approval_signature(KEY, event, item)
        # simulate the graph's persistence step: item approved, run closed
        await session.execute(
            update(ContentItemRow)
            .where(ContentItemRow.item_id == item_id)
            .values(status="approved")
        )
        await session.execute(
            update(RunRow).where(RunRow.run_id == run_id).values(status="done")
        )
        await session.commit()

    summary = await publish_run(
        factory, run_id, mode="export", export_dir=tmp_path, signing_key=KEY
    )
    assert summary[0]["status"] == "exported"


# ── rogue attempt 1: forged approval row, no signature ───────────────────────


async def test_forged_unsigned_approval_blocked_and_alarmed(factory, engine, tmp_path):
    run_id, item_id, founder_id = await seed_item(factory)
    async with factory() as session:  # the attacker writes straight into the DB
        session.add(
            ApprovalEventRow(
                event_id=uuid4(),
                run_id=run_id,
                item_id=item_id,
                founder_id=founder_id,
                decision="approved",  # looks perfect — but carries no MAC
            )
        )
        await session.commit()

    summary = await publish_run(
        factory, run_id, mode="export", export_dir=tmp_path, signing_key=KEY
    )
    assert summary[0]["status"] == "REFUSED"
    assert "unsigned" in summary[0]["reason"]
    assert await security_alerts(engine, "publish_refused_no_valid_approval")


# ── rogue attempt 2: real approval, content edited afterwards ────────────────


async def test_content_tampered_after_approval_blocked(factory, engine, tmp_path):
    run_id, item_id, _ = await seed_item(
        factory, status="awaiting_approval", run_status="awaiting_gate2"
    )
    await mint_gate2_decisions(
        factory, run_id, [{"item_id": str(item_id), "action": "approve"}], signing_key=KEY
    )
    async with factory() as session:  # post-approval edit — founder never saw this
        await session.execute(
            update(ContentItemRow)
            .where(ContentItemRow.item_id == item_id)
            .values(status="approved", body="BUY MY COURSE!!! link in bio")
        )
        await session.execute(
            update(RunRow).where(RunRow.run_id == run_id).values(status="done")
        )
        await session.commit()

    summary = await publish_run(
        factory, run_id, mode="export", export_dir=tmp_path, signing_key=KEY
    )
    assert summary[0]["status"] == "REFUSED"
    assert "does not verify" in summary[0]["reason"]
    assert await security_alerts(engine, "publish_refused_no_valid_approval")


# ── rogue attempt 3: adapter called directly, around the pipeline ────────────


async def test_direct_adapter_call_without_step_token_blocked(factory, tmp_path):
    run_id, item_id, founder_id = await seed_item(factory)
    async with factory() as session:
        item = await session.get(ContentItemRow, item_id)
        request = request_for(item, "export", uuid4())

    adapter = ExportAdapter(tmp_path, signing_key=KEY)
    with pytest.raises(PermissionViolation, match="step token"):
        await adapter.publish(request)  # no token: the pipeline never minted this
    with pytest.raises(PermissionViolation):
        await adapter.publish(request, step_token="9999999999.deadbeef")  # forged
    # and nothing was written to disk
    assert not any(tmp_path.iterdir())


# ── signature semantics ──────────────────────────────────────────────────────


def test_signature_bound_to_decision_and_event():
    class Item:
        item_id = uuid4()
        platform = "linkedin"
        format = "linkedin_post"
        body = "original"
        thread = None
        first_comment = None
        link_url = None
        media = []

    class Event:
        event_id = uuid4()
        founder_id = uuid4()
        decision = "rejected"
        decided_at = datetime.now(timezone.utc)
        signature = None

    e = Event()
    # sign a REJECTION, then try to replay it as an approval
    e.signature = sign_approval(
        KEY,
        event_id=e.event_id,
        item_hash=item_content_hash(Item),
        founder_id=e.founder_id,
        decision="rejected",
        decided_at=e.decided_at,
    )
    assert verify_approval_signature(KEY, e, Item)
    e.decision = "approved"  # the forgery
    assert not verify_approval_signature(KEY, e, Item)


def test_item_hash_covers_what_the_founder_sees():
    class Item:
        item_id = uuid4()
        platform = "linkedin"
        format = "linkedin_post"
        body = "original"
        thread = None
        first_comment = None
        link_url = None
        media = [{"url": "https://cdn/img1.jpg"}]

    before = item_content_hash(Item)
    Item.media = [{"url": "https://evil/img2.jpg"}]  # swap the image
    assert item_content_hash(Item) != before


# ── manifests: deny by default ───────────────────────────────────────────────


def test_manifest_denies_off_manifest_capability():
    require_permission("agent:content", "llm:complete")  # granted — no raise
    with pytest.raises(PermissionViolation, match="not in its manifest"):
        require_permission("agent:content", "publish:linkedin")
    with pytest.raises(PermissionViolation, match="no permission manifest"):
        require_permission("agent:unknown", "llm:complete")
    with pytest.raises(PermissionViolation):
        require_permission("agent:photo_funnel", "llm:complete")  # execution half only


def test_every_llm_role_has_a_manifest():
    """Adding an AgentRole without a manifest entry must fail loudly here,
    not silently at 2 a.m. in a pipeline run."""
    for role in AgentRole:
        assert f"agent:{role.value}" in AGENT_MANIFESTS, f"no manifest for {role.value}"
        require_permission(f"agent:{role.value}", "llm:complete")


# ── step tokens ──────────────────────────────────────────────────────────────


def test_step_token_roundtrip_expiry_and_scope():
    token = mint_step_token(KEY, agent_id="agent:publisher", scope="publish:i1:e1")
    assert verify_step_token(KEY, token, agent_id="agent:publisher", scope="publish:i1:e1")
    # wrong scope, wrong agent, tampered, expired, wrong key — all refused
    assert not verify_step_token(KEY, token, agent_id="agent:publisher", scope="publish:i2:e1")
    assert not verify_step_token(KEY, token, agent_id="agent:content", scope="publish:i1:e1")
    assert not verify_step_token(KEY, token + "0", agent_id="agent:publisher", scope="publish:i1:e1")
    stale = mint_step_token(KEY, agent_id="agent:publisher", scope="publish:i1:e1", ttl_s=-5)
    assert not verify_step_token(KEY, stale, agent_id="agent:publisher", scope="publish:i1:e1")
    assert not verify_step_token("other", token, agent_id="agent:publisher", scope="publish:i1:e1")
