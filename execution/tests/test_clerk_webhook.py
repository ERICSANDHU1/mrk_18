"""Clerk signup webhook — a founder shell is provisioned the moment Clerk fires
``user.created``, authenticated by the Svix signature (not a founder JWT).
"""

import base64
import hashlib
import hmac
import json
import time

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.api.app import create_app
from mrk18_execution.db.models import FounderRow
from tests.authtools import install_auth

WEBHOOK_SECRET = "whsec_" + base64.b64encode(b"clerk-webhook-test-secret-key!!").decode()


def _sign(body: bytes, svix_id: str = "msg_1", ts: int | None = None) -> dict:
    timestamp = str(int(time.time()) if ts is None else ts)
    key = base64.b64decode(WEBHOOK_SECRET.split("_", 1)[1])
    signed = svix_id.encode() + b"." + timestamp.encode() + b"." + body
    sig = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return {"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": f"v1,{sig}"}


def _user_created(clerk_id: str = "user_test123", email: str = "founder@clerk.test") -> dict:
    return {
        "type": "user.created",
        "data": {
            "id": clerk_id,
            "first_name": "Eric",
            "last_name": "Sandhu",
            "primary_email_address_id": "idem_1",
            "email_addresses": [{"id": "idem_1", "email_address": email}],
        },
    }


def _client(engine, *, secret: str | None = WEBHOOK_SECRET) -> AsyncClient:
    app = create_app(engine=engine)
    install_auth(app)
    app.state.clerk_webhook_secret = secret
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _founders(engine) -> list[FounderRow]:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        return list((await s.execute(select(FounderRow))).scalars().all())


async def test_signup_provisions_founder(engine):
    async with _client(engine) as client:
        body = json.dumps(_user_created()).encode()
        resp = await client.post("/webhooks/clerk", content=body, headers=_sign(body))
        assert resp.status_code == 200, resp.text
        assert resp.json().get("created")
    rows = await _founders(engine)
    assert len(rows) == 1
    assert rows[0].auth_user_id == "user_test123"
    assert rows[0].email == "founder@clerk.test"


async def test_replay_is_idempotent(engine):
    async with _client(engine) as client:
        body = json.dumps(_user_created()).encode()
        r1 = await client.post("/webhooks/clerk", content=body, headers=_sign(body))
        r2 = await client.post("/webhooks/clerk", content=body, headers=_sign(body))
        assert r1.status_code == 200 and r2.status_code == 200
        assert "created" in r1.json()
        assert "existing" in r2.json()
    assert len(await _founders(engine)) == 1


async def test_forged_signature_is_401(engine):
    async with _client(engine) as client:
        body = json.dumps(_user_created()).encode()
        headers = _sign(body)
        headers["svix-signature"] = "v1,ZGVhZGJlZWY="  # base64 'deadbeef' — wrong
        resp = await client.post("/webhooks/clerk", content=body, headers=headers)
        assert resp.status_code == 401
    assert len(await _founders(engine)) == 0


async def test_unconfigured_secret_is_503(engine):
    async with _client(engine, secret=None) as client:
        body = json.dumps(_user_created()).encode()
        resp = await client.post("/webhooks/clerk", content=body, headers=_sign(body))
        assert resp.status_code == 503
