# mrk18 — Design System MASTER (Source of Truth)

Generated via ui-ux-pro-max (`--design-system --persist -p "mrk18"`), then **brand-overridden** per founder spec.
Every component must match this file. Magic MCP output gets reconciled against it — never accept default colors.

## Product
AI CMO for founders (AI SaaS / Micro-SaaS / B2B). Premium, luxury, dark. Voice: blunt operator — "the marketing brain founders can't afford to hire — yet."

## Pattern (from skill)
**Storytelling + Feature-Rich.** CTA above the fold.
Section order: Preloader → Nav → Hero → Problem (01) → How it works → Features (+ integrations marquee) → Proof → Pricing/Waitlist → Contact → Footer.

## Style (from skill)
**Liquid Glass + Dark Mode (OLED) + Motion-Driven + Hero-Centric.**
Flowing glass, dynamic blur (`backdrop-filter`), fluid 400–600ms curves, morphing accents.
**Luxury = restraint:** ~90% of every viewport stays black/charcoal so orange reads expensive.

## Colors (BRAND OVERRIDE — not the skill's gold/purple defaults)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0A0B` | Page background (near-black) |
| `--surface` | `#141416` | Charcoal cards/surfaces |
| `--surface-2` | `#1B1B1E` | Elevated charcoal |
| `--ink` | `#F4F1EC` | Warm off-white text |
| `--muted` | `#9A958C` | Secondary text |
| `--molten` | `#FF6A00` | Gradient stop 1 |
| `--amber` | `#FF9E2C` | Gradient stop 2 |
| `--ember` | `#E0490E` | Gradient stop 3 |
| `--gold` | `#F2C879` | Sparing gold highlights |
| `--stroke` | `rgba(244,241,236,.08)` | Hairline borders |

**Accent = gradients only:** `linear-gradient(120deg, #FF6A00, #FF9E2C 55%, #E0490E)`. Never flat orange fills on large areas. NO purple/pink (explicit anti-pattern for AI products).

## Typography
**Sora** via `next/font/google` (variable `--font-sora`).
- Headings: 800, tight tracking (`-0.03em`), `clamp()` scales.
- Body: 300, `--muted` for secondary copy.
- Labels/eyebrows: 11–12px, uppercase, `letter-spacing: .18em`.

## Key Effects
- Glass: `background: rgba(20,20,22,.55); backdrop-filter: blur(18px); border: 1px solid var(--stroke)`.
- Gradient text: `.text-gradient` (background-clip).
- Counters animate 0→target ease-out when in view.
- Reveals: fade-up + blur-to-sharp.
- Tilt cards: cursor-tracking rotate + orange radial glow at cursor.
- Magnetic primary CTA + sheen sweep.
- Tilted (~1.2°) gradient marquees, `◆` separators, pause on hover.
- Fixed R3F 3D background: 8 glossy amber/ember/bronze/gold shapes, studio-style lighting, camera lerp to pointer + scroll drift, ~260 warm dust particles. `dynamic({ ssr:false })`, render nothing without WebGL, static under reduced-motion.

## Avoid (anti-patterns)
Cheap visuals · fast/snappy animations (<150ms) · flat orange blocks · purple/pink AI clichés · emojis as icons (SVG only: Lucide/Heroicons style) · fake metrics presented as real (label proof "early access").

## Pre-delivery checklist
- [ ] No emojis as icons (inline SVG)
- [ ] cursor states on all clickables (custom cursor ring scales)
- [ ] Hover transitions 150–300ms
- [ ] Text contrast ≥ 4.5:1 (`#F4F1EC` on `#0A0A0B` ≈ 17:1; `#9A958C` on `#0A0A0B` ≈ 6.4:1 ✓)
- [ ] Visible keyboard focus states
- [ ] `prefers-reduced-motion` respected (kills marquees, 3D drift, preloader count)
- [ ] Responsive: 375 / 768 / 1024 / 1440
- [ ] Single column mobile, cursor disabled on touch, 3D degrades gracefully
