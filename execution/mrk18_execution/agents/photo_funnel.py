"""Photo Funnel Agent (Layer 4) — image prompt → rendered preview → storage.

The thinking half (the image PROMPT) is written by the Content Agent (a text
job — the Brain's territory). This module is the execution half: render via
the configured engine, normalize to JPEG (Instagram's hard rule), store in
the public media bucket, and attach a MediaSpec (URL only — blobs never
travel in state).
"""

from ..llm.images import ImageEngine, MediaStore, to_jpeg
from ..schemas.content import ContentItem, MediaSpec
from ..security.manifests import require_permission

AGENT = "agent:photo_funnel"

IMAGE_SIZE = (1080, 1080)  # native square; link-card crops come later


async def render_media(
    engine: ImageEngine,
    store: MediaStore,
    item: ContentItem,
    founder_id: str,
) -> MediaSpec:
    require_permission(AGENT, "images:generate")  # Slice 2.3 — sandbox
    width, height = IMAGE_SIZE
    raw = await engine.generate(item.image_prompt or "abstract brand banner", width, height)
    jpeg = to_jpeg(raw, width, height)
    path = f"{founder_id}/{item.item_id}.jpg"
    require_permission(AGENT, "storage:write")
    url = await store.save(path, jpeg)
    return MediaSpec(
        url=url,
        mime="image/jpeg",
        width=width,
        height=height,
        size_bytes=len(jpeg),
        alt_text=(item.image_prompt or "")[:300],
    )
