"""Saved CMO chats — create/list/get/update, titled from the first message,
owner-scoped (no cross-tenant leak)."""

import asyncio
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
    # touch b so it is unambiguously the most-recently-updated — the sleep crosses
    # the ~16ms Windows clock tick so b's timestamp is strictly newer than a's
    await asyncio.sleep(0.05)
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


async def test_patch_renames(client):
    fid, headers = await _signup(client)
    chat = (
        await client.post(
            f"/founders/{fid}/chats", json={"messages": [{"role": "user", "text": "draft a hook"}]}, headers=headers
        )
    ).json()
    resp = await client.patch(
        f"/founders/{fid}/chats/{chat['id']}", json={"title": "Hooks for launch"}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["title"] == "Hooks for launch"
    rows = (await client.get(f"/founders/{fid}/chats", headers=headers)).json()
    assert rows[0]["title"] == "Hooks for launch"


async def test_patch_pin_floats_to_top(client):
    fid, headers = await _signup(client)
    a = (
        await client.post(
            f"/founders/{fid}/chats", json={"messages": [{"role": "user", "text": "older"}]}, headers=headers
        )
    ).json()
    b = (
        await client.post(
            f"/founders/{fid}/chats", json={"messages": [{"role": "user", "text": "newer"}]}, headers=headers
        )
    ).json()
    # b is newest → first by default; pinning the older `a` jumps it ahead of b
    pinned = (
        await client.patch(f"/founders/{fid}/chats/{a['id']}", json={"pinned": True}, headers=headers)
    ).json()
    assert pinned["pinned"] is True
    rows = (await client.get(f"/founders/{fid}/chats", headers=headers)).json()
    assert rows[0]["id"] == a["id"] and rows[0]["pinned"] is True
    assert rows[1]["id"] == b["id"]


async def test_patch_archive_hides_but_keeps_row(client):
    fid, headers = await _signup(client)
    chat = (
        await client.post(
            f"/founders/{fid}/chats", json={"messages": [{"role": "user", "text": "archive me"}]}, headers=headers
        )
    ).json()
    await client.patch(f"/founders/{fid}/chats/{chat['id']}", json={"archived": True}, headers=headers)
    rows = (await client.get(f"/founders/{fid}/chats", headers=headers)).json()
    assert chat["id"] not in {r["id"] for r in rows}  # gone from Recents
    # but not deleted — still directly fetchable
    assert (await client.get(f"/founders/{fid}/chats/{chat['id']}", headers=headers)).status_code == 200


async def test_patch_cannot_touch_another_founders_chat(client):
    fid_a, headers_a = await _signup(client)
    chat = (
        await client.post(
            f"/founders/{fid_a}/chats", json={"messages": [{"role": "user", "text": "mine"}]}, headers=headers_a
        )
    ).json()
    fid_b, headers_b = await _signup(client)
    resp = await client.patch(
        f"/founders/{fid_b}/chats/{chat['id']}", json={"title": "hax"}, headers=headers_b
    )
    assert resp.status_code == 404  # owner-scoped, never leaks the row
