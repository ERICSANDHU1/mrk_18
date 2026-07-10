"""Public free taster (the landing-hero URL analysis) — POST /taster.

The route is exercised with the Tavily fetch and the adapter calls faked at
their seams (fetch_page / _call_adapter), so these tests cover the walls that
matter: URL validation, dormant-until-configured, the per-domain cache, the
per-IP daily cap, and honest cold-start degradation.
"""

import httpx
import pytest
from openai import APITimeoutError

import mrk18_execution.api.taster as taster_mod
from mrk18_execution.config import Settings


@pytest.fixture(autouse=True)
def _reset_daily_cap():
    taster_mod._daily.clear()
    yield
    taster_mod._daily.clear()


def _configure(monkeypatch, **overrides):
    defaults = dict(
        _env_file=None,
        tavily_api_key="tvly-test",
        taster_base_url="https://api.runpod.ai/v2/test/openai/v1",
        taster_api_key="rp-test",
    )
    settings = Settings(**{**defaults, **overrides})
    monkeypatch.setattr(taster_mod, "get_settings", lambda: settings)
    return settings


def _fake_site(monkeypatch, text="We sell handmade oak desks to remote workers."):
    async def fetch_page(self, url):
        return text

    monkeypatch.setattr(
        "mrk18_execution.research.web.TavilyResearcher.fetch_page", fetch_page
    )


def _fake_adapters(monkeypatch):
    calls: list[str] = []

    async def call_adapter(client, adapter, site_text, url, max_tokens):
        calls.append(adapter)
        return f"{adapter} verdict"

    monkeypatch.setattr(taster_mod, "_call_adapter", call_adapter)
    return calls


async def test_taster_rejects_garbage_urls(client):
    for bad in ["nodots", "localhost", "127.0.0.1", "  "]:
        resp = await client.post("/taster", json={"url": bad})
        assert resp.status_code == 422, f"{bad!r} → {resp.status_code}"


async def test_taster_unconfigured_dev_returns_labeled_sample(client, monkeypatch):
    _configure(monkeypatch, taster_base_url="", tavily_api_key="")
    resp = await client.post("/taster", json={"url": "acme.com"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["sample"] is True
    assert set(body["results"]) == set(taster_mod.TASTER_ADAPTERS)


async def test_taster_unconfigured_prod_is_dormant_503(client, monkeypatch):
    _configure(monkeypatch, app_env="prod", taster_base_url="", tavily_api_key="")
    resp = await client.post("/taster", json={"url": "acme.com"})
    assert resp.status_code == 503


async def test_taster_analyzes_then_serves_cache(client, monkeypatch):
    _configure(monkeypatch)
    _fake_site(monkeypatch)
    calls = _fake_adapters(monkeypatch)

    resp = await client.post("/taster", json={"url": "https://www.acme.com/"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["domain"] == "acme.com"  # www is stripped, path ignored
    assert body["cached"] is False
    assert body["results"]["usp"] == "usp verdict"
    assert sorted(calls) == sorted(taster_mod.TASTER_ADAPTERS)

    # repeat hit (any URL shape on the same domain) → cache, no new GPU calls
    resp2 = await client.post("/taster", json={"url": "acme.com"})
    assert resp2.status_code == 200
    assert resp2.json()["cached"] is True
    assert len(calls) == len(taster_mod.TASTER_ADAPTERS)


async def test_taster_daily_cap_answers_429(client, monkeypatch):
    _configure(monkeypatch, taster_daily_per_ip=1)
    _fake_site(monkeypatch)
    _fake_adapters(monkeypatch)

    assert (await client.post("/taster", json={"url": "first.com"})).status_code == 200
    resp = await client.post("/taster", json={"url": "second.com"})
    assert resp.status_code == 429
    assert "tomorrow" in resp.json()["detail"]


async def test_taster_cache_hit_skips_the_daily_cap(client, monkeypatch):
    _configure(monkeypatch, taster_daily_per_ip=1)
    _fake_site(monkeypatch)
    _fake_adapters(monkeypatch)

    assert (await client.post("/taster", json={"url": "acme.com"})).status_code == 200
    # cap is spent, but the cached domain still answers — refreshes cost nothing
    resp = await client.post("/taster", json={"url": "acme.com"})
    assert resp.status_code == 200
    assert resp.json()["cached"] is True


async def test_taster_unreadable_site_is_422(client, monkeypatch):
    _configure(monkeypatch)
    _fake_site(monkeypatch, text="")
    resp = await client.post("/taster", json={"url": "unreachable-site.com"})
    assert resp.status_code == 422


async def test_taster_cold_start_maps_to_honest_503(client, monkeypatch):
    _configure(monkeypatch)
    _fake_site(monkeypatch)

    async def cold(client_, adapter, site_text, url, max_tokens):
        raise APITimeoutError(request=httpx.Request("POST", "https://api.runpod.ai"))

    monkeypatch.setattr(taster_mod, "_call_adapter", cold)
    resp = await client.post("/taster", json={"url": "coldstart.com"})
    assert resp.status_code == 503
    assert "warming up" in resp.json()["detail"]
