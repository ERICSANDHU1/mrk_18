"""B2 — GET /founders/{id}/runs: a founder's run history, owner-scoped + paginated."""

from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import RunRow
from tests.authtools import bearer, mint


async def _signup(client, email=None):
    headers = bearer(mint(uuid4(), email=email or f"{uuid4().hex[:8]}@runs.test"))
    resp = await client.post("/founders", json={}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["founder_id"], headers


async def _plant_run(engine, founder_id, *, status="done", cost=0.0):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        run = RunRow(
            run_id=uuid4(), founder_id=UUID(founder_id), thread_id=str(uuid4()),
            status=status, cost_inr=cost,
        )
        session.add(run)
        await session.commit()
        return str(run.run_id)


async def test_lists_own_runs(client, engine):
    fid, headers = await _signup(client)
    for i in range(3):
        await _plant_run(engine, fid, cost=i)
    resp = await client.get(f"/founders/{fid}/runs", headers=headers)
    assert resp.status_code == 200, resp.text
    runs = resp.json()
    assert len(runs) == 3
    assert {"run_id", "status", "cost_inr", "started_at", "finished_at"} <= runs[0].keys()


async def test_empty_history_is_empty_list(client):
    fid, headers = await _signup(client)
    resp = await client.get(f"/founders/{fid}/runs", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_pagination_limit(client, engine):
    fid, headers = await _signup(client)
    for _ in range(5):
        await _plant_run(engine, fid)
    resp = await client.get(f"/founders/{fid}/runs?limit=2", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_cannot_list_another_founders_runs(client, engine):
    fid_a, _ = await _signup(client)
    await _plant_run(engine, fid_a)
    _, headers_b = await _signup(client)
    resp = await client.get(f"/founders/{fid_a}/runs", headers=headers_b)
    assert resp.status_code == 403


async def test_requires_auth(client):
    fid, _ = await _signup(client)
    resp = await client.get(f"/founders/{fid}/runs")
    assert resp.status_code == 401


# ── B4 — run progress contract ───────────────────────────────────────────────
async def test_run_progress_awaiting_gate(client, engine):
    fid, headers = await _signup(client)
    rid = await _plant_run(engine, fid, status="awaiting_gate2")
    p = (await client.get(f"/runs/{rid}/progress", headers=headers)).json()
    assert p["status"] == "awaiting_gate2"
    assert p["awaiting"] == "gate2"
    assert p["terminal"] is False
    assert p["phase"]  # a human label is present


async def test_run_progress_terminal(client, engine):
    fid, headers = await _signup(client)
    rid = await _plant_run(engine, fid, status="done")
    p = (await client.get(f"/runs/{rid}/progress", headers=headers)).json()
    assert p["terminal"] is True and p["awaiting"] is None


async def test_run_progress_owner_only(client, engine):
    fid_a, _ = await _signup(client)
    rid = await _plant_run(engine, fid_a)
    _, headers_b = await _signup(client)
    resp = await client.get(f"/runs/{rid}/progress", headers=headers_b)
    assert resp.status_code == 403
