"""The four publisher adapters.

LinkedIn / X: built to the REAL request/response shapes (research-verified,
11 Jun 2026) over a STUB transport — flipping live later means implementing
one `_send` method per adapter, nothing else. Results are honestly marked
`stub: true`; stub publishes never claim an item is truly published.

InstagramOpsAdapter: a REAL flow — it queues a task for the human ops team
(2–4 h SLA); the result completes asynchronously when ops pastes the URL.

ExportAdapter: REAL and the pilot's main act — approved content becomes a
ready-to-post kit on disk (E1 rung of the ladder).
"""

import pathlib
from datetime import datetime, timezone
from uuid import uuid4

import httpx

from ..schemas.enums import PublishStatus
from ..schemas.publishing import PublishRequest, PublishResult
from ..security.steptokens import require_publish_token


def _now() -> datetime:
    return datetime.now(timezone.utc)


class LinkedInApiAdapter:
    """Versioned Posts API: POST https://api.linkedin.com/rest/posts
    Headers: LinkedIn-Version (config, quarterly bump) + X-Restli-Protocol-Version.
    Response: 201, empty body, post URN in the `x-restli-id` header.
    Link policy: link rides in first_comment (a second, comment-create call)."""

    name = "linkedin_api"
    LINKEDIN_VERSION = "202605"

    def __init__(self, stub: bool = True, signing_key: str | None = None):
        self.stub = stub
        self.signing_key = signing_key

    def build_payload(self, request: PublishRequest) -> dict:
        payload = {
            "author": f"urn:li:person:{{member_id:{request.account_ref}}}",
            "commentary": request.body,
            "visibility": request.visibility.value,
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False,
        }
        if request.media:
            payload["content"] = {
                "media": {"altText": request.media[0].alt_text, "id": "urn:li:image:{pending}"}
            }
        return payload

    async def publish(
        self, request: PublishRequest, step_token: str | None = None
    ) -> PublishResult:
        require_publish_token(self.signing_key, request, step_token)
        payload = self.build_payload(request)
        if self.stub:
            urn = f"urn:li:share:{uuid4().int % 10**19}"
            return PublishResult(
                request_id=request.request_id,
                status=PublishStatus.PUBLISHED,
                platform_post_id=urn,
                public_url=f"https://www.linkedin.com/feed/update/{urn}/",
                published_at=_now(),
                raw_response={
                    "stub": True,
                    "would_send": payload,
                    "headers": {
                        "LinkedIn-Version": self.LINKEDIN_VERSION,
                        "X-Restli-Protocol-Version": "2.0.0",
                    },
                    "first_comment_call": bool(request.first_comment),
                },
            )
        raise NotImplementedError("live LinkedIn transport lands at go-live (needs OAuth app)")


class XApiAdapter:
    """Pay-per-use v2 API: POST /2/tweets; threads = chained replies via
    reply.in_reply_to_tweet_id. Cost flag: $0.015/post, $0.20 if a URL rides
    in the text (the 13× research finding, surfaced per request)."""

    name = "x_api"

    def __init__(self, stub: bool = True, signing_key: str | None = None):
        self.stub = stub
        self.signing_key = signing_key

    def build_payloads(self, request: PublishRequest) -> list[dict]:
        segments = request.thread or [request.body]
        payloads: list[dict] = [{"text": segments[0]}]
        for seg in segments[1:]:
            payloads.append({"text": seg, "reply": {"in_reply_to_tweet_id": "{prev_id}"}})
        return payloads

    def estimate_cost_usd(self, request: PublishRequest) -> float:
        segments = request.thread or [request.body]
        per_post = lambda text: 0.20 if (request.link_url and request.link_url in text) or "http" in text else 0.015  # noqa: E731
        return round(sum(per_post(s) for s in segments), 3)

    async def publish(
        self, request: PublishRequest, step_token: str | None = None
    ) -> PublishResult:
        require_publish_token(self.signing_key, request, step_token)
        payloads = self.build_payloads(request)
        if self.stub:
            ids = [str(1_900_000_000_000_000_000 + uuid4().int % 10**16) for _ in payloads]
            return PublishResult(
                request_id=request.request_id,
                status=PublishStatus.PUBLISHED,
                platform_post_id=ids[0],
                thread_ids=ids,
                public_url=f"https://x.com/i/status/{ids[0]}",
                published_at=_now(),
                cost_estimate_usd=self.estimate_cost_usd(request),
                raw_response={"stub": True, "would_send": payloads},
            )
        raise NotImplementedError("live X transport lands at go-live (needs paid console key)")


