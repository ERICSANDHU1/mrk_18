"""Slice 2.2 — DPDP retention + right to erasure."""

from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import (
    ApprovalEventRow,
    AuditRow,
    ConnectedAccountRow,
    ContentItemRow,
    FounderProfileRow,
    FounderRow,
    KnowledgeChunkRow,
    PostCommentRow,
    PublishResultRow,
    RunRow,
    SignalRow,
)
from mrk18_execution.security.retention import (
    erase_founder,
    export_founder_data,
)
from mrk18_execution.security.vault import TokenVault


@pytest.fixture
async def engine():
    """A2 — an FK-ENFORCING SQLite engine, overriding the suite default (which
    runs with FKs off because many fixtures insert rows out of dependency
    order). Erasure must prove the delete order + ON DELETE CASCADE under real
    foreign keys, so the retention suite opts in here."""
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import StaticPool

    from mrk18_execution.db.models import Base

    eng = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(eng.sync_engine, "connect")
    def _fk_on(dbapi_con, _record):  # noqa: ANN001
        dbapi_con.execute("PRAGMA foreign_keys=ON")

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


async def _founder_with_data(factory, email="erase@test.in"):
    vault = TokenVault(Fernet.generate_key().decode())
    async with factory() as session:
        founder = FounderRow(email=email, display_name="To Erase")
        session.add(founder)
        await session.flush()
        fid = founder.id
        session.add(FounderProfileRow(founder_id=fid, status="ready_for_analysis", profile={"company_name": "X"}))
        run = RunRow(run_id=uuid4(), founder_id=fid, thread_id=str(uuid4()), status="done")
        session.add(run)
        await session.flush()
        item = ContentItemRow(
            item_id=uuid4(), run_id=run.run_id, founder_id=fid,
            platform="linkedin", format="linkedin_post", body="hi", status="approved",
        )
        session.add(item)
        await session.flush()
        session.add(ApprovalEventRow(event_id=uuid4(), run_id=run.run_id, item_id=item.item_id, founder_id=fid, decision="approved"))
        session.add(PublishResultRow(
            request_id=f"{item.item_id}:export", item_id=item.item_id, run_id=run.run_id,
            founder_id=fid, platform="linkedin", adapter="export", status="exported",
        ))
        # the three personal tables added to the erase order in A2
        session.add(SignalRow(
            signal_id=uuid4(), founder_id=fid, item_id=item.item_id,
            platform="linkedin", window_point="48h",
        ))
        session.add(PostCommentRow(
            comment_id=uuid4(), founder_id=fid, item_id=item.item_id,
            platform="linkedin", external_id="c1", text="nice work",
        ))
        session.add(KnowledgeChunkRow(
            chunk_id=uuid4(), founder_id=fid, source="doc:1", seq=0,
            content="our brand voice", embedding=[0.1, 0.2], embedding_model="stub",
        ))
        await vault.store_tokens(session, founder_id=fid, platform="linkedin", access_token="tok", scopes=["w_member_social"])
        session.add(AuditRow(record_id=uuid4(), event_type="run_started", agent_id="x", founder_id=fid, outcome="started"))
        await session.commit()
        return fid


async def _count(factory, model, fid):
    col = model.id if model is FounderRow else model.founder_id
    async with factory() as session:
        return (await session.execute(select(func.count()).select_from(model).where(col == fid))).scalar_one()


async def test_erase_removes_all_personal_data(factory):
    fid = await _founder_with_data(factory)
    # everything present
    for model in (FounderRow, FounderProfileRow, RunRow, ContentItemRow, ApprovalEventRow, PublishResultRow, ConnectedAccountRow, SignalRow, PostCommentRow, KnowledgeChunkRow, AuditRow):
        assert await _count(factory, model, fid) >= 1

    counts = await erase_founder(factory, fid)
    assert counts["founders"] == 1
    assert counts["content_items"] == 1
    assert counts["connected_accounts"] == 1
    assert counts["signals"] == 1
    assert counts["post_comments"] == 1
    assert counts["knowledge_chunks"] == 1
    # the seeded run_started row + the vault's token-stored row
    assert counts["audit_log_redacted"] == 2

    # nothing personal remains...
    for model in (FounderRow, FounderProfileRow, RunRow, ContentItemRow, ApprovalEventRow, PublishResultRow, ConnectedAccountRow, SignalRow, PostCommentRow, KnowledgeChunkRow):
        assert await _count(factory, model, fid) == 0
    # ...audit rows stay but are REDACTED in place (Slice 2.4: the hash chain
    # must survive erasure), plus the tamper-evident marker proving it happened
    async with factory() as session:
        rows = (
            (await session.execute(select(AuditRow).where(AuditRow.founder_id == fid))).scalars().all()
        )
    markers = [r for r in rows if r.outcome == "founder_erased"]
    assert len(markers) == 1
    assert "deleted" in markers[0].detail
    for row in rows:
        if row is not markers[0]:
            assert row.redacted is True
            assert row.detail == {"redacted": True}
            assert row.outcome == "redacted"


async def test_erase_unknown_founder_raises(factory):
    with pytest.raises(LookupError):
        await erase_founder(factory, uuid4())


async def test_export_returns_data_without_token_plaintext(factory):
    fid = await _founder_with_data(factory, email="export@test.in")
    data = await export_founder_data(factory, fid)
    assert data["founder"]["email"] == "export@test.in"
    assert data["profile"]["company_name"] == "X"
    assert len(data["content_items"]) == 1
    acct = data["connected_accounts"][0]
    assert acct["token"] == "present, encrypted"  # never the plaintext
    assert "tok" != acct.get("token")


class _FakeMediaStore:
    def __init__(self):
        self.deleted_prefixes = []

    async def delete_prefix(self, prefix):
        self.deleted_prefixes.append(prefix)
        return 3  # pretend 3 images removed


async def test_erase_also_wipes_storage_images(factory):
    fid = await _founder_with_data(factory, email="media@test.in")
    store = _FakeMediaStore()
    counts = await erase_founder(factory, fid, media_store=store)
    assert store.deleted_prefixes == [str(fid)]  # storage erasure was invoked
    assert counts["storage_objects"] == 3
    assert "checkpoints" in counts  # checkpoint-erase reported (0 on SQLite)


async def test_erase_without_store_skips_storage(factory):
    fid = await _founder_with_data(factory, email="nostore@test.in")
    counts = await erase_founder(factory, fid)  # no media store → no network
    assert counts["storage_objects"] == 0


async def test_erase_isolates_to_one_founder(factory):
    keep = await _founder_with_data(factory, email="keep@test.in")
    drop = await _founder_with_data(factory, email="drop@test.in")
    await erase_founder(factory, drop)
    assert await _count(factory, FounderRow, keep) == 1  # untouched
    assert await _count(factory, ContentItemRow, keep) == 1
    assert await _count(factory, FounderRow, drop) == 0


async def test_founder_delete_cascades_under_fk(factory):
    """The DB-level backstop: with FKs enforced, deleting the founder row alone
    cascades to every personal child table (the explicit erase order is belt;
    ON DELETE CASCADE is suspenders)."""
    fid = await _founder_with_data(factory, email="cascade@test.in")
    async with factory() as session:
        await session.execute(delete(FounderRow).where(FounderRow.id == fid))
        await session.commit()
    for model in (
        FounderProfileRow, RunRow, ContentItemRow, ApprovalEventRow,
        PublishResultRow, ConnectedAccountRow, SignalRow, PostCommentRow,
        KnowledgeChunkRow,
    ):
        assert await _count(factory, model, fid) == 0
