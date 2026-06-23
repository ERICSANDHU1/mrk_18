"""Live publish transports (LinkedIn + X) — Phase 2.

No network: httpx.MockTransport intercepts the real request the adapter builds,
so we assert the exact endpoint, payload shape, response parsing, and the
error→status mapping that go-live depends on.
"""

import json
from datetime import datetime, timezone
from uuid import uuid4

import httpx
import pytest

from mrk18_execution.publishers.adapters import (
    LinkedInApiAdapter,
    PublishTransportError,
    XApiAdapter,
)
from mrk18_execution.schemas.enums import Platform, PublishStatus
from mrk18_execution.schemas.publishing import PublishRequest


def _req(platform=Platform.LINKEDIN, thread=None, first_comment=None, body="A real, fully-formed post body."):
    return PublishRequest(
        request_id=f"{uuid4()}:test",
        item_id=uuid4(),
        approval_event_id=uuid4(),
        platform=platform,
        account_ref="founder:123:x",
        author_handle="@founder",
        body=body,
        thread=thread,
        first_comment=first_comment,
        scheduled_at=datetime.now(timezone.utc),
    )


# ── LinkedIn ─────────────────────────────────────────────────────────────────
async def test_linkedin_live_publishes_and_comments():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path == "/rest/posts":
            # the author must be the connected member URN, not the placeholder
            assert json.loads(request.content)["author"] == "urn:li:person:member42"
            return httpx.Response(201, headers={"x-restli-id": "urn:li:share:999"})
        return httpx.Response(201, json={})  # the first-comment call

    adapter = LinkedInApiAdapter(
        stub=False, access_token="tok", author_ref="member42", transport=httpx.MockTransport(handler)
    )
    result = await adapter.publish(_req(first_comment="https://brand.in"))

    assert result.status == PublishStatus.PUBLISHED
    assert result.platform_post_id == "urn:li:share:999"
    assert "linkedin.com/feed/update/urn:li:share:999" in result.public_url
    assert result.raw_response["first_comment_posted"] is True
    assert "/rest/posts" in seen and any("/comments" in p for p in seen)


async def test_linkedin_live_token_expired_is_retryable():
    adapter = LinkedInApiAdapter(
        stub=False,
        access_token="stale",
        author_ref="m",
        transport=httpx.MockTransport(lambda r: httpx.Response(401, text="token expired")),
    )
    result = await adapter.publish(_req())
    assert result.status == PublishStatus.RETRYABLE
    assert result.error.is_token_expired is True
    assert result.error.code == "linkedin_http_401"


async def test_linkedin_live_requires_a_token():
    adapter = LinkedInApiAdapter(
        stub=False, access_token=None, transport=httpx.MockTransport(lambda r: httpx.Response(201))
    )
    with pytest.raises(PublishTransportError):
        await adapter.publish(_req())


async def test_linkedin_stub_path_unchanged():
    result = await LinkedInApiAdapter().publish(_req())  # stub=True default
    assert result.status == PublishStatus.PUBLISHED
    assert result.raw_response["stub"] is True


# ── X ────────────────────────────────────────────────────────────────────────
async def test_x_live_threads_with_reply_chaining():
    posted: list[dict] = []
    n = {"i": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        posted.append(json.loads(request.content))
        n["i"] += 1
        return httpx.Response(201, json={"data": {"id": f"17000000000000000{n['i']}"}})

    adapter = XApiAdapter(stub=False, access_token="tok", transport=httpx.MockTransport(handler))
    result = await adapter.publish(
        _req(
            platform=Platform.X,
            body="Segment one — the hook.",
            thread=["Segment one — the hook.", "Segment two — the detail.", "Segment three — the close."],
        )
    )

    assert result.status == PublishStatus.PUBLISHED
    assert len(result.thread_ids) == 3
    assert result.platform_post_id == result.thread_ids[0]
    assert "x.com/i/web/status/" in result.public_url
    # the first tweet stands alone; each later one replies to the previous id
    assert "reply" not in posted[0]
    assert posted[1]["reply"]["in_reply_to_tweet_id"] == result.thread_ids[0]
    assert posted[2]["reply"]["in_reply_to_tweet_id"] == result.thread_ids[1]


async def test_x_live_error_maps_to_failure():
    adapter = XApiAdapter(
        stub=False,
        access_token="tok",
        transport=httpx.MockTransport(lambda r: httpx.Response(403, text="forbidden")),
    )
    result = await adapter.publish(_req(platform=Platform.X, body="hi there"))
    assert result.status == PublishStatus.FAILED
    assert result.error.code == "x_http_403"