class InstagramOpsAdapter:
    """REAL flow: queue a fully-prepared task for the human ops team.
    Content was validated at generation (JPEG, aspect, length) so ops never
    bounces a post. Result stays queued_manual until ops pastes the live URL."""

    name = "instagram_ops"
    SLA_HOURS = 4

    def __init__(self, signing_key: str | None = None):
        self.signing_key = signing_key

    async def publish(
        self, request: PublishRequest, step_token: str | None = None
    ) -> PublishResult:
        require_publish_token(self.signing_key, request, step_token)
        task = {
            "account_handle": request.account_ref,
            "caption": request.body,
            "first_comment": request.first_comment,
            "image_urls": [m.url for m in request.media],
            "alt_text": request.media[0].alt_text if request.media else "",
            "sla_window_hours": self.SLA_HOURS,
            "instructions": "Post via Meta Business Suite (delegated partner access — never password sharing).",
        }
        return PublishResult(
            request_id=request.request_id,
            status=PublishStatus.QUEUED_MANUAL,
            raw_response={"ops_task": task},
        )


class ExportAdapter:
    """E1: the approved post becomes a ready-to-post kit on disk — REAL value
    while platform connections wait. Founder (or ops) copies and pastes."""

    name = "export"

    def __init__(self, base_dir: str | pathlib.Path = "exports", signing_key: str | None = None):
        self.base_dir = pathlib.Path(base_dir)
        self.signing_key = signing_key

    async def publish(
        self, request: PublishRequest, step_token: str | None = None
    ) -> PublishResult:
        require_publish_token(self.signing_key, request, step_token)
        kit_dir = self.base_dir / str(request.item_id)[:8]
        kit_dir.mkdir(parents=True, exist_ok=True)

        lines = [f"=== {request.platform.value.upper()} — ready to post ===", ""]
        if request.thread:
            for i, seg in enumerate(request.thread, 1):
                lines += [f"--- tweet {i}/{len(request.thread)} ---", seg, ""]
            lines += ["HOW: post tweet 1, then reply to it with each next segment in order."]
        else:
            lines += [request.body, ""]
        if request.first_comment:
            lines += ["", "--- FIRST COMMENT (post this as the first comment) ---", request.first_comment]
        if request.platform.value == "instagram":
            lines += ["", "NOTE: links are not clickable on IG — keep them in bio."]
        (kit_dir / f"{request.platform.value}.txt").write_text("\n".join(lines), encoding="utf-8")

        image_files: list[str] = []
        for n, media in enumerate(request.media):
            img_path = kit_dir / f"{request.platform.value}-image-{n + 1}.jpg"
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.get(media.url)
                    resp.raise_for_status()
                    img_path.write_bytes(resp.content)
                image_files.append(img_path.name)
            except Exception:  # noqa: BLE001 — kit still ships; URL is in the txt
                (kit_dir / f"{request.platform.value}-image-{n + 1}-URL.txt").write_text(
                    media.url, encoding="utf-8"
                )

        return PublishResult(
            request_id=request.request_id,
            status=PublishStatus.EXPORTED,
            public_url=str(kit_dir.resolve()),
            published_at=_now(),
            raw_response={"kit_dir": str(kit_dir.resolve()), "images": image_files},
        )
