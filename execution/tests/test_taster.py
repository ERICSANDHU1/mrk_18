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
    taster_mod._domain_locks.clear()
    taster_mod._global_day[0], taster_mod._global_day[1] = "", 0
    yield
    taster_mod._daily.clear()
    taster_mod._domain_locks.clear()
    taster_mod._global_day[0], taster_mod._global_day[1] = "", 0


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
        results = {
            c: {"verdict": f"{c} verdict", "points": [f"{c} point"], "score": 55}
            for c in taster_mod.TASTER_ADAPTERS
        }
        extras = {
            "key_insights": ["Insight one.", "Insight two.", "Insight three."],
            "quick_wins": ["Win one.", "Win two.", "Win three."],
            "positioning": "The headline your CMO would run.",
        }
        return results, extras

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
    assert body["quick_wins"] == ["Win one.", "Win two.", "Win three."]
    assert body["positioning"] == "The headline your CMO would run."
    assert body["results"]["usp"] == {"verdict": "usp verdict", "points": ["usp point"], "score": 55}

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
    body = resp.json()
    assert body["competitors"] == []
    assert research_calls == []  # no web research in adapter mode
    # model name = adapter name, one per card
    assert {m for m, _, _ in verdicts} == set(taster_mod.TASTER_ADAPTERS)
    # adapter prose is wrapped into the same visual shape the frontend renders
    assert body["results"]["usp"] == {"verdict": "usp verdict", "points": [], "score": None}


async def test_taster_daily_cap_answers_429(client, monkeypatch):
    _configure(monkeypatch, taster_daily_per_ip=1)
    _fake_site(monkeypatch)
    _fake_research(monkeypatch)
    _fake_verdicts(monkeypatch)

    assert (await client.post("/taster", json={"url": "first.com"})).status_code == 200
    resp = await client.post("/taster", json={"url": "second.com"})
    assert resp.status_code == 429
    assert "sign up" in resp.json()["detail"]


async def test_taster_signed_in_user_is_exempt_from_the_cap(client, monkeypatch):
    """Anonymous visitors hit the per-IP free cap; a signed-in caller (valid
    Clerk-style token) sails past it and never burns the anonymous quota."""
    from tests.authtools import bearer, mint

    _configure(monkeypatch, taster_daily_per_ip=1)
    _fake_site(monkeypatch)
    _fake_research(monkeypatch)
    _fake_verdicts(monkeypatch)

    # anonymous: one fresh analysis, then capped
    assert (await client.post("/taster", json={"url": "anon-a.com"})).status_code == 200
    assert (await client.post("/taster", json={"url": "anon-b.com"})).status_code == 429

    # signed-in: same IP, cap already spent, yet each fresh domain still returns
    hdr = bearer(mint())
    for d in ("member-a.com", "member-b.com", "member-c.com"):
        r = await client.post("/taster", json={"url": d}, headers=hdr)
        assert r.status_code == 200, f"{d}: {r.text}"


async def test_taster_global_daily_cap_answers_429(client, monkeypatch):
    _configure(monkeypatch, taster_daily_global=1, taster_daily_per_ip=0)
    _fake_site(monkeypatch)
    _fake_research(monkeypatch)
    _fake_verdicts(monkeypatch)

    assert (await client.post("/taster", json={"url": "first.com"})).status_code == 200
    resp = await client.post("/taster", json={"url": "second.com"})
    assert resp.status_code == 429
    assert "capacity" in resp.json()["detail"]


async def test_taster_concurrent_same_domain_runs_once(client, monkeypatch):
    """Regression: dev StrictMode double-fires the page fetch; both used to miss
    the cache and burn TWO engine runs + TWO quota slots for one visitor. The
    per-domain lock makes the twin wait, then serve from cache."""
    import asyncio

    _configure(monkeypatch, taster_daily_per_ip=2)
    _fake_site(monkeypatch)
    _fake_research(monkeypatch)
    verdicts = _fake_verdicts(monkeypatch)

    r1, r2 = await asyncio.gather(
        client.post("/taster", json={"url": "racing.com"}),
        client.post("/taster", json={"url": "racing.com"}),
    )
    assert r1.status_code == 200 and r2.status_code == 200
    assert len(verdicts) == 1  # one engine run served both
    assert {r1.json()["cached"], r2.json()["cached"]} == {False, True}
    # and only ONE quota slot was spent — a third fresh domain still fits cap=2
    assert (await client.post("/taster", json={"url": "third.com"})).status_code == 200


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


def test_normalize_card_drops_junk_bullets():
    """Regression: a live run on chatgpt.com had the model leak its own field
    name and a stringified traits list into "points" — ["...", "Traits", ":",
    "['helpful', 'neutral', 'accessible']"]. Those must never reach the hero."""
    raw = {
        "verdict": "Voice feels helpful but transactional.",
        "points": [
            '"Where should we begin?" feels inviting',
            "Traits",
            ":",
            "['helpful', 'neutral', 'accessible']",
            "",
        ],
        "score": 50,
        "traits": ["helpful", "neutral", "accessible"],
    }
    card = taster_mod._normalize_card("personality", raw)
    assert card is not None
    assert card["points"] == ['"Where should we begin?" feels inviting']


def test_normalize_card_drops_traits_restated_as_a_bullet():
    """A different live slip: the model both fills "traits" correctly AND
    restates it as a prose bullet ("Traits: neutral, helpful, instructional,
    generic") — pure duplication of the trait chips already shown."""
    raw = {
        "verdict": "Voice is neutral and instructional.",
        "points": [
            '"Log in to get answers" feels transactional',
            "Traits: neutral, helpful, instructional, generic",
        ],
        "score": 50,
        "traits": ["neutral", "helpful", "instructional", "generic"],
    }
    card = taster_mod._normalize_card("personality", raw)
    assert card["points"] == ['"Log in to get answers" feels transactional']


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
