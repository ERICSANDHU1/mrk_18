"""Brandfetch Brand API — the REAL brand kit (logo, colours, fonts) for a domain.

The Studio Business DNA uses this so the visual brand assets are pulled from the
ACTUAL brand, not invented by the LLM. Free developer tier (100 requests, no
card, no attribution); we cache DNA per domain so that's 100 unique brands.
Every failure degrades to None → the DNA simply ships without a kit, never breaks.
"""

import logging

import httpx

log = logging.getLogger("mrk18.brandfetch")

_ENDPOINT = "https://api.brandfetch.io/v2/brands/"


async def fetch_brand_kit(domain: str, api_key: str, *, timeout: float = 12.0) -> dict | None:
    """Return {logo_url, colors[], heading_font, body_font, name, description} for
    the domain, or None (no key / not found / any error). Never raises."""
    if not api_key or not domain:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                f"{_ENDPOINT}{domain}",
                headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
            )
        if resp.status_code != 200:
            log.info("brandfetch: %s -> HTTP %s", domain, resp.status_code)
            return None
        data = resp.json()
    except Exception as exc:  # noqa: BLE001 — the kit is a bonus, never a blocker
        log.warning("brandfetch: %s failed: %s", domain, exc)
        return None

    # logo — prefer a full logo, then icon/symbol; pick a rasterisable src
    logo_url = ""
    order = {"logo": 0, "icon": 1, "symbol": 2}
    for lg in sorted(data.get("logos") or [], key=lambda l: order.get(l.get("type"), 9)):
        for fmt in lg.get("formats") or []:
            src = fmt.get("src")
            if src:
                logo_url = src
                break
        if logo_url:
            break

    # colours — real palette; keep brand/accent-ish first, cap at 5
    colors: list[str] = []
    for c in data.get("colors") or []:
        hexv = str(c.get("hex") or "").strip()
        if hexv.startswith("#") and len(hexv) == 7 and hexv not in colors:
            colors.append(hexv)

    # fonts — title -> heading, body -> body
    heading = body = ""
    for f in data.get("fonts") or []:
        name = str(f.get("name") or "").strip()
        if not name:
            continue
        if f.get("type") == "title" and not heading:
            heading = name
        elif f.get("type") == "body" and not body:
            body = name
    if not body and heading:
        body = heading

    return {
        "logo_url": logo_url,
        "colors": colors[:5],
        "heading_font": heading,
        "body_font": body,
        "name": str(data.get("name") or "").strip(),
        "description": str(data.get("description") or "").strip(),
    }
