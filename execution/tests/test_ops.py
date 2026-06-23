"""C4 — ops endpoints: liveness version, readiness, Prometheus metrics."""

from tests.authtools import MAINTENANCE_KEY


async def test_health_reports_version(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "version" in body


async def test_readyz_ok_when_db_answers(client):
    r = await client.get("/readyz")
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is True and body["db"] is True


async def test_metrics_requires_maintenance_key(client):
    r = await client.get("/metrics")
    assert r.status_code in (401, 503)  # no key → refused, never public


async def test_metrics_exposes_prometheus(client):
    r = await client.get("/metrics", headers={"X-Maintenance-Key": MAINTENANCE_KEY})
    assert r.status_code == 200
    assert "text/plain" in r.headers["content-type"]
    assert "mrk18_up 1" in r.text
    assert "mrk18_runs_total" in r.text
