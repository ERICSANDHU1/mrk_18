"""Smoke test for the Create Campaigns image pipeline (B1 bridge).

Runs the WHOLE B1 path end to end — FLUX base image + poster compositor — and
needs NO API key: it defaults to the keyless Pollinations engine, so you can
judge the finished-creative quality right now.

    python -m scripts.campaign_smoke

Writes campaign_smoke_out.jpg where you run it. This is what a free Create
Campaigns creative looks like today; the DGX-1 Qwen-Image swap only raises the
base-image quality later — the brand overlay stays the same.
"""

import asyncio
from pathlib import Path

from mrk18_execution.config import get_settings
from mrk18_execution.creative.poster import compose_poster
from mrk18_execution.llm.images import pick_campaign_engine, to_jpeg

# FLUX renders the PRODUCT/BACKGROUND only — no text (the compositor bakes text).
BASE_PROMPT = (
    "A warm, appetizing bowl of protein pasta on a rustic wooden table, soft natural "
    "window light, fresh basil, editorial food photography, shallow depth of field, "
    "premium D2C brand mood. No text, no words, no letters, no logo, no watermark."
)

# What the ad_copy adapter would return (headline + brand + CTA) — baked on by us.
HEADLINE = "More protein.\nSame pasta night."
BRAND = "Nourish"
CTA = "Shop the swap"
PALETTE = ["#3B6D11", "#D85A30", "#EFE7D6", "#1C1A17"]  # from the brand's Business DNA


async def main() -> None:
    settings = get_settings()
    engine = pick_campaign_engine(settings)
    print(f"engine: {engine.name} - rendering base image (no key needed for Pollinations)...")
    raw = await engine.generate(BASE_PROMPT, 1080, 1350)
    base = to_jpeg(raw, 1080, 1350)

    print("compositing headline + palette + brand...")
    poster = compose_poster(
        base, HEADLINE, width=1080, height=1350, palette=PALETTE, cta=CTA, brand_name=BRAND
    )
    out = Path("campaign_smoke_out.jpg")
    out.write_bytes(poster)
    print(f"wrote {out.resolve()} ({len(poster) // 1024} KB) - open it to judge the B1 look.")


if __name__ == "__main__":
    asyncio.run(main())
