"""Saved CMO chats — create/list/get/update, titled from the first message,
owner-scoped (no cross-tenant leak)."""

from uuid import uuid4

from tests.authtools import bearer, mint


async def _signup(client, email=None):
    headers = bearer(mint(uuid4(), email=email or f"{uuid4().hex[:8]}@chats.test"))
    resp = await client.post("/founders", json={}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["founder_id"], headers


async def test_create_titles_from_first_message(client):
    fid, headers = await _signup(client)
    resp = await client.post(
        f"/founders/{fid}/chats",
        json={"messages": [{"role": "user", "text": "Sharpen my LinkedIn positioning please"}]},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["id"]
    assert body["title"] == "Sharpen my LinkedIn positioning please"
    assert len(body["messages"]) == 1


async def test_list_returns_owned_newest_first(client):
    fid, headers = await _signup(client)
    a = (
        await client.post(
            f"/founders/{fid}/chats", json={"messages": [{"role": "user", "text": "first"}]}, headers=headers
        )
    ).json()
    b = (
        await client.post(
            f"/founders/{fid}/chats", json={"messages": [{"role": "user", "text": "second"}]}, headers=headers
        )
    ).json()
    # touch b so it is unambiguously the most-recently-updated
    await client.put(
        f"/founders/{fid}/chats/{b['id']}",
        json={"messages": [{"role": "user", "text": "second"}]},
        headers=headers,
    )
    rows = (await client.get(f"/founders/{fid}/chats", headers=headers)).json()
    assert {r["id"] for r in rows} == {a["id"], b["id"]}
    assert rows[0]["id"] == b["id"]  # newest-updated first
    assert {"id", "title", "updated_at"} <= rows[0].keys()


async def test_update_saves_transcript(client):
    fid, headers = await _signup(client)
    chat = (
        await client.post(
            f"/founders/{fid}/chats", json={"messages": [{"role": "user", "text": "hi"}]}, headers=headers
        )
    ).json()
    msgs = [{"role": "user", "text": "hi"}, {"role": "cmo", "text": "Hey — what's up?"}]
    resp = await client.put(f"/founders/{fid}/chats/{chat['id']}", json={"messages": msgs}, headers=headers)
    assert resp.status_code == 200, resp.text
    got = (await client.get(f"/founders/{fid}/chats/{chat['id']}", headers=headers)).json()
    assert len(got["messages"]) == 2
    assert got["messages"][1]["role"] == "cmo"


async def test_cannot_reach_another_founders_chats(client):
    fid_a, headers_a = await _signup(client)
    chat = (
        await client.post(
            f"/founders/{fid_a}/chats", json={"messages": [{"role": "user", "text": "secret"}]}, headers=headers_a
        )
    ).json()
    fid_b, headers_b = await _signup(client)
    # B cannot list under A's path at all
    assert (await client.get(f"/founders/{fid_a}/chats", headers=headers_b)).status_code == 403
    # and A's chat id under B's own path is a clean 404 (never leak the row)
    assert (
        await client.get(f"/founders/{fid_b}/chats/{chat['id']}", headers=headers_b)
    ).status_code == 404


async def test_requires_auth(client):
    fid, _ = await _signup(client)
    assert (await client.get(f"/founders/{fid}/chats")).status_code == 401
