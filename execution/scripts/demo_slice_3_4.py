"""Slice 3.4 demo — a comment comes in, a reply is DRAFTED, and nothing
reaches the platform until the founder approves.

Run it yourself:

    cd execution
    .\\.venv\\Scripts\\python.exe scripts\\demo_slice_3_4.py

Watch: three real-world comments (praise, a question, a troll) land on a
published post. The agent scores each one's mood and drafts a reply. Then the
founder works the gate — approve one, edit one, reject-with-note (which
redrafts), ignore the troll. The post-status of every reply is shown, proving
NOTHING goes out without the founder's say-so. In-memory DB, fake model, ₹0.
"""

import asyncio
import sys
from pathlib import Path
from uuid import uuid4

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from mrk18_execution.api.app import create_app  # noqa: E402
from mrk18_execution.db.models import (  # noqa: E402
    Base,
    ContentItemRow,
    FounderProfileRow,
    FounderRow,
    RunRow,
)
from mrk18_execution.llm.socket import AgentRole, Usage  # noqa: E402
from mrk18_execution.agents.comment import ReplyDraft, score_sentiment, sentiment_label  # noqa: E402
from tests.authtools import bearer, install_auth, mint  # noqa: E402


class DemoSocket:
    """A stand-in 'founder voice' drafter so the demo needs no API key."""

    async def complete(self, role, system, user, schema, max_validation_retries=2):
        assert role is AgentRole.COMMENT
        if "punchier" in user:
            reply = "Ha, fair — short version: chai that pays for itself in week one. 🚀"
        elif "pricing" in user.lower() or "?" in user:
            reply = "Great question! For small teams it's a flat ₹30k/month, all-in. Happy to share details."
        else:
            reply = "Really appreciate you reading — means a lot. 🙏"
        return ReplyDraft(reply=reply), Usage("comment", "demo", 80, 25)


def banner(t):
    print(f"\n{'─' * 72}\n{t}\n{'─' * 72}")


async def main():
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app = create_app(engine=engine)
    install_auth(app)
    app.state.llm_socket = DemoSocket()
    factory = async_sessionmaker(engine, expire_on_commit=False)

    sub = uuid4()
    async with factory() as session:
        founder = FounderRow(email="aarav@chai.in", auth_user_id=sub)
        session.add(founder)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=founder.id, status="ready_for_analysis", draft={},
                profile={"company_name": "Chai Robotics", "tone": "warm, witty, desi"},
            )
        )
        run = RunRow(run_id=uuid4(), founder_id=founder.id, thread_id=str(uuid4()), status="done")
        session.add(run)
        item = ContentItemRow(
            item_id=uuid4(), run_id=run.run_id, founder_id=founder.id,
            platform="linkedin", format="linkedin_post",
            body="Bitter truth: your office chai is a culture decision.", status="exported",
        )
        session.add(item)
        await session.commit()
        item_id = str(item.item_id)

    headers = bearer(mint(sub))
    comments = [
        ("c1", "@ravi", "This is genuinely one of the most useful posts I've read. Thank you!"),
        ("c2", "@neha", "How does the pricing work for a small team?"),
        ("c3", "@troll", "Overpriced and overrated, honestly."),
    ]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://demo") as client:
        banner("STEP 1 — three comments land; the agent scores mood + DRAFTS a reply")
        drafted = {}
        for ext, who, text in comments:
            r = await client.post(
                f"/items/{item_id}/comments",
                json={"external_id": ext, "text": text, "author_handle": who},
                headers=headers,
            )
            b = r.json()
            drafted[ext] = b["comment_id"]
            mood = sentiment_label(score_sentiment(text))
            print(f"\n{who}: \"{text}\"")
            print(f"   mood: {mood} ({b['sentiment']:+.2f})   status: {b['reply_status']}")
            print(f"   DRAFT reply: \"{b['reply_draft']}\"")

        banner("STEP 2 — the founder works the gate (the ONLY way anything goes out)")
        r = await client.post(
            f"/comments/{drafted['c1']}/reply", json={"action": "approve"}, headers=headers
        )
        print(f"@ravi  → APPROVE        → {r.json()['status']}  (sent: \"{r.json().get('reply')}\")")

        r = await client.post(
            f"/comments/{drafted['c2']}/reply",
            json={"action": "edit", "text": "₹30k/month flat, everything included. DM me!"},
            headers=headers,
        )
        print(f"@neha  → EDIT + send    → {r.json()['status']}  (sent: \"{r.json().get('reply')}\")")

        r = await client.post(
            f"/comments/{drafted['c3']}/reply",
            json={"action": "reject", "note": "too formal, make it punchier"},
            headers=headers,
        )
        print(f"@troll → REJECT w/ note → {r.json()['status']}  (NEW draft: \"{r.json().get('reply_draft')}\")")

        banner("STEP 3 — final state: who got a reply, who didn't")
        rows = (await client.get(f"/items/{item_id}/comments", headers=headers)).json()
        for c in rows:
            print(f"  {c['author_handle']:8} {c['reply_status']:16} sentiment={c['sentiment']:+.2f}")

        banner("VERDICT")
        published = [c for c in rows if c["reply_status"] == "reply_published"]
        waiting = [c for c in rows if c["reply_status"] in ("reply_drafted", "reply_rejected")]
        print(f"  {len(published)} reply(ies) the founder approved went out (stub-send).")
        print(f"  {len(waiting)} still waiting on the founder — NOT sent.")
        print("\n  ✅ NO auto-reply: every published reply passed through a human decision.")


if __name__ == "__main__":
    asyncio.run(main())
