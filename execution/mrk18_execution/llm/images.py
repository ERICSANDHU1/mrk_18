"""Image engines (the Photo Funnel's rendering half) + media storage.

The Brain writes the image PROMPT (a text job — adapter territory); these
engines only render pixels. Engines are swappable behind one interface:

  PollinationsEngine — FREE, keyless, FLUX-based. The pilot default.
  FalImageEngine    — production engine (FLUX.2 klein, ₹0.48/img); activates
                      the day the fal balance is topped up: one config flip.

Every image is normalized to JPEG (Instagram's hard rule) via Pillow and
uploaded to Supabase Storage (public bucket) — blobs never travel in state.
"""

import asyncio
import io
from typing import Protocol
from urllib.parse import quote

import httpx
from PIL import Image


class ImageEngine(Protocol):
    name: str

    async def generate(self, prompt: str, width: int, height: int) -> bytes:
        """Render and return raw image bytes."""
        ...


class PollinationsEngine:
    """Free keyless image API (FLUX-based). Pilot default; swap out any day.

    Pollinations is generous but flaky (occasional ReadError / empty body), so we
    retry a few times with a fresh random seed each attempt — the seed also gives
    genuine variety between two posts of the same brand."""

    name = "pollinations/flux"

    async def generate(self, prompt: str, width: int, height: int) -> bytes:
        import random

        last: Exception | None = None
        for _ in range(3):
            seed = random.randint(1, 1_000_000)
            url = (
                f"https://image.pollinations.ai/prompt/{quote(prompt[:800])}"
                f"?width={width}&height={height}&model=flux&nologo=true&seed={seed}"
            )
            try:
                async with httpx.AsyncClient(timeout=180) as client:
                    resp = await client.get(url, follow_redirects=True)
                    resp.raise_for_status()
                    if resp.content and len(resp.content) > 1000:  # a real image, not an error stub
                        return resp.content
                    last = RuntimeError("pollinations returned an empty image")
            except Exception as exc:  # noqa: BLE001 — retry transient network/read errors
                last = exc
            await asyncio.sleep(2)
        raise last or RuntimeError("pollinations image failed after retries")


class CloudflareImageEngine:
    """Cloudflare Workers AI — FLUX.1 schnell on the FREE tier (no card).

    Needs a free Cloudflare account: Account ID + an API token with
    Workers AI permission. ~Hundreds of images/day inside the free allowance.
    """

    name = "cloudflare/flux-1-schnell"
    MODEL = "@cf/black-forest-labs/flux-1-schnell"

    def __init__(self, account_id: str, api_token: str):
        self._url = (
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{self.MODEL}"
        )
        self._headers = {"Authorization": f"Bearer {api_token}"}

    async def generate(self, prompt: str, width: int, height: int) -> bytes:
        import base64

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                self._url,
                headers=self._headers,
                json={"prompt": prompt[:2000], "steps": 6},
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success", False):
                raise RuntimeError(f"cloudflare ai error: {data.get('errors')}")
            return base64.b64decode(data["result"]["image"])


class FalImageEngine:
    """Production engine: FLUX.2 klein 4B on fal.ai (Apache-2.0, ~₹0.48/img)."""

    name = "fal/flux-2-klein-4b"
    MODEL = "fal-ai/flux-2/klein/4b"

    def __init__(self, fal_key: str):
        self._key = fal_key

    async def generate(self, prompt: str, width: int, height: int) -> bytes:
        import fal_client

        client = fal_client.AsyncClient(key=self._key)
        result = await client.subscribe(
            self.MODEL,
            arguments={
                "prompt": prompt,
                "image_size": {"width": width, "height": height},
                "num_images": 1,
                "output_format": "jpeg",
            },
        )
        url = result["images"][0]["url"]
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.get(url)
            resp.raise_for_status()
            return resp.content


class GeminiImageEngine:
    """Gemini 2.5 Flash Image (Nano Banana) — the Create Campaigns engine.

    Unlike FLUX, it renders legible HEADLINE TEXT and composites a REFERENCE image
    (the founder's real product / logo) into the scene in a single call — so a
    finished branded creative needs no separate text compositor. `refs` carries
    those reference images (JPEG bytes). Free tier by default (Google may use
    free-tier inputs/outputs to improve models); flip to the paid tier — same
    code — to remove that once there's revenue.
    """

    name = "gemini/2.5-flash-image"

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-image"):
        self._key = api_key
        self._url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        )

    async def generate(
        self, prompt: str, width: int, height: int, refs: list[bytes] | None = None
    ) -> bytes:
        import base64

        # the key rides an auth HEADER, never the URL query string (keeps it out
        # of logs/proxies). Reference images (product/logo) go inline alongside
        # the prompt — that's what makes the creative on-brand instead of generic.
        parts: list[dict] = [{"text": prompt}]
        for ref in refs or []:
            parts.append(
                {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(ref).decode()}}
            )
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                self._url,
                headers={"x-goog-api-key": self._key, "Content-Type": "application/json"},
                json={"contents": [{"parts": parts}]},
            )
            # surface Google's actual error body (which quota / why) instead of a
            # bare status — a 429 on the first call usually means the free tier
            # doesn't cover image generation (needs billing enabled = paid tier).
            if resp.status_code >= 400:
                raise RuntimeError(f"gemini image HTTP {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
        for cand in data.get("candidates", []):
            for part in cand.get("content", {}).get("parts", []):
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    return base64.b64decode(inline["data"])
        # a safety block or a text-only reply yields no image → surface it honestly
        raise RuntimeError(f"gemini image: no image in response ({str(data)[:200]})")


class OpenRouterImageEngine:
    """Nano Banana (Gemini Flash Image) via OpenRouter's Unified Image API.

    HD, renders legible headline text and understands brand context in one call —
    so a finished branded creative needs no separate text compositor — and it's
    billed on the OpenRouter credits you already fund (one bill, no new provider).
    POST /images → {data: [{b64_json}]}.
    """

    name = "openrouter/nano-banana"

    def __init__(
        self,
        api_key: str,
        model: str = "google/gemini-3.1-flash-image",
        base_url: str = "https://openrouter.ai/api/v1",
    ):
        self._key = api_key
        self._model = model
        self._url = f"{base_url.rstrip('/')}/images"

    async def generate(self, prompt: str, width: int, height: int) -> bytes:
        import base64
        from math import gcd

        g = gcd(width, height) or 1
        aspect = f"{width // g}:{height // g}"  # 1080x1080 → 1:1, 1080x1350 → 4:5
        body = {"model": self._model, "prompt": prompt[:2000], "n": 1, "aspect_ratio": aspect}
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                self._url, headers={"Authorization": f"Bearer {self._key}"}, json=body
            )
            # surface OpenRouter's actual error (402 = out of credits, 400 = bad
            # model/params) instead of a bare status
            if resp.status_code >= 400:
                raise RuntimeError(f"openrouter image HTTP {resp.status_code}: {resp.text[:400]}")
            data = resp.json()
        for item in data.get("data") or []:
            b64 = item.get("b64_json") or item.get("b64")
            if b64:
                return base64.b64decode(b64)
        raise RuntimeError(f"openrouter image: no image in response ({str(data)[:200]})")


