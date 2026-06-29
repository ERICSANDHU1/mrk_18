"""Public Founding-50 waitlist applications (the landing Apply form)."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import ApplicationRow


async def _count(engine) -> int:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        return (await session.execute(select(func.count()).select_from(ApplicationRow))).scalar_one()


async def test_apply_stores_application(client, engine):
    resp = await client.post(
        "/apply",
        json={
            "email": "founder@acme.com",
            "phone": "+91 99999 00000",
            "company": "acme.com",
            "marketing_issue": "Ads spend a lot, leads don't convert.",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}
    assert await _count(engine) == 1


async def test_apply_needs_no_auth(client):
    # public endpoint — no bearer token required
    resp = await client.post("/apply", json={"email": "x@y.com", "marketing_issue": "help"})
    assert resp.status_code == 200


async def test_apply_rejects_bad_email(client):
    resp = await client.post("/apply", json={"email": "notanemail", "marketing_issue": "help"})
    assert resp.status_code == 422


async def test_apply_honeypot_drops_silently(client, engine):
    resp = await client.post(
        "/apply",
        json={"email": "bot@spam.com", "marketing_issue": "buy now", "hp": "i am a bot"},
    )
    assert resp.status_code == 200  # the bot gets a 200
    assert await _count(engine) == 0  # but nothing is stored
