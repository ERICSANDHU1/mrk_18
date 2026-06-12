"""Slice 3.4 — the Comment Agent under test.

The demo this slice owes: a comment comes in → a reply is DRAFTED → it waits
for the founder → nothing reaches the platform until they approve. Plus the
non-negotiables: sentiment is scored for free, the gate offers approve / edit
/ reject-redraft / ignore, cross-tenant is walled, and comment sentiment
feeds the signal column reserved since 1.1.
"""

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.agents.comment import ReplyDraft, is_question, score_sentiment, sentiment_label
from mrk18_execution.api.app import create_app
from mrk18_execution.db.models import (
    AuditRow,
    ContentItemRow,
    FounderProfileRow,
    FounderRow,
    PostCommentRow,
    RunRow,
    SignalRow,
)
from mrk18_execution.llm.socket import AgentRole, Usage
from mrk18_execution.security.manifests import PermissionViolation, require_permission
from tests.authtools import MAINTENANCE_KEY, bearer, install_auth, mint


class FakeCommentSocket:
    """Drafts a deterministic, on-brand-ish reply — no network."""

    def __init__(self):
        self.calls = 0

    async def complete(self, role, system, user, schema, max_validation_retries=2):
        assert role is AgentRole.COMMENT
        self.calls += 1
        text = "edit my draft" if self.calls == 1 else "Thanks so much — really appreciate you reading!"
        return ReplyDraft(reply=text), Usage(role.value, "stub", 100, 30)


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def comment_client(engine):
    app = create_app(engine=engine)
    install_auth(app)
    app.state.llm_socket = FakeCommentSocket()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c, app


async def seed_post(factory, *, sub=None, platform="linkedin"):
    sub = sub or uuid4()
    async with factory() as session:
        founder = FounderRow(email=f"{uuid4().hex[:10]}@cmt.test", auth_user_id=sub)
        session.add(founder)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=founder.id, status="ready_for_analysis", draft={},
                profile={"company_name": "Chai Robotics", "tone": "warm, desi"},
            )
        )
        run = RunRow(run_id=uuid4(), founder_id=founder.id, thread_id=str(uuid4()), status="done")
        session.add(run)
        item = ContentItemRow(
            item_id=uuid4(), run_id=run.run_id, founder_id=founder.id,
            platform=platform, format=f"{platform}_post",
            body="Bitter truth: distribution beats product polish.", status="exported",
        )
        session.add(item)
        # a measured signal row so sentiment has somewhere to land
        session.add(
            SignalRow(
                founder_id=founder.id, item_id=item.item_id, platform=platform,
                window_point="24h", reach=2000, engagement_rate=0.04, source="manual",
            )
        )
        await session.commit()
        return {"sub": sub, "founder_id": str(founder.id), "item_id": str(item.item_id)}


# ── sentiment: free, deterministic ───────────────────────────────────────────


def test_sentiment_scoring_and_negation():
    assert score_sentiment("This is genuinely helpful, thank you!") > 0.3
    assert score_sentiment("Overpriced and useless honestly.") < -0.3
    assert score_sentiment("It posts on Tuesday.") == 0.0
    assert score_sentiment("not helpful at all") < 0  # negation flips
    assert sentiment_label(0.5) == "positive"
    assert sentiment_label(-0.5) == "negative"
    assert sentiment_label(0.0) == "neutral"
    assert is_question("How does pricing work?") and not is_question("Great post.")


# ── the demo: comment in → draft waits → founder approves ────────────────────


async def test_comment_to_draft_to_approval(comment_client, factory, engine):
    client, _app = comment_client
    post = await seed_post(factory)
    headers = bearer(mint(post["sub"]))

    ingest = await client.post(
        f"/items/{post['item_id']}/comments",
        json={"external_id": "c-1", "text": "This is so helpful, thanks!", "author_handle": "@ravi"},
        headers=headers,
    )
    assert ingest.status_code == 200, ingest.text
    body = ingest.json()
    assert body["sentiment"] > 0.3                      # scored for free
    assert body["reply_draft"] is not None              # a reply was DRAFTED
    assert body["reply_status"] == "reply_drafted"      # ...and is WAITING
    comment_id = body["comment_id"]

    # nothing has been published — it's a draft, full stop
    async with factory() as session:
        row = await session.get(PostCommentRow, uuid4().__class__(comment_id))
        assert row.reply_status == "reply_drafted"

    # founder approves → the only path to 'published'
    decide = await client.post(
        f"/comments/{comment_id}/reply", json={"action": "approve"}, headers=headers
    )
    assert decide.status_code == 200
    assert decide.json()["status"] == "reply_published"
    assert decide.json()["stub"] is True  # honest: real send is the go-live adapter

    # the gate decision is audited
    async with engine.connect() as conn:
        outcomes = (await conn.execute(select(AuditRow.outcome))).scalars().all()
    assert "comment_ingested" in outcomes and "comment_reply_approve" in outcomes


