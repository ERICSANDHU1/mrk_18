"""B3 — the public status-metadata endpoint (UI's source of truth for lifecycles)."""


async def test_statuses_lists_enums_and_transitions(client):
    data = (await client.get("/meta/statuses")).json()
    # run lifecycle
    assert "generating" in data["run_status"]["values"]
    assert set(data["run_status"]["terminal"]) == {"done", "failed"}
    # content state machine
    cs = data["content_status"]
    assert "awaiting_approval" in cs["values"]
    assert "approved" in cs["transitions"]["awaiting_approval"]
    assert "published" in cs["terminal"] and "expired" in cs["terminal"]
    assert "awaiting_approval" not in cs["terminal"]
    # others present
    assert "queued_manual" in data["publish_status"]["values"]
    assert data["approval_decision"]["values"] == ["approved", "rejected"]


async def test_statuses_is_public(client):
    # no auth header → still 200 (static metadata, no founder data)
    assert (await client.get("/meta/statuses")).status_code == 200
