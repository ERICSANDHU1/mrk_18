"""Slice 1.6 — publishing: the guard, idempotency, export kits, ops queue.

Lean setup: rows inserted directly (no graph runs) — these tests are about
the publish layer only.
"""

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import (
    ApprovalEventRow,
    AuditRow,
    ContentItemRow,
    FounderRow,
    PublishResultRow,
    RunRow,
)
from mrk18_execution.publishers.service import complete_ops_task, publish_run


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


async def make_item(
    factory,
    platform="linkedin",
    fmt="linkedin_post",
    status="approved",
    with_event=True,
    event_decision="approved",
    media=None,
    thread=None,
    email=None,
):
    """Insert founder + run + item (+ optional approval event) directly."""
    async with factory() as session:
        founder = FounderRow(email=email or f"{uuid4().hex[:10]}@pub.test")
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
            format=fmt,
            body="Real talk: your office chai is a culture decision. #chai",
            thread=thread,
            first_comment="https://chairobotics.in" if platform == "linkedin" else None,
            media=media or [],
            status=status,
        )
        session.add(item)
        if with_event:
            session.add(
                ApprovalEventRow(
                    event_id=uuid4(),
                    run_id=run.run_id,
                    item_id=item.item_id,
                    founder_id=founder.id,
                    decision=event_decision,
                )
            )
        await session.commit()
        return run.run_id, item.item_id, founder.id


async def test_strict_mode_refuses_publish_without_signing_key(factory):
    """A1: production (strict) refuses the whole batch when the signing key is
    unset — a hard stop beats shipping past a disabled publish gate."""
    run_id, _, _ = await make_item(factory)
    with pytest.raises(ValueError, match="APPROVAL_SIGNING_KEY"):
        await publish_run(factory, run_id, mode="export", signing_key=None, strict=True)


async def test_strict_mode_with_signing_key_does_not_short_circuit(factory, tmp_path):
    """strict + a key present skips the A1 stop and runs the normal pipeline."""
    run_id, _, _ = await make_item(factory)
    summary = await publish_run(
        factory,
        run_id,
        mode="export",
        export_dir=tmp_path,
        signing_key="prod-signing-key",
        strict=True,
    )
    assert len(summary) == 1  # the batch executed (the A1 guard did not block it)


async def test_export_creates_kit_and_flips_status(factory, tmp_path):
    run_id, item_id, _ = await make_item(factory)
    summary = await publish_run(factory, run_id, mode="export", export_dir=tmp_path)

    assert summary[0]["status"] == "exported"
    kit_files = list(tmp_path.rglob("linkedin.txt"))
    assert len(kit_files) == 1
    text = kit_files[0].read_text(encoding="utf-8")
    assert "culture decision" in text
    assert "FIRST COMMENT" in text  # link-in-first-comment instruction shipped

    async with factory() as session:
        item = await session.get(ContentItemRow, item_id)
        result = (
            await session.execute(select(PublishResultRow).where(PublishResultRow.run_id == run_id))
        ).scalar_one()
        audits = (
            (await session.execute(select(AuditRow.outcome).where(AuditRow.run_id == run_id)))
            .scalars()
            .all()
        )
    assert item.status == "exported"
    assert result.status == "exported"
    assert "item_exported" in audits


async def test_guard_refuses_item_without_approval_event(factory, tmp_path):
    """The attack: an item somehow marked 'approved' with NO ApprovalEvent.
    The publisher must refuse and raise a security alert."""
    run_id, item_id, _ = await make_item(factory, with_event=False)
    summary = await publish_run(factory, run_id, mode="export", export_dir=tmp_path)

    assert summary[0]["status"] == "REFUSED"
    assert "no ApprovalEvent" in summary[0]["reason"]
    assert list(tmp_path.rglob("*.txt")) == []  # nothing was exported

    async with factory() as session:
        alerts = (
            (
                await session.execute(
                    select(AuditRow).where(
                        AuditRow.run_id == run_id,
                        AuditRow.event_type == "security_alert",
                    )
                )
            )
            .scalars()
            .all()
        )
    assert len(alerts) == 1
    assert alerts[0].outcome == "publish_refused_no_valid_approval"


async def test_guard_refuses_when_latest_decision_is_rejection(factory, tmp_path):
    """Approval then a LATER rejection: the latest decision wins — refuse."""
    run_id, item_id, founder_id = await make_item(factory, event_decision="approved")
    async with factory() as session:
        from datetime import datetime, timedelta, timezone

        session.add(
            ApprovalEventRow(
                event_id=uuid4(),
                run_id=run_id,
                item_id=item_id,
                founder_id=founder_id,
                decision="rejected",
                decided_at=datetime.now(timezone.utc) + timedelta(seconds=5),
            )
        )
        await session.commit()
    summary = await publish_run(factory, run_id, mode="export", export_dir=tmp_path)
    assert summary[0]["status"] == "REFUSED"
    assert "not approved" in summary[0]["reason"]