async def test_edit_sends_founder_text(comment_client, factory):
    client, _app = comment_client
    post = await seed_post(factory)
    headers = bearer(mint(post["sub"]))
    cid = (
        await client.post(
            f"/items/{post['item_id']}/comments",
            json={"external_id": "c-1", "text": "nice one"},
            headers=headers,
        )
    ).json()["comment_id"]

    edited = await client.post(
        f"/comments/{cid}/reply",
        json={"action": "edit", "text": "My own words, thank you!"},
        headers=headers,
    )
    assert edited.status_code == 200
    assert edited.json()["reply"] == "My own words, thank you!"


async def test_reject_with_note_redrafts(comment_client, factory):
    client, _app = comment_client
    post = await seed_post(factory)
    headers = bearer(mint(post["sub"]))
    cid = (
        await client.post(
            f"/items/{post['item_id']}/comments",
            json={"external_id": "c-1", "text": "love this"},
            headers=headers,
        )
    ).json()["comment_id"]

    redraft = await client.post(
        f"/comments/{cid}/reply",
        json={"action": "reject", "note": "too formal, make it punchier"},
        headers=headers,
    )
    assert redraft.status_code == 200
    assert redraft.json()["status"] == "reply_redrafted"
    assert redraft.json()["reply_draft"]  # a fresh suggestion is waiting again


async def test_ignore_drops_it(comment_client, factory):
    client, _app = comment_client
    post = await seed_post(factory)
    headers = bearer(mint(post["sub"]))
    cid = (
        await client.post(
            f"/items/{post['item_id']}/comments",
            json={"external_id": "c-1", "text": "spam spam buy followers"},
            headers=headers,
        )
    ).json()["comment_id"]
    out = await client.post(f"/comments/{cid}/reply", json={"action": "ignore"}, headers=headers)
    assert out.json()["status"] == "ignored"


# ── sentiment feeds the signal column (1.1's reserved field) ─────────────────


async def test_comment_sentiment_lands_on_signal(comment_client, factory):
    client, _app = comment_client
    post = await seed_post(factory)
    headers = bearer(mint(post["sub"]))
    for ext, text in [("c1", "amazing, loved it"), ("c2", "useless and overpriced")]:
        await client.post(
            f"/items/{post['item_id']}/comments",
            json={"external_id": ext, "text": text},
            headers=headers,
        )
    async with factory() as session:
        sig = (await session.execute(select(SignalRow))).scalar_one()
    assert sig.comment_sentiment is not None  # aggregate written back onto the signal


# ── the wall ─────────────────────────────────────────────────────────────────


async def test_cross_tenant_comments_blocked(comment_client, factory, engine):
    client, _app = comment_client
    post_a = await seed_post(factory)
    post_b = await seed_post(factory)
    headers_b = bearer(mint(post_b["sub"]))

    # B comments on / reads A's post → 403
    assert (
        await client.post(
            f"/items/{post_a['item_id']}/comments",
            json={"external_id": "x", "text": "hi"},
            headers=headers_b,
        )
    ).status_code == 403
    assert (
        await client.get(f"/items/{post_a['item_id']}/comments", headers=headers_b)
    ).status_code == 403
    # no token → 401
    assert (await client.get(f"/items/{post_a['item_id']}/comments")).status_code == 401

    # B can't decide a reply on A's comment
    headers_a = bearer(mint(post_a["sub"]))
    cid = (
        await client.post(
            f"/items/{post_a['item_id']}/comments",
            json={"external_id": "c-1", "text": "hello"},
            headers=headers_a,
        )
    ).json()["comment_id"]
    assert (
        await client.post(f"/comments/{cid}/reply", json={"action": "approve"}, headers=headers_b)
    ).status_code == 403


async def test_drafting_unavailable_still_records_comment(factory, engine):
    """No LLM socket → the comment + sentiment are still captured; the draft is
    simply absent (never lose the comment because the model is down)."""
    app = create_app(engine=engine)
    install_auth(app)
    app.state.llm_socket = None
    post = await seed_post(factory)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        resp = await client.post(
            f"/items/{post['item_id']}/comments",
            json={"external_id": "c-1", "text": "great post"},
            headers=bearer(mint(post["sub"])),
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["sentiment"] > 0 and body["reply_draft"] is None
    assert body["reply_status"] == "new"


# ── ops pull + sandbox ───────────────────────────────────────────────────────


async def test_maintenance_pull_comments(comment_client, factory):
    client, app = comment_client
    from mrk18_execution.monitor.comments import StubCommentSource

    await seed_post(factory, platform="linkedin")
    app.state.comment_sources = {"linkedin": StubCommentSource()}
    naked = await client.post("/maintenance/pull-comments")
    assert naked.status_code == 401
    ok = await client.post(
        "/maintenance/pull-comments", headers={"X-Maintenance-Key": MAINTENANCE_KEY}
    )
    assert ok.status_code == 200 and ok.json()["new_comments"] >= 2


def test_comment_manifest_cannot_publish():
    require_permission("agent:comment", "llm:complete")
    require_permission("agent:comment", "comments:write")
    require_permission("agent:comment", "signals:write")
    with pytest.raises(PermissionViolation):
        require_permission("agent:comment", "publish:linkedin")  # the line it must never cross
