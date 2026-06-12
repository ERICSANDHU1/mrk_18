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
    """Free keyless image API (FLUX-based). Pilot default; swap out any day."""

    name = "pollinations/flux"

    async def generate(self, prompt: str, width: int, height: int) -> bytes:
        url = (
            f"https://image.pollinations.ai/prompt/{quote(prompt[:800])}"
            f"?width={width}&height={height}&model=flux&nologo=true"
        )
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.get(url, follow_redirects=True)
            resp.raise_for_status()
            return resp.content


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
    None = pipeline still runs; posts ship without images (graceful degrade)."""
    if settings.cf_account_id and settings.cf_api_token:
        return CloudflareImageEngine(settings.cf_account_id, settings.cf_api_token)
    if settings.fal_key:
        return FalImageEngine(settings.fal_key)
    return None


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
