"""Facebook Login for Business vs the classic scope flow.

New Meta Business apps ship "Facebook Login for Business", which takes its
permissions from a saved Configuration (config_id) in the app dashboard and
IGNORES `scope` — a scope-only dialog gets rejected. Every other provider still
uses classic scopes. start_connection must speak both.
"""

from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.security.oauth import ProviderConfig, start_connection

_BASE = dict(
    platform="meta",
    authorize_url="https://www.facebook.com/v23.0/dialog/oauth",
    token_url="https://graph.facebook.com/v23.0/oauth/access_token",
    client_id="cid",
    client_secret="secret",
    redirect_uri="https://mrk18.example/oauth/callback",
)


async def _authorize_params(engine, provider: ProviderConfig) -> dict:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        result = await start_connection(session, provider, uuid4(), ["ads_read"])
        await session.commit()
    return parse_qs(urlparse(result["authorize_url"]).query)


async def test_login_for_business_sends_config_id_and_no_scope(engine):
    provider = ProviderConfig(**_BASE, config_id="1234567890")
    params = await _authorize_params(engine, provider)

    assert params["config_id"] == ["1234567890"]
    assert "scope" not in params  # Login for Business rejects the scope-only dialog
    # PKCE + state still ride along regardless of flow
    assert params["code_challenge_method"] == ["S256"]
    assert params["response_type"] == ["code"]


async def test_classic_flow_still_sends_scope_when_no_config_id(engine):
    provider = ProviderConfig(**_BASE)  # config_id defaults to ""
    params = await _authorize_params(engine, provider)

    assert params["scope"] == ["ads_read"]
    assert "config_id" not in params