async def test_unapproved_items_are_skipped(factory, tmp_path):
    run_id, _, _ = await make_item(factory, status="awaiting_approval", with_event=False)
    summary = await publish_run(factory, run_id, mode="export", export_dir=tmp_path)
    assert summary[0]["skipped"] == "not approved"
    assert list(tmp_path.rglob("*.txt")) == []


async def test_idempotency_no_double_export(factory, tmp_path):
    run_id, _, _ = await make_item(factory)
    first = await publish_run(factory, run_id, mode="export", export_dir=tmp_path)
    second = await publish_run(factory, run_id, mode="export", export_dir=tmp_path)

    assert first[0]["status"] == "exported"
    assert second[0]["skipped"] in ("already done", "already exported")
    async with factory() as session:
        results = (
            (await session.execute(select(PublishResultRow).where(PublishResultRow.run_id == run_id)))
            .scalars()
            .all()
        )
    assert len(results) == 1  # one result row, ever


async def test_stub_publish_shapes_and_honesty(factory):
    """Stub mode proves the real API shapes — and never lies about item state."""
    run_id, item_id, _ = await make_item(
        factory,
        platform="x",
        fmt="x_thread",
        thread=["Hook segment. #chai", "Detail segment with https://link.example"],
    )
    summary = await publish_run(factory, run_id, mode="stub")

    assert summary[0]["status"] == "published"
    async with factory() as session:
        item = await session.get(ContentItemRow, item_id)
        result = (
            await session.execute(select(PublishResultRow).where(PublishResultRow.run_id == run_id))
        ).scalar_one()
    assert item.status == "approved"  # stub NEVER marks the item published
    assert result.raw_response["stub"] is True
    # thread chained via reply.in_reply_to_tweet_id (the real v2 shape)
    sends = result.raw_response["would_send"]
    assert len(sends) == 2 and "reply" in sends[1]
    assert len(result.thread_ids) == 2
    # URL post flagged at the 13x price: 0.20 + 0.015
    assert float(result.cost_estimate_usd) == pytest.approx(0.215)


async def test_linkedin_stub_shape(factory):
    run_id, _, _ = await make_item(factory)
    await publish_run(factory, run_id, mode="stub")
    async with factory() as session:
        result = (
            await session.execute(select(PublishResultRow).where(PublishResultRow.run_id == run_id))
        ).scalar_one()
    would = result.raw_response["would_send"]
    assert would["commentary"]
    assert result.raw_response["headers"]["LinkedIn-Version"] == "202605"
    assert result.public_url.startswith("https://www.linkedin.com/feed/update/urn:li:share:")
    assert result.raw_response["first_comment_call"] is True  # link rides in comment


async def test_instagram_ops_queue_and_completion(factory):
    media = [
        {
            "url": "https://fake.storage/media/x.jpg",
            "mime": "image/jpeg",
            "width": 1080,
            "height": 1080,
            "size_bytes": 99999,
            "alt_text": "chai",
        }
    ]
    run_id, item_id, _ = await make_item(
        factory, platform="instagram", fmt="ig_caption", media=media
    )
    summary = await publish_run(factory, run_id, mode="stub")
    assert summary[0]["status"] == "queued_manual"

    async with factory() as session:
        result = (
            await session.execute(select(PublishResultRow).where(PublishResultRow.run_id == run_id))
        ).scalar_one()
        item = await session.get(ContentItemRow, item_id)
    task = result.raw_response["ops_task"]
    assert task["image_urls"] == ["https://fake.storage/media/x.jpg"]
    assert task["sla_window_hours"] == 4
    assert "delegated partner access" in task["instructions"]
    assert item.status == "approved"  # not published until ops confirms

    # ops posts it and pastes the live URL
    done = await complete_ops_task(
        factory, result.result_id, "https://www.instagram.com/p/DEMO123/"
    )
    assert done["status"] == "published"
    async with factory() as session:
        item = await session.get(ContentItemRow, item_id)
        result = await session.get(PublishResultRow, result.result_id)
        audits = (
            (await session.execute(select(AuditRow.outcome).where(AuditRow.run_id == run_id)))
            .scalars()
            .all()
        )
    assert item.status == "published"
    assert result.public_url == "https://www.instagram.com/p/DEMO123/"
    assert "item_published" in audits

    # completing twice fails loudly
    with pytest.raises(ValueError):
        await complete_ops_task(factory, result.result_id, "https://other.url/")


async def test_one_bad_item_never_blocks_the_batch(factory, tmp_path):
    """Two items: one valid, one tampered (no event). The valid one ships."""
    run_id, good_id, founder_id = await make_item(factory)
    async with factory() as session:
        bad = ContentItemRow(
            item_id=uuid4(),
            run_id=run_id,
            founder_id=founder_id,
            platform="x",
            format="x_single",
            body="tampered item",
            status="approved",  # forged status, no event
        )
        session.add(bad)
        await session.commit()

    summary = await publish_run(factory, run_id, mode="export", export_dir=tmp_path)
    by_status = {s["status"] for s in summary}
    assert "exported" in by_status and "REFUSED" in by_status
