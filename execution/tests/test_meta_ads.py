"""Meta ad-data connector — reshape + OAuth finalize + insights paging.

All network is mocked via httpx.MockTransport, so these run offline.
"""

import httpx
import pytest

from mrk18_execution.integrations import meta_ads
from mrk18_execution.security.oauth import ProviderConfig

PROVIDER = ProviderConfig(
    platform="meta",
    authorize_url="https://www.facebook.com/v23.0/dialog/oauth",
    token_url="https://graph.facebook.com/v23.0/oauth/access_token",
    client_id="cid",
    client_secret="secret",
    redirect_uri="https://mrk18.example/oauth/callback",
)


def test_reshape_insights_flattens_nested_roas_and_actions():
    rows = [
        {
            "campaign_name": "Retargeting",
            "account_currency": "INR",
            "spend": "1000.50",
            "clicks": "100",
            "ctr": "2.0",
            "cpc": "10.0",
            "actions": [
                {"action_type": "purchase", "value": "5"},
                {"action_type": "link_click", "value": "80"},  # not a conversion
            ],
            "purchase_roas": [{"action_type": "omni_purchase", "value": "3.2"}],
        },
        {"campaign_name": "Cold", "spend": "500"},  # sparse row — missing most fields
    ]
    out = meta_ads.reshape_insights(rows)
    assert out["total_spend"] == 1500.5
    assert out["currency"] == "INR"
    a, b = out["campaigns"]
    assert a == {"name": "Retargeting", "spend": 1000.5, "ctr": 2.0, "cpc": 10.0, "roas": 3.2, "conversions": 5}
    assert b == {"name": "Cold", "spend": 500.0, "ctr": None, "cpc": None, "roas": None, "conversions": 0}


def test_reshape_handles_empty():
    assert meta_ads.reshape_insights([]) == {"total_spend": 0.0, "currency": None, "campaigns": []}


@pytest.mark.asyncio
async def test_finalize_oauth_swaps_long_lived_and_links_account():
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "oauth/access_token" in url:
            # token must travel in the POST body, NEVER the URL
            body = request.content.decode()
            assert "fb_exchange_token" in body and "SHORT" in body
            assert "SHORT" not in url
            return httpx.Response(200, json={"access_token": "LONG", "expires_in": 5184000})
        if "me/adaccounts" in url:
            # token must ride the Authorization header, not the URL
            assert "LONG" not in url
            assert request.headers.get("authorization") == "Bearer LONG"
            return httpx.Response(
                200,
                json={"data": [
                    {"id": "act_disabled", "account_status": 2, "currency": "INR"},
                    {"id": "act_999", "account_status": 1, "currency": "INR", "name": "Main"},
                ]},
            )
        return httpx.Response(404)

    res = await meta_ads.finalize_oauth(PROVIDER, "SHORT", transport=httpx.MockTransport(handler))
    assert res["access_token"] == "LONG"
    assert res["expires_in"] == 5184000
    assert res["external_ref"] == "act_999"  # prefers the ACTIVE account


@pytest.mark.asyncio
async def test_finalize_oauth_defaults_expiry_when_meta_omits_it():
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "oauth/access_token" in url:
            return httpx.Response(200, json={"access_token": "LONG"})  # no expires_in
        return httpx.Response(200, json={"data": [{"id": "act_1", "account_status": 1}]})

    res = await meta_ads.finalize_oauth(PROVIDER, "SHORT", transport=httpx.MockTransport(handler))
    assert res["expires_in"] == meta_ads.LONG_LIVED_TTL_SECONDS  # so needs_reconnect can fire


@pytest.mark.asyncio
async def test_fetch_insights_follows_cursor_paging_without_token_in_url():
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        assert "TOK" not in url  # token rides the Bearer header, never the URL
        assert request.headers.get("authorization") == "Bearer TOK"
        if "after=PAGE2" in url:
            return httpx.Response(200, json={"data": [{"campaign_name": "B", "spend": "5"}]})
        return httpx.Response(
            200,
            json={
                "data": [{"campaign_name": "A", "spend": "10"}],
                "paging": {"next": "https://x/next", "cursors": {"after": "PAGE2"}},
            },
        )

    rows = await meta_ads.fetch_insights("TOK", "act_1", transport=httpx.MockTransport(handler))
    assert [r["campaign_name"] for r in rows] == ["A", "B"]


@pytest.mark.asyncio
async def test_finalize_oauth_raises_on_missing_token():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": "bad"})  # no access_token

    with pytest.raises(meta_ads.MetaError):
        await meta_ads.finalize_oauth(PROVIDER, "SHORT", transport=httpx.MockTransport(handler))
