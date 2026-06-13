# mrk18 — FINAL Build Prompt (UI-UX-Pro-Max skill + Magic MCP → production Next.js)

Paste this into Claude Code (or Cursor) where the **ui-ux-pro-max** skill and the **@21st-dev/magic** MCP are installed.
Do not paste any API key — Magic reads it from its MCP env. (Rotate the key you shared earlier; it's now in chat history.)

---

You are a senior product engineer + UI/UX designer. Build a **production-ready landing page for mrk18** as a **Next.js 14 (App Router) + TypeScript + Tailwind** project. You have two capabilities installed — use both, in this order:

1. **ui-ux-pro-max skill** → for the design system (the brain: pattern, style, colors, typography, effects, anti-patterns, pre-delivery checklist).
2. **@21st-dev/magic MCP** → for generating polished, animated React/Tailwind UI components (the hands).

## STEP 1 — Generate & persist the design system (ui-ux-pro-max)
Run the skill's design-system generator for our exact product, persist it, and treat it as the source of truth:

```
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "AI SaaS marketing tool, premium luxury, dark mode, black and orange, founders" --design-system --persist -p "mrk18"
```

- Product type to match: **AI/Chatbot Platform / Micro-SaaS / B2B Service** (AI CMO for founders).
- **Override the generated palette** to our brand (we are black + orange, NOT the skill's default AI purple/pink — explicitly avoid that anti-pattern):
  - Background near-black `#0A0A0B`, charcoal surfaces `#141416`, text warm off-white `#F4F1EC`, muted `#9A958C`.
  - Accent = **gradients only**: molten `#FF6A00` → amber `#FF9E2C` → ember `#E0490E`, sparing gold `#F2C879`. ~90% of the page stays black/charcoal so orange reads expensive.
- Style direction: pull from the skill's **Liquid Glass / Glassmorphism + Dark Mode (OLED) + Motion-Driven + Hero-Centric** styles. Luxury = restraint.
- Typography: **Sora** (800 headings, tight tracking; 300 body) via `next/font/google`.
- Write the result to `design-system/MASTER.md` and reference it for every component. Run the skill's **pre-delivery checklist** before finishing (contrast ≥ 4.5:1, focus states, hover transitions 150–300ms, `prefers-reduced-motion`, responsive at 375/768/1024/1440, SVG icons not emojis).

## STEP 2 — Scaffold the Next.js project
- `npx create-next-app` style structure: App Router, TypeScript, Tailwind, ESLint. Deps: `framer-motion`, `lenis`, `@react-three/fiber`, `@react-three/drei`, `three`.
- Files: `app/layout.tsx` (SEO metadata, Sora font), `app/page.tsx` (composes sections), `app/globals.css`, `tailwind.config.ts` (brand tokens from MASTER.md), one component per section in `components/`.
- Must run with `npm install && npm run dev` and build clean with `npm run build`. Deployable to Vercel.

## STEP 3 — Generate each UI component with Magic MCP
For every section below, **call the Magic MCP** to generate the component, passing the MASTER.md design tokens (black/charcoal + orange gradients, Sora, glassmorphism, the listed effects) in the request so output is on-brand. Then wire components into `app/page.tsx`. Refine any Magic output to match MASTER.md exactly (don't accept default colors).

Global elements (Magic): preloader (gradient 0→100 + theatre-curtain split), frosted-glass navbar (appears after intro, blur+shadow on scroll), custom cursor (dot+ring, disabled on touch), scroll-progress bar (gradient), fixed R3F 3D background (8 glossy amber/ember/bronze/gold shapes, studio lighting, camera lerp to pointer + scroll drift, ~260 warm dust particles, lazy `dynamic {ssr:false}`, render nothing if no WebGL, respect reduced-motion), tilted gradient marquees (~1.2°, ◆ separators, pause on hover).

### Sections & exact copy (use verbatim)

**Hero** — eyebrow `AI CMO · BUILT FOR FOUNDERS`; wordmark 2 lines: `mrk18` (white) / `your AI CMO` (gradient, letter-by-letter rise reveal); value prop: "The marketing brain founders can't afford to hire — yet. mrk18 reads your real numbers, flags what's **leaking money**, and hands you the next move in plain language." CTAs: **Join the waitlist** (primary, magnetic + sheen) + **See how it works** (ghost). 4 stats with gradient left-borders: `90%` "work below the dashboard" · `1` "decision a week, plain language" · `0` "marketing hires to start" · `24/7` "watching working vs leaking". Giant outlined "mrk18" watermark with scroll parallax.

**Problem (01)** — heading "Your dashboard is *green*. Your bank account isn't." (italic = gradient). Insight glass card: "Most founders don't have a marketing problem — they have a measurement problem. Activity is easy to grow. Revenue was always the only point." 4-cell counter band: `11/11` "founders: green metrics, flat revenue" · `27 hrs` "/week lost to marketing they shouldn't touch" · `2` "avg customers their green campaigns drove" · `1` "honest second opinion missing".

**How it works** — 3 sticky/stacking glass cards: `01 ADVISE` "Tells you what to do next — and what to stop." (pills: ICP · positioning · channels) · `02 WATCHDOG` "Watches weekly, flags what's leaking money before it's a crisis." (spend · CAC · activation · retention) · `03 EXECUTE` "Helps run the work, so advice ships — not another report." (copy · creative · scheduling · approvals).

**Features** — 4 tilt cards (cursor-tracking orange glow): `01 Reads your real numbers` (GA4 · ad platforms · CRM · email) · `02 Tells the bitter truth` (weekly · honest · actionable) · `03 A decision, not a chart` (1 move/week · plain English) · `04 Built India-first` (solo-founder · budget-aware). Integrations marquee: Google Ads · Meta · LinkedIn · GA4 · HubSpot · Mailchimp · Stripe · Notion.

**Proof** — 3 cards, gradient ◆ icons, labelled "early access": "Finally a tool that tells me what to *do*, not just what happened." / "Caught ₹40k/month leaking into a channel that never converted." / "The marketing co-founder I couldn't afford to hire."

**Pricing / Waitlist** — rows that slide right on hover: `Founding 50` "Early access · founder pricing locked" → Apply · `Early access` "Join the waitlist · first to onboard" → Free · `Launch` "Full AI CMO: advise + watchdog + execute" → Coming soon.

**Contact** — giant outlined **JOIN THE WAITLIST** (fills gradient L→R on hover); 3 cards: `hello@mrk18.com` · LinkedIn `mrk18` · X `@mrk18`; green pulsing "now onboarding founders" badge.

**Footer** — `mrk18` (gradient) · "your AI CMO" · © 2026.

## STEP 4 — Polish & verify
- All counters animate from 0 (ease-out, in view); section reveals fade-up + blur-to-sharp; marquees infinite + pause on hover.
- Logo: place black+orange logo at `/public/logo.svg`, use via `next/image`.
- Run the ui-ux-pro-max **pre-delivery checklist** and fix every failing item.
- Mobile-first: single column on mobile, cursor disabled on touch, 3D downgraded gracefully.
- SEO: title `mrk18 — your AI CMO`, description = the value prop, OG image, `lang="en"`.
- No console errors; `npm run build` passes. Output the run commands and a short "what I built + what to swap before launch" note (real waitlist URL, real testimonials).

Begin with STEP 1 now: generate and persist the design system, then proceed through the steps.

---

*Order matters: skill first (decides the look), Magic second (builds the components to that look), then you reconcile Magic's output against MASTER.md. Swap mrk18.com URLs + placeholder quotes before launch.*