def openrouter_image_engine(settings) -> "OpenRouterImageEngine | None":
    """The paid Nano Banana engine when OpenRouter is funded — the onboarded
    Create-Campaigns engine. None when no key (caller falls back to free FLUX)."""
    if settings.openrouter_api_key:
        return OpenRouterImageEngine(
            settings.openrouter_api_key,
            settings.openrouter_image_model,
            settings.openrouter_base_url,
        )
    return None


def to_jpeg(raw: bytes, width: int, height: int) -> bytes:
    """Normalize any image to a JPEG of exactly width x height (cover-crop)."""
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    src_w, src_h = img.size
    scale = max(width / src_w, height / src_h)
    img = img.resize((round(src_w * scale), round(src_h * scale)))
    left = (img.width - width) // 2
    top = (img.height - height) // 2
    img = img.crop((left, top, left + width, top + height))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=88)
    return out.getvalue()


def pick_engine(settings) -> "ImageEngine | None":
    """Engine by available credentials: Cloudflare free tier first, then fal.
    None = pipeline still runs; posts ship without images (graceful degrade).
    This is the autonomous PHOTO-FUNNEL path — Create Campaigns uses
    pick_campaign_engine instead (Gemini only)."""
    if settings.cf_account_id and settings.cf_api_token:
        return CloudflareImageEngine(settings.cf_account_id, settings.cf_api_token)
    if settings.fal_key:
        return FalImageEngine(settings.fal_key)
    return None


def pick_campaign_engine(settings) -> "ImageEngine":
    """Create Campaigns / Studio image engine.

    BRIDGE (until the DGX-1 GPU runs self-hosted Qwen-Image — the real, free,
    text-native destination): a free FLUX engine renders the product/background
    ONLY, then the poster compositor (creative/poster.py) bakes the headline +
    logo + brand palette on top, since FLUX can't render legible text.

    Cloudflare Workers AI FLUX (free tier) when CF creds are set; otherwise
    Pollinations FLUX (keyless, zero-setup) so campaigns always have a base image.
    Nano Banana stays available as a paid opt-in: set gemini_api_key AND
    campaign_image_engine="gemini" to switch (GeminiImageEngine, ~₹3.4/img)."""
    if settings.campaign_image_engine == "gemini" and settings.gemini_api_key:
        return GeminiImageEngine(settings.gemini_api_key, settings.gemini_image_model)
    if settings.cf_account_id and settings.cf_api_token:
        return CloudflareImageEngine(settings.cf_account_id, settings.cf_api_token)
    return PollinationsEngine()


class MediaStore(Protocol):
    async def save(self, path: str, jpeg_bytes: bytes) -> str:
        """Store bytes, return a public URL."""
        ...


class SupabaseMediaStore:
    """Public 'media' bucket on Supabase Storage (unguessable tenant paths)."""

    BUCKET = "media"

    def __init__(self, supabase_url: str, service_key: str):
        from supabase import create_client

        self._client = create_client(supabase_url, service_key)
        self._bucket_ready = False

    def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return
        try:
            self._client.storage.create_bucket(
                self.BUCKET, options={"public": True}
            )
        except Exception:  # noqa: BLE001 — already exists
            pass
        self._bucket_ready = True

    def _save_sync(self, path: str, jpeg_bytes: bytes) -> str:
        self._ensure_bucket()
        self._client.storage.from_(self.BUCKET).upload(
            path, jpeg_bytes, file_options={"content-type": "image/jpeg", "upsert": "true"}
        )
        return self._client.storage.from_(self.BUCKET).get_public_url(path)

    async def save(self, path: str, jpeg_bytes: bytes) -> str:
        return await asyncio.to_thread(self._save_sync, path, jpeg_bytes)

    def _delete_prefix_sync(self, prefix: str) -> int:
        """Delete every object under '{prefix}/' (a founder's images). For DPDP
        erasure — best-effort; returns how many objects were removed."""
        bucket = self._client.storage.from_(self.BUCKET)
        listed = bucket.list(prefix) or []
        paths = [f"{prefix}/{obj['name']}" for obj in listed if obj.get("name")]
        if paths:
            bucket.remove(paths)
        return len(paths)

    async def delete_prefix(self, prefix: str) -> int:
        return await asyncio.to_thread(self._delete_prefix_sync, prefix)
