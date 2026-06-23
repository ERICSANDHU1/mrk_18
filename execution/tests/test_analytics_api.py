"""Analytics Interpreter API: metrics (JSON or CSV) in -> stored diagnosis out,
owner-scoped, the dashboard reads the latest."""

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.api.analytics import parse_ad_csv
from mrk18_execution.db.models import FounderRow
from mrk18_execution.llm.socket import AgentRole
from tests.authtools import install_auth, mint

DIAG = {
    "headline": "Retargeting carries the account; prospecting bleeds.",
    "working": ["Meta Retargeting at 4.1 ROAS"],
    "leaking": ["Meta Prospecting: 1.2 ROAS, CAC 1100"],
    "scale": ["Meta Retargeting"],
    "cut": ["Meta Prospecting"],
    "next_move": "Cut prospecting 40%, move it to retargeting.",
}

SAMPLE = {
    "total_spend": 250000,
    "campaigns": [
        {"name": "Meta Prospecting", "spend": 150000, "roas": 1.2, "cac": 1100},
        {"name": "Meta Retargeting", "spend": 60000, "roas": 4.1, "cac": 380},
    ],
}


class StubSocket:
    async def complete(self, role, system, user, schema, max_validation_retries=2):
        assert role == AgentRole.ANALYTICS
        return schema(**DIAG), None


@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def aclient(engine):
    from mrk18_execution.api.app import create_app

    app = create_app(engine=engine)
    install_auth(app)
    app.state.llm_socket = StubSocket()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def _founder(factory, c, email=None):
    email = email or f"{uuid4().hex[:8]}@analytics.test"
    sub = uuid4()
    async with factory() as s:
        f = FounderRow(email=email, auth_user_id=str(sub))
        s.add(f)
        await s.commit()
        fid = f.id
    c.headers["Authorization"] = f"Bearer {mint(sub, email=email)}"
    return fid


async def test_diagnose_metrics_json(aclient, factory):
    fid = await _founder(factory, aclient)
    r = await aclient.post(f"/founders/{fid}/analytics/diagnose", json={"metrics": SAMPLE})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["diagnosis"]["next_move"]
    assert body["source"] == "manual"
    assert "diagnosis_id" in body


async def test_latest_returns_stored(aclient, factory):
    fid = await _founder(factory, aclient)
    await aclient.post(f"/founders/{fid}/analytics/diagnose", json={"metrics": SAMPLE})
    r = await aclient.get(f"/founders/{fid}/analytics/latest")
    assert r.status_code == 200
    assert r.json()["diagnosis"]["headline"]
    assert r.json()["metrics"]["total_spend"] == 250000


async def test_latest_empty_when_none(aclient, factory):
    fid = await _founder(factory, aclient)
    r = await aclient.get(f"/founders/{fid}/analytics/latest")
    assert r.status_code == 200
    assert r.json()["diagnosis"] is None


async def test_csv_input_diagnoses(aclient, factory):
    fid = await _founder(factory, aclient)
    csv_text = "campaign,spend,roas,cac\nMeta Prospecting,150000,1.2,1100\nMeta Retargeting,60000,4.1,380\n"
    r = await aclient.post(f"/founders/{fid}/analytics/diagnose", json={"csv": csv_text})
    assert r.status_code == 200, r.text
    assert r.json()["source"] == "csv"


async def test_rejects_empty_body(aclient, factory):
    fid = await _founder(factory, aclient)
    r = await aclient.post(f"/founders/{fid}/analytics/diagnose", json={})
    assert r.status_code == 422


def test_parse_ad_csv_basic():
    d = parse_ad_csv("campaign,spend,roas\nA,1000,2.0\nB,500,1.0\n")
    assert d["total_spend"] == 1500.0
    assert len(d["campaigns"]) == 2
    assert d["campaigns"][0]["name"] == "A"
    assert d["campaigns"][0]["roas"] == 2.0
