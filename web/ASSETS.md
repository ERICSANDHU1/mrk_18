# MRK18 Film — Asset Inventory

The code + rendering pipelines are built; **you supply the art**. Until a real asset is
dropped, a clearly-labelled procedural placeholder renders in its place (correct
dimensions / anchor), so every scene runs and reverses today. Drop the file at the
listed path and it appears with no code change.

Palette is locked (§1.2): bg `#0A0A0B` · charcoal `#141416` · off-white `#F4F1EC` ·
muted `#9A958C` · molten `#FF6A00` → amber `#FF9E2C` → ember `#E0490E` · gold `#F2C879`.

## Needed now (F02 + F03 milestone)

| Slot | Path | Spec | Status |
|---|---|---|---|
| **Skyline backdrop** | `web/public/film/skyline.png` | The wide hand-drawn line-art skyline you sent. ~2048×768, **transparent above the rooflines** (sky shows the film bg through it). Warm off-white `#F4F1EC` / muted `#9A958C` outline strokes on charcoal masses; sparing molten→amber accents only. Tiles/scrolls horizontally, so keep the left & right edges able to wrap. | ⏳ placeholder rendering — **auto-swaps in on drop** (F03 tries to load it on mount) |

## Character — flat 2D suited silhouette (M1)

The character is a **side-profile suited-businessman silhouette**, read entirely by the
outline of the suit (lapel, jacket hem, trouser break, dress-shoe profile) — no face, no
interior detail. It is driven by pose refs (`rise` / `walk` / `reach` / `opacity`) in
[`components/film/Silhouette.tsx`](components/film/Silhouette.tsx). It currently renders as
a **procedural puppet placeholder** — now **PURE FLAT BLACK** (`#000000`), no face, no
seams, no interior detail, suit read by contour only — posed to track the founder's
**8-pose reference** (emergence: reclined-arm-up → hauling forward on both arms → kneeling
crouch → stand; walk-cycle; reach-to-pocket). It animates + scrubs smoothly *now*; a
procedural puppet approximates the reference but is not pixel-identical to cropped art.

For **pixel-exact fidelity**, crop the 8 reference poses into transparent PNGs and swap
**only** the renderer inside `Silhouette.tsx` (F02/F03 never change — they only drive the
pose refs). Two options:

- **Sprite sheet (recommended for the walk):** a horizontal strip of walk-cycle frames
  (`web/public/film/char/walk.png`, transparent, side-profile facing **right**, pure black,
  feet on a consistent baseline, ~8–12 frames). UV-offset the plane by
  `floor(walkPhase / 2π × frames)`, cross-fading adjacent frames to avoid popping.
- **Key-pose frames (recommended for the emergence):** 4 transparent PNGs for the
  rise — `char/rise_0_emergence.png` (reclined, near arm up), `rise_1_haul.png` (pitched
  forward, both arms hauling), `rise_2_crouch.png` (front knee up, back knee down),
  `rise_3_stand.png` (standing). Plus the phone beat `char/reach.png` (hand to pocket).
  Blend by `rise`, exactly like the placeholder keys (same indices).

All character art must be **side-profile, facing right, flat solid silhouette, transparent
background**, with feet on a consistent baseline and headroom for the raised-arm
breakthrough pose. Suggested frame size 320×560 (the placeholder's working size).

## Slots for later phases (per master spec §3)

| ID | Asset | Path (proposed) | Used in |
|---|---|---|---|
| M3 | Building kit (real variants + 1 MRK18 billboard) — currently instanced boxes | `web/public/film/buildings/` | F3, F10 |
| M4 | Phone prop / emissive screen | — | F4 |
| M8 | Platform logo tiles ×7 (official brand-kit glyphs) | `web/public/film/logos/` | F7, F8 |
| M9 | MRK18 flame glyph (3D + SVG) | `web/public/film/glyph.*` | F4, F12, navbar |
| TEX | Brief print texture (both faces) — currently canvas-drawn | `web/public/film/brief.png` | F1, F2, F12 |
