# mrk18 — Dashboard Design System (`/dashboard` product surface)

Inherits brand from [`../MASTER.md`](../MASTER.md) (black + orange, Sora, luxury restraint).
Overridden for the authenticated product per founder spec: **Dark Mode OLED + Data-Dense / Executive Dashboard** patterns, decision-first.
Every dashboard component must match this file. Magic MCP output gets reconciled against it — never accept default colors.

> Note: authored manually from the founder override spec (ui-ux-pro-max skill not installed in this environment); inherits the skill-generated brand MASTER.md.

## Core principle — decision-first

mrk18 is an AI CMO. The dashboard delivers a **decision in plain language, with the evidence one click away** — not twenty charts.
Every screen leads with the verdict ("what's working, what's leaking, your next move"), then drills into data.
**Charts are proof, not the headline.** Every chart carries a one-line plain-language takeaway above it.

## Surfaces & color (status, never ornament)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0A0B` | App background (OLED near-black) |
| `--surface` | `#141416` | Panel surfaces |
| `--surface-2` | `#1B1B1E` | Elevated panels / hover / slide-over |
| `--stroke-hard` | `rgba(255,255,255,0.07)` | Hairline panel borders |
| `--ink` | `#F4F1EC` | Primary text (≈17:1 on bg) |
| `--muted` | `#9A958C` | Secondary text (≈6.4:1 on bg) |
| `--molten` `#FF6A00` / `--amber` `#FF9E2C` | brand | **ONLY** the primary action + "your next move" highlight |
| `--good` | `#34D399` | Healthy / a real result |
| `--watch` | `#FF9E2C` | Watch / drifting |
| `--bad` | `#F87171` | Leaking money / broken (sparingly) |

- ~85% of every viewport stays neutral charcoal so status colors pop. No flat orange blocks, no purple/pink.
- Status colors appear at low-alpha fills (`/10`–`/15`) with full-strength text/icon; never large solid fills.
- Long-session dark: no pure white, no high-glare gradients; glass/blur reserved for overlays (slide-over, onboarding) — panels are solid `--surface` for readability.

## Typography

- **Sora 700/800** — headings, verdicts, big numbers (tight tracking `-0.02em`/`-0.03em`).
- **Sora 400** — body/UI copy (brand consistency over adding Inter; one variable font already loaded).
- **JetBrains Mono 400/600** (`--font-mono`, via `next/font/google`) — raw figures, table numerics, KPI values, code-ish IDs.
- Labels/eyebrows: 11–12px uppercase, `letter-spacing .14em–.18em`, `--muted`.
- Minimum body text 13px; takeaway lines 14px.

## Density & layout

- **5–9 elements on the default view.** Most important top-left: the verdict banner spans full width at top, the one-number-that-matters card sits top-left below it.
- Progressive disclosure for everything else: tabs, expandable rows, right-side **slide-over** drill-downs (480px, `--surface-2`, glass backdrop).
- Grid: 12-col, `gap-4/5`; panels `rounded-2xl border border-stroke-hard bg-surface p-5`.
- Sidebar 248px expanded / 64px collapsed (icon+label, active = orange gradient text + orange left rail); top bar 56px slim.
- Mobile: sidebar → bottom tab bar (5 core routes) + sheet for the rest; tables → stacked cards; single column.

## Charts (Recharts, dark-tuned)

- Minimal gridlines (`rgba(255,255,255,0.05)`, dashed, horizontal only), no chartjunk, no legends when one series.
- Axis text 11px `--muted`; tooltips on `--surface-2` with hairline border.
- Activity series = neutral (`#9A958C`/40%); Results series = status color. The activity-vs-results contrast is a brand concept — activity bars stay grey, the flat results line goes red.
- **Every chart: one-line takeaway above it** (14px, `--ink`), chart `aria-label` = the takeaway text + `role="img"`.
- Count-up numbers on load (ease-out ~1.2s), respect `prefers-reduced-motion`.

## Voice

Blunt operator, plain language, Indian founder context (₹, lakh where natural). Verdicts are sentences, not metrics: "Your marketing is busy but leaking — fix the ads channel first." Confidence shown as a chip (High/Medium/Low), date range always visible.

## Status verdicts vocabulary

`Healthy` (good) · `Watch` (watch) · `Leaking` (bad). Money leaks always quantified: "₹42,000/mo draining in Google Ads, 0 conversions."

## Motion

- Panels: fade-up stagger (60–90ms apart, 500–600ms, `cubic-bezier(0.22,1,0.36,1)`).
- KPI numbers count up ease-out; sidebar collapse 300ms; slide-over 360ms ease-out; hovers 150–300ms.
- All motion gated on `prefers-reduced-motion` (global CSS kill-switch already in `globals.css` + `useReducedMotion` for JS counters).

## States (designed, not afterthoughts)

- **Skeleton**: shimmer blocks on `--surface` matching final layout per panel (`loading.tsx` per route).
- **Empty**: "Connect a source to see your first verdict" + connect CTA → `/connections`.
- **Error**: panel-level retry affordance, plain-language failure copy.
- **First-run onboarding overlay**: glass scrim — "we're analyzing your marketing… your CMO will call shortly."

## Pre-delivery checklist (dashboard)

- [ ] Verdict/takeaway line present on every screen & above every chart
- [ ] Orange used only for primary action + next-move highlight; status = green/amber/red only
- [ ] ≤9 elements default view, drill-downs for the rest
- [ ] Text contrast ≥4.5:1 everywhere (muted `#9A958C` on `#141416` ≈ 5.6:1 ✓)
- [ ] Keyboard focus visible on all interactive elements; charts have text alternatives
- [ ] `prefers-reduced-motion` respected (counters, staggers, slide-over)
- [ ] Responsive 375 / 768 / 1024 / 1440 — bottom tab bar on mobile, stacked-card tables
- [ ] Skeleton + empty + error states for every panel
- [ ] No emojis as icons (Lucide SVG only); mono font for raw figures
- [ ] `npm run build` clean, zero console errors
