"""Poster compositor — bakes a headline, brand palette, CTA and logo onto a base
image to produce a finished social creative (default IG story 1080x1350).

The campaign image engine (FLUX bridge) renders the product/background ONLY;
this layer adds everything FLUX can't render legibly. Pure Pillow, deterministic,
₹0. Retired once the DGX-1 serves Qwen-Image (native text) — the campaign flow
then skips compose_poster and uses the raw engine output.
"""

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

_FONT_PATH = Path(__file__).parent / "fonts" / "Anton-Regular.ttf"
# System fallbacks if the bundled font is somehow missing (kept working, never crash).
_FALLBACK_FONTS = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
)
_DEFAULT_PALETTE = ["#b4532a", "#1c1a17", "#ede7da"]  # mrk18 molten / ink / cream


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = (value or "").strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6:
        return (180, 83, 42)
    try:
        return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16))
    except ValueError:
        return (180, 83, 42)


def _luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = (c / 255 for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _on_color(bg: tuple[int, int, int]) -> tuple[int, int, int]:
    """Readable text colour for a given background: near-black on light, white on dark."""
    return (26, 24, 23) if _luminance(bg) > 0.55 else (255, 255, 255)


def _pick_accent(palette: list[str]) -> tuple[int, int, int]:
    """The CTA/accent colour: the most saturated, mid-dark brand colour (skip near
    white/black so the pill actually reads as 'brand', not a neutral)."""
    best, best_score = None, -1.0
    for hexv in palette or []:
        rgb = _hex_to_rgb(hexv)
        lum = _luminance(rgb)
        if lum > 0.9 or lum < 0.06:  # skip paper-white / pure-black
            continue
        sat = (max(rgb) - min(rgb)) / 255
        score = sat + (0.35 - abs(lum - 0.4))  # prefer saturated, mid-dark
        if score > best_score:
            best, best_score = rgb, score
    return best or _hex_to_rgb(_DEFAULT_PALETTE[0])


def _font(size: int) -> ImageFont.FreeTypeFont:
    for path in (_FONT_PATH, *[Path(p) for p in _FALLBACK_FONTS]):
        if Path(path).exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    return ImageFont.load_default()


def _cover_crop(img: Image.Image, width: int, height: int) -> Image.Image:
    src_w, src_h = img.size
    scale = max(width / src_w, height / src_h)
    img = img.resize((round(src_w * scale), round(src_h * scale)))
    left = (img.width - width) // 2
    top = (img.height - height) // 2
    return img.crop((left, top, left + width, top + height))


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    lines: list[str] = []
    for para in text.split("\n"):
        words, line = para.split(), ""
        for w in words:
            trial = f"{line} {w}".strip()
            if draw.textlength(trial, font=font) <= max_w or not line:
                line = trial
            else:
                lines.append(line)
                line = w
        lines.append(line)
    return lines


def _fit_headline(
    draw: ImageDraw.ImageDraw, text: str, max_w: int, max_h: int, start: int
) -> tuple[ImageFont.FreeTypeFont, list[str], int]:
    """Largest font size at which the wrapped headline fits the text box."""
    size = start
    while size >= 28:
        font = _font(size)
        lines = _wrap(draw, text, font, max_w)
        line_h = int(size * 1.06)
        if max(draw.textlength(ln, font=font) for ln in lines) <= max_w and line_h * len(lines) <= max_h:
            return font, lines, line_h
        size -= 4
    font = _font(28)
    return font, _wrap(draw, text, font, max_w), int(28 * 1.06)


def compose_poster(
    base_jpeg: bytes,
    headline: str,
    *,
    width: int = 1080,
    height: int = 1350,
    palette: list[str] | None = None,
    logo_png: bytes | None = None,
    cta: str | None = None,
    brand_name: str | None = None,
) -> bytes:
    """Return a finished JPEG poster: base image + bottom gradient + headline +
    optional CTA pill + brand name/logo. All brand colours come from `palette`."""
    palette = [p for p in (palette or []) if p] or _DEFAULT_PALETTE
    accent = _pick_accent(palette)
    on_accent = _on_color(accent)

    img = _cover_crop(Image.open(io.BytesIO(base_jpeg)).convert("RGB"), width, height).convert("RGBA")

    # bottom-up dark gradient so headline text stays legible over any image
    scrim = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(scrim)
    top = int(height * 0.42)
    for y in range(top, height):
        a = int(225 * ((y - top) / (height - top)) ** 1.15)
        sdraw.line([(0, y), (width, y)], fill=(10, 10, 12, a))
    img = Image.alpha_composite(img, scrim)
    draw = ImageDraw.Draw(img)

    pad = int(width * 0.075)
    box_w = width - 2 * pad

    # CTA pill (bottom) — drawn first so we know how much vertical room the headline has
    cta_bottom = height - pad
    if cta:
        cta = cta.strip().upper()[:22]
        cf = _font(int(width * 0.033))
        tw = draw.textlength(cta, font=cf)
        pill_h = int(width * 0.072)
        pill_w = int(tw + pill_h * 1.1)
        py = height - pad - pill_h
        draw.rounded_rectangle([pad, py, pad + pill_w, py + pill_h], radius=pill_h // 2, fill=accent)
        _, ty0, _, ty1 = cf.getbbox(cta)
        draw.text((pad + (pill_w - tw) / 2, py + (pill_h - (ty1 - ty0)) / 2 - ty0), cta, font=cf, fill=on_accent)
        cta_bottom = py - int(height * 0.03)

    # headline — uppercase, sits just above the CTA
    head = (headline or "").strip().upper()
    hb_top = int(height * 0.46)
    font, lines, line_h = _fit_headline(draw, head, box_w, cta_bottom - hb_top, int(width * 0.115))
    y = cta_bottom - line_h * len(lines)
    for ln in lines:
        draw.text((pad + 2, y + 2), ln, font=font, fill=(0, 0, 0))  # soft shadow
        draw.text((pad, y), ln, font=font, fill=(255, 255, 255))
        y += line_h

    # brand mark (top-left): real logo if given, else the brand name in caps
    if logo_png:
        try:
            logo = Image.open(io.BytesIO(logo_png)).convert("RGBA")
            lh = int(height * 0.055)
            logo = logo.resize((round(logo.width * lh / logo.height), lh))
            img.alpha_composite(logo, (pad, pad))
        except Exception:  # noqa: BLE001 — a bad logo must never break the poster
            logo_png = None
    if not logo_png and brand_name:
        bf = _font(int(width * 0.04))
        draw.text((pad + 1, pad + 1), brand_name.upper()[:24], font=bf, fill=(0, 0, 0))
        draw.text((pad, pad), brand_name.upper()[:24], font=bf, fill=(255, 255, 255))

    out = io.BytesIO()
    img.convert("RGB").save(out, format="JPEG", quality=90)
    return out.getvalue()
