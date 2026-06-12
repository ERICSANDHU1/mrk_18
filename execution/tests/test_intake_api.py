"""Slice 1.2 — attacking the intake gate.

Every test here tries to break a product rule and proves it holds:
incomplete intake cannot complete, silence-side rules, locked-after-complete,
audit evidence persists even on rejection.
"""

from uuid import uuid4

from sqlalchemy import select

from mrk18_execution.db.models import AuditRow
from tests.authtools import mint

FULL_INTAKE = {
    "company_name": "Chai Robotics",
    "website": "https://chairobotics.in",
    "product_description": "Robotic chai vending machines for Indian offices and campuses.",
    "icp": "Facility managers at 200+ employee Indian tech parks, Tier-1 cities.",
    "top_competitors": ["Chaipoint", "Chaayos"],
    "tone": "bold, warm, desi",
    "primary_goal": "signups",
    "monthly_spend_inr": 30000,
    "target_platforms": ["linkedin", "x"],
    "consent_given": True,
    "consent_text_version": "v1-2026-06",
}


async def make_founder(client, email="aarav@chairobotics.in"):
    # each founder gets a fresh verified identity; the client speaks as them
    # from here on (token email is the source of truth, body email is fallback)
    client.headers["Authorization"] = f"Bearer {mint(uuid4(), email=email)}"
    resp = await client.post("/founders", json={"display_name": "Aarav"})
    assert resp.status_code == 201, resp.text
    return resp.json()["founder_id"]


async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200


async def test_create_founder_and_duplicate_email(client):
    await make_founder(client)
    # a DIFFERENT account claiming the same email is refused
    client.headers["Authorization"] = f"Bearer {mint(uuid4(), email='aarav@chairobotics.in')}"
    dup = await client.post("/founders", json={})
    assert dup.status_code == 409


async def test_duplicate_account_rejected(client):
    sub = uuid4()
    client.headers["Authorization"] = f"Bearer {mint(sub, email='one@chairobotics.in')}"
    first = await client.post("/founders", json={})
    assert first.status_code == 201
    # same verified identity, second founder row — refused
    client.headers["Authorization"] = f"Bearer {mint(sub, email='two@chairobotics.in')}"
    again = await client.post("/founders", json={})
    assert again.status_code == 409


async def test_invalid_email_rejected(client):
    # token without an email claim → body email is used and validated
    client.headers["Authorization"] = f"Bearer {mint(uuid4())}"
    resp = await client.post("/founders", json={"email": "not-an-email"})
    assert resp.status_code == 422


async def test_no_email_anywhere_rejected(client):
    client.headers["Authorization"] = f"Bearer {mint(uuid4())}"
    resp = await client.post("/founders", json={})
    assert resp.status_code == 422


async def test_foreign_founder_id_is_403_not_404(client):
    """Probing an arbitrary founder id must NOT reveal whether it exists."""
    await make_founder(client)
    resp = await client.get("/founders/00000000-0000-0000-0000-000000000000/intake")
    assert resp.status_code == 403


async def test_partial_save_reports_missing_fields(client):
    fid = await make_founder(client)
    resp = await client.put(
        f"/founders/{fid}/intake",
        json={"company_name": "Chai Robotics", "website": "https://chairobotics.in"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["complete"] is False
    assert "product_description" in body["missing_fields"]
    assert "consent_given" in body["missing_fields"]
    # the partial data survived
    read = await client.get(f"/founders/{fid}/intake")
    assert read.json()["draft"]["company_name"] == "Chai Robotics"


async def test_unknown_field_rejected(client):
    fid = await make_founder(client)
    resp = await client.put(f"/founders/{fid}/intake", json={"hacker_field": "x"})
    assert resp.status_code == 422


async def test_gate_blocks_incomplete_intake(client):
    fid = await make_founder(client)
    await client.put(f"/founders/{fid}/intake", json={"company_name": "Chai Robotics"})
    resp = await client.post(f"/founders/{fid}/intake/complete")
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert "missing_fields" in detail and len(detail["missing_fields"]) > 0


async def test_gate_blocks_four_competitors(client):
    fid = await make_founder(client)
    bad = {**FULL_INTAKE, "top_competitors": ["a", "b", "c", "d"]}
    save = await client.put(f"/founders/{fid}/intake", json=bad)
    assert save.status_code == 200  # drafts may hold anything shape-valid
    resp = await client.post(f"/founders/{fid}/intake/complete")
    assert resp.status_code == 422
    assert any("top_competitors" in p for p in resp.json()["detail"]["problems"])


async def test_gate_blocks_unconsented(client):
    fid = await make_founder(client)
    bad = {**FULL_INTAKE, "consent_given": False}
    await client.put(f"/founders/{fid}/intake", json=bad)
    resp = await client.post(f"/founders/{fid}/intake/complete")
    assert resp.status_code == 422
    assert any("consent" in p for p in resp.json()["detail"]["problems"])


async def test_happy_path_and_lock(client):
    fid = await make_founder(client)
    save = await client.put(f"/founders/{fid}/intake", json=FULL_INTAKE)
    assert save.json()["missing_fields"] == []

    done = await client.post(f"/founders/{fid}/intake/complete")
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "ready_for_analysis"
    assert body["complete"] is True
    assert body["profile"]["company_name"] == "Chai Robotics"
    assert body["profile"]["consent"]["given"] is True

    # locked: no more edits, no double-complete
    edit = await client.put(f"/founders/{fid}/intake", json={"tone": "different"})
    assert edit.status_code == 409
    again = await client.post(f"/founders/{fid}/intake/complete")
    assert again.status_code == 409


async def test_audit_trail_written_including_rejection(client, engine):
    fid = await make_founder(client)
    await client.put(f"/founders/{fid}/intake", json={"company_name": "Chai Robotics"})
    await client.post(f"/founders/{fid}/intake/complete")  # rejected → still audited
    await client.put(f"/founders/{fid}/intake", json=FULL_INTAKE)
    await client.post(f"/founders/{fid}/intake/complete")  # success

    async with engine.connect() as conn:
        rows = (await conn.execute(select(AuditRow.outcome))).scalars().all()
    assert "founder_created" in rows
    assert "intake_draft_saved" in rows
    assert "intake_complete_rejected" in rows  # evidence of failure persists
    assert "intake_completed" in rows
