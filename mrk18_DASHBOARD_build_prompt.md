# mrk18 — Dashboard Build Prompt (ui-ux-pro-max skill + Magic MCP → production Next.js)

Paste into Claude Code / Cursor where the **ui-ux-pro-max** skill and **@21st-dev/magic** MCP are installed.
This builds the **authenticated product dashboard** — the AI CMO app, NOT the marketing landing page. Same Next.js project, under `app/(dashboard)/`. Don't paste any API key; Magic reads it from its MCP env.

---

You are a senior product engineer + UI/UX designer. Build the **mrk18 dashboard** — the authenticated AI-CMO product — as routes inside our existing **Next.js 14 (App Router) + TypeScript + Tailwind** project, under `app/(dashboard)/`. Use both installed tools, **skill first, Magic second**:

1. **ui-ux-pro-max skill** → generate the dashboard design system.
2. **@21st-dev/magic MCP** → generate each dashboard component to that system.

## Core product principle (this drives every screen)
mrk18 is an **AI CMO**. The dashboard's job is NOT to show twenty charts — it's to deliver **a decision, in plain language, with the evidence one click away.** Every screen leads with the verdict ("here's what's working, here's what's leaking, here's your next move"), then lets the user drill into the data. Charts are proof, not the headline.

## STEP 1 — Generate & persist the dashboard design system (ui-ux-pro-max)
```
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "AI SaaS analytics dashboard, dark mode, B2B, marketing insights, decision-first" --design-system --persist -p "mrk18-dashboard" --page "dashboard"
```
Apply these overrides to the generated system (write to `design-system/pages/dashboard.md`, inheriting brand from `design-system/MASTER.md`):
- **Dark-first, designed for long sessions** (Dark Mode OLED + Data-Dense/Executive Dashboard styles from the skill). Background `#0A0A0B`, panel surfaces `#141416` / elevated `#1B1B1E`, hairline borders `rgba(255,255,255,0.07)`, text off-white `#F4F1EC`, muted `#9A958C`. Readability and contrast (≥4.5:1) beat decoration.
- **Color = status, never ornament:** brand **orange `#FF6A00`/amber `#FF9E2C`** ONLY for the primary action and the "your next move" highlight; **green `#34D399`** = healthy/result; **amber** = watch; **red `#F87171`** = leaking money / broken (used sparingly). Keep ~85% neutral charcoal so status colors pop.
- **Typography:** Sora 700/800 for headings + big numbers; Inter or Sora 400 for body; a mono (JetBrains Mono) for raw figures/tables. (Via `next/font/google`.)
- **Density:** 5–9 elements on the default view, most-important top-left, progressive disclosure for everything else (tabs / drill-down / side panel).
- Charts: use **Recharts** (or visx), dark-tuned, minimal gridlines, no chartjunk; every chart has a one-line plain-language takeaway above it.
- Run the skill's **pre-delivery checklist** before finishing.

## STEP 2 — App shell & routing
- Layout: **collapsible left sidebar** (icon+label, active state in orange), slim **top bar** (workspace switcher, search, notifications, the weekly-report bell, avatar). Main content = scrollable grid.
- Routes under `app/(dashboard)/`: `/dashboard` (Home / This Week), `/leaks`, `/channels`, `/funnel`, `/report` (weekly bitter-truth report), `/execute`, `/connections`, `/settings`. Use a route group + shared `layout.tsx`.
- Deps to add: `recharts`, `lucide-react`, `@tanstack/react-table`, `framer-motion`. Mock all data in `lib/mock/*.ts` (typed) so it runs with `npm run dev` and builds clean (`npm run build`).

## STEP 3 — Generate each screen/component with Magic MCP (pass dashboard.md tokens every call)

### A) Home — "This Week" (the decision-first hero)
- **Verdict banner** (the most important element, top): a plain-language headline like *"Your marketing is busy but leaking — fix the ads channel first."* with a confidence chip and a date range. This is "your CMO is calling," in text.
- **The one number that matters** big card: e.g. *Customers from marketing this month* with target, trend vs last period, and a good/bad color.
- **3 "Your next move" action cards** (orange-accented): each = a recommendation + the metric behind it + a "Do this" / "Mark done" button. (Advise.)
- **Leak alerts strip:** red/amber cards — "₹X/mo draining in [channel], 0 conversions" with a "See why" drill-in. (Watchdog.)
- **Activity vs Results split** mini-panel: small bars (activity, neutral) vs a flat results line (red if flat) — reuse the brand concept; one-line takeaway above.
- 4 KPI cards row: Spend, CAC, Activation, Retention — each with target + trend arrow + status color.

### B) Leaks — where money is draining
- Ranked table (TanStack Table): channel · spend · conversions · CAC · verdict (Healthy/Watch/Leaking) · "₹ wasted/mo". Sortable, status-colored rows. Each row expands to a plain-language "why" + suggested fix.

### C) Channels — performance by source
- Cards per channel with sparkline + the activity-vs-result comparison; filter by date; "is this activity or a result?" toggle that recolors metrics.

### D) Funnel — visualized as a descending funnel
- Channels → Signups → Activation → Retention, with thin red drip marks at leaky joints (reuse the brand funnel idea), each stage clickable for detail.

### E) Weekly Report — the bitter-truth report
- A readable, document-style report (not a wall of charts): "What worked", "What's leaking money", "What to do next" sections in plain language, each with one supporting mini-chart and a metric. A "Listen to the summary" / "Mark reviewed" action. Past reports list in a side rail.

### F) Execute — turn advice into action
- A simple board/checklist of recommended moves with status (To do / In progress / Done), each linked to the metric it should move; "approve & schedule" stub.

### G) Connections — data sources
- Cards for Google Ads, Meta, LinkedIn, GA4, HubSpot, Mailchimp, Stripe with Connected/Not-connected status, last-sync time, connect buttons. (Empty/disconnected states matter — design them.)

### H) Global states
- Skeleton loaders for every panel, empty states ("connect a source to see your first verdict"), error states, and an onboarding first-run overlay ("we're analyzing your marketing… your CMO will call shortly").

## STEP 4 — Interactions & polish
- KPI numbers count up on load (ease-out, respect reduced-motion); panels fade-up staggered; sidebar collapse animates; drill-down opens a right-side slide-over panel.
- Fully responsive: sidebar → bottom tab bar / drawer on mobile; tables become stacked cards; single column.
- Accessibility: focus states, keyboard nav, contrast ≥4.5:1, `aria` on charts (text alternative = the takeaway line).
- Run the ui-ux-pro-max **pre-delivery checklist** and fix every failing item. `npm run build` passes, no console errors.
- Output: the run commands, a component map, and a "what's mocked vs what needs the real API" note.

Begin with STEP 1: generate and persist the dashboard design system (inheriting the brand MASTER.md), then proceed.

---

*Consistency note: the dashboard shares the brand (black + orange, Sora) with the landing page via `design-system/MASTER.md`, but follows dashboard rules — decision-first, dark-tuned charts, status-only color, progressive disclosure. Swap mock data for the real mrk18 API before launch.*
