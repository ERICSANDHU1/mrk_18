"""Public free taster (the landing-hero URL analysis) — POST /taster.

The route is exercised with its seams faked (fetch_page / _gather_context /
_verdict_call), so these tests cover the walls that matter: URL validation,
dormant-until-configured, engine resolution (Groq fallback vs adapter mode),
the per-domain cache, the per-IP daily cap, competitor grounding, and honest
engine-failure degradation.
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
    """Default = the shipping config: Groq engine via GROQ_API_KEY + Tavily."""
    defaults = dict(
        _env_file=None,
        tavily_api_key="tvly-test",
        groq_api_key="gsk-test",
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


def _fake_research(monkeypatch, blocks=None, competitors=None, company="Acme", offer="desks"):
    calls: list[dict] = []

    async def gather(researcher, client, mini, site_text, url, domain, max_competitors):
        calls.append({"mini": mini, "domain": domain})
        return dict(blocks or {}), list(competitors or []), company, offer

    monkeypatch.setattr(taster_mod, "_gather_context", gather)
    return calls


def _fake_verdicts(monkeypatch):
    """Fake BOTH verdict seams: the combined single call (model mode) and the
    per-adapter calls (adapter mode)."""
    calls: list[tuple[str, str, str]] = []  # (kind_or_model, card, user_content)

    async def combined(client, model, user_content, max_tokens):
        calls.append((model, "combined", user_content))
        results = {c: f"{c} verdict" for c in taster_mod.TASTER_ADAPTERS}
        return results, ["Insight one.", "Insight two.", "Insight three."]

    async def verdict(client, model, card, user_content, max_tokens):
        calls.append((model, card, user_content))
        return f"{card} verdict"

    monkeypatch.setattr(taster_mod, "_combined_call", combined)
    monkeypatch.setattr(taster_mod, "_verdict_call", verdict)
    return calls


async def test_taster_rejects_garbage_urls(client):
    for bad in ["nodots", "localhost", "127.0.0.1", "  "]:
        resp = await client.post("/taster", json={"url": bad})
        assert resp.status_code == 422, f"{bad!r} → {resp.status_code}"


async def test_taster_unconfigured_dev_returns_labeled_sample(client, monkeypatch):
    _configure(monkeypatch, groq_api_key="", tavily_api_key="")
    resp = await client.post("/taster", json={"url": "acme.com"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["sample"] is True
    assert set(body["results"]) == set(taster_mod.TASTER_ADAPTERS)


async def test_taster_unconfigured_prod_is_dormant_503(client, monkeypatch):
    _configure(monkeypatch, app_env="prod", groq_api_key="", tavily_api_key="")
    resp = await client.post("/taster", json={"url": "acme.com"})
    assert resp.status_code == 503


async def test_taster_analyzes_with_competitors_then_serves_cache(client, monkeypatch):
    _configure(monkeypatch)
    _fake_site(monkeypatch)
    research_calls = _fake_research(
        monkeypatch,
        blocks={"differentiation": "COMPETITORS (found via live web search):\n- Zed Desks: ..."},
        competitors=["Zed Desks"],
    )
    verdicts = _fake_verdicts(monkeypatch)

    resp = await client.post("/taster", json={"url": "https://www.acme.com/"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["domain"] == "acme.com"  # www stripped, path ignored
    assert body["cached"] is False
    assert body["competitors"] == ["Zed Desks"]
    assert body["company"] == "Acme"
    assert body["offer"] == "desks"
    assert body["key_insights"] == ["Insight one.", "Insight two.", "Insight three."]
    assert body["results"]["usp"] == "usp verdict"

    # research ran once, on the fast mini model (Groq mode)
    assert research_calls == [{"mini": taster_mod._MINI_MODEL, "domain": "acme.com"}]
    # model mode = ONE combined call on gpt-oss-120b carrying the competitor block
    assert len(verdicts) == 1
    model, kind, content = verdicts[0]
    assert model == "openai/gpt-oss-120b"
    assert kind == "combined"
    assert "COMPETITORS" in content
    assert "SITE CONTENT" in content

    # repeat hit (any URL shape on the same domain) → cache, no new engine calls
    resp2 = await client.post("/taster", json={"url": "acme.com"})
    assert resp2.status_code == 200
    assert resp2.json()["cached"] is True
    assert len(verdicts) == 1  # still just the one combined call


async def test_taster_adapter_mode_uses_adapter_names_and_skips_research(client, monkeypatch):
    _configure(
        monkeypatch,
        taster_model="",  # adapter mode
        taster_base_url="https://api.runpod.ai/v2/test/openai/v1",
        taster_api_key="rp-test",
    )
    _fake_site(monkeypatch)
    research_calls = _fake_research(monkeypatch)
    verdicts = _fake_verdicts(monkeypatch)

    resp = await client.post("/taster", json={"url": "adapter-mode.com"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["competitors"] == []
    assert research_calls == []  # no web research in adapter mode
    # model name = adapter name, one per card
    assert {m for m, _, _ in verdicts} == set(taster_mod.TASTER_ADAPTERS)


async def test_taster_daily_cap_answers_429(client, monkeypatch):
    _configure(monkeypatch, taster_daily_per_ip=1)
    _fake_site(monkeypatch)
    _fake_research(monkeypatch)
    _fake_verdicts(monkeypatch)

    assert (await client.post("/taster", json={"url": "first.com"})).status_code == 200
    resp = await client.post("/taster", json={"url": "second.com"})
    assert resp.status_code == 429
    assert "tomorrow" in resp.json()["detail"]


async def test_taster_cache_hit_skips_the_daily_cap(client, monkeypatch):
    _configure(monkeypatch, taster_daily_per_ip=1)
    _fake_site(monkeypatch)
    _fake_research(monkeypatch)
    _fake_verdicts(monkeypatch)

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


async def test_taster_engine_failure_is_503_and_spares_the_quota(client, monkeypatch):
    _configure(monkeypatch, taster_daily_per_ip=1)
    _fake_site(monkeypatch)
    _fake_research(monkeypatch)

    async def down(client_, model, user_content, max_tokens):
        raise APITimeoutError(request=httpx.Request("POST", "https://api.groq.com"))

    monkeypatch.setattr(taster_mod, "_combined_call", down)
    resp = await client.post("/taster", json={"url": "coldstart.com"})
    assert resp.status_code == 503

    # the failed attempt must NOT have consumed the caller's only free analysis
    _fake_verdicts(monkeypatch)
    resp2 = await client.post("/taster", json={"url": "coldstart.com"})
    assert resp2.status_code == 200, resp2.text


async def test_taster_recent_lists_latest_analyses(client, monkeypatch):
    _configure(monkeypatch)
    _fake_site(monkeypatch)
    _fake_research(monkeypatch, company="Acme")
    _fake_verdicts(monkeypatch)

    assert (await client.post("/taster", json={"url": "acme.com"})).status_code == 200
    resp = await client.get("/taster/recent")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert {"domain": "acme.com", "company": "Acme"} in items
