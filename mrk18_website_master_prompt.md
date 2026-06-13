# mrk18 — Next.js Landing Page Master Prompt (filled)

Paste everything below into any AI coding assistant. Replace only the two TODOs (logo file + any real metrics you want to swap).

---

Build a **premium, animated startup landing page for mrk18** as a **Next.js 14 (App Router) + TypeScript** project. Production-ready, deployable to Vercel. Follow this exact stack, design system, content, and feature list.

## Stack & setup
- Next.js 14 App Router, TypeScript, **Tailwind CSS**. `app/page.tsx` composes section components from `components/`.
- 3D via **@react-three/fiber + @react-three/drei + three**; all 3D/interactive parts are Client Components (`"use client"`).
- **Framer Motion** for reveals/counters/marquees; **lenis** for smooth scroll.
- **Sora** via `next/font/google` (weights 300 + 800), system fallback.
- Logo/images in `/public`, used via `next/image`. (TODO: drop the mrk18 black+orange logo at `/public/logo.svg`.)
- Deliver: `package.json`, `tailwind.config.ts` (custom colors + Sora), `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, one file per section component. Must run with `npm install && npm run dev`.

## Brand & positioning
- Product: **mrk18 — an AI CMO for early-stage founders.**
- One-liner value prop: **"It watches your marketing, tells you the bitter truth about what's working vs leaking money, then helps you execute — for founders running marketing without a marketing team."**
- Primary CTA: **Join the waitlist** → `https://mrk18.com/waitlist` (placeholder). Secondary CTA: **See how it works** (scrolls to How-it-works).

## Design system (tokens in tailwind.config.ts)
- **Dark luxury.** Background near-black `#0A0A0B` (faint warm tint); surfaces deep charcoal `#141416` glass; text warm off-white `#F4F1EC`, muted grey `#9A958C`. Soft radial **amber/burnt-orange** gradient washes in page corners over black.
- **Accent = gradients only** (never flat): molten `#FF6A00` → amber `#FF9E2C` → ember `#E0490E`, sparing gold `#F2C879`. Apply to: second line of the wordmark, heading highlight words, stat numbers, marquees, buttons, hover fills, scroll-progress bar. Keep ~90% of the page black/charcoal so orange reads expensive.
- **Glassmorphism as accent:** major cards = `backdrop-blur-[18px]`, `bg-white/[0.04]`, `border border-white/[0.08]`, layered shadow, 22px radius, a 5px orange→amber gradient top bar, subtle inner top highlight.
- **Type:** Sora 800 + `tracking-[-0.04em]` for headings/wordmark; 300 for body; small labels uppercase `tracking-[0.3em]` muted.

## 3D motion (R3F)
- Fixed full-screen `<Canvas>` behind content. **8 glossy soft-shaded shapes** (torus, icosahedron, torus knot, varied spheres, octahedron) in dark amber/ember/bronze/gold — `meshStandardMaterial roughness≈0.2 metalness≈0.3`. No wireframes.
- Studio lighting on near-black: low ambient + warm orange key + amber & gold point lights + rim light.
- Shapes rotate/float on sine curves (different phases) via `useFrame`. Camera lerps (heavily smoothed) toward pointer, drifts down on scroll. ~260 warm dust particles (`<Points>`). Lazy-load Canvas with `next/dynamic { ssr:false }`; render nothing if WebGL unavailable. Respect `prefers-reduced-motion`.

## Animations & interactions
- **Preloader:** gradient 0→100 counter + progress bar, then theatre-curtain split (top/bottom panels slide away).
- **Hero reveal:** headline letter-by-letter rising with slight rotation; second line gets the orange→amber→ember gradient.
- **Custom cursor** (dot + trailing ring, expands on hover; disabled on touch).
- **Magnetic CTAs** with a diagonal sheen sweep on the primary button.
- **Scroll progress bar** (gradient, top, via `useScroll`).
- **Giant outlined watermark word** "mrk18" behind hero with scroll-parallax x.
- **Tilted gradient marquees** (~1.2°) between sections, keywords split by ◆, alternating filled/outlined, infinite, pause on hover. Marquee keywords: **AI CMO ◆ Bitter-truth reports ◆ Built for founders ◆ No marketing team needed ◆ India-first ◆ Advice that ships**.
- **Section reveals:** fade-up + blur-to-sharp via `whileInView`, staggered.
- **Animated counters** count up from 0 ease-out in view.
- **3D tilt cards** with cursor-tracking radial **orange** glow.
- **Giant "JOIN THE WAITLIST"** outlined text filling with gradient L→R on hover.
- **Frosted-glass navbar** appearing after intro, gaining blur+shadow on scroll. Nav links: How it works · Features · Pricing · Join waitlist.

## Page content (use verbatim)

**Hero**
- Eyebrow: `AI CMO · BUILT FOR FOUNDERS`
- Wordmark, 2 lines: line 1 `mrk18` (white), line 2 `your AI CMO` (gradient).
- Value prop: "The marketing brain founders can't afford to hire — yet. mrk18 reads your real numbers, flags what's **leaking money**, and hands you the next move in plain language."
- CTAs: **Join the waitlist** (primary), **See how it works** (ghost).
- 4 inline stats (gradient left-borders):
  - `90%` — "of the marketing work happens below the dashboard"
  - `1` — "decision a week, in plain language"
  - `0` — "marketing hires required to start"
  - `24/7` — "watching what's working vs leaking"

**Problem (01)**
- Eyebrow: `THE PROBLEM`. Heading: "Your dashboard is *green*. Your bank account isn't." (italic word = gradient.)
- Insight card: "Most founders don't have a marketing problem — they have a measurement problem. Activity is easy to grow. Revenue was always the only point. The numbers that decide whether you survive sit at the bottom, where no one looks until it's late."
- 4-cell stat band:
  - `11/11` — "founders we met had green metrics, flat revenue"
  - `27 hrs` — "a week founders lose to marketing they shouldn't touch"
  - `2` — "average paying customers their 'green' campaigns actually drove"
  - `1` — "honest second opinion they were missing"

**How it works** — 3 sticky/stacking cards, giant outlined numbers:
- `01 ADVISE` — "Looks at your numbers and tells you what to do next — and what to stop." Pills: ICP · positioning · channels.
- `02 WATCHDOG` — "Watches every week and flags what's leaking money before it becomes a crisis." Pills: spend · CAC · activation · retention.
- `03 EXECUTE` — "Helps you run the work, so advice turns into shipped marketing — not another report." Pills: copy · creative · scheduling · approvals.

**Features** — 4 tilt cards (numbered labels + tag chips):
- `01 Reads your real numbers` — "Connects to your channels and reads live data, not what you paste." Chips: GA4 · ad platforms · CRM · email.
- `02 Tells the bitter truth` — "A weekly plain-language report on what's working vs wasting money." Chips: weekly · honest · actionable.
- `03 A decision, not a chart` — "Hands you the next move, not a dashboard to decode." Chips: 1 move/week · plain English.
- `04 Built for India-first founders` — "Made for founders who run marketing without a marketing team." Chips: India-first · solo-founder · budget-aware.
- Integrations marquee (pills, pause on hover): Google Ads · Meta · LinkedIn · GA4 · HubSpot · Mailchimp · Stripe · Notion.

**Proof** — grid of cards with gradient ◆ icons (placeholders, mark as "early access" quotes):
- "Finally a tool that tells me what to *do*, not just what happened." — Founder, SaaS (early access)
- "Caught ₹40k/month leaking into a channel that never converted." — Founder, D2C (early access)
- "It's the marketing co-founder I couldn't afford to hire." — Founder, Fintech (early access)

**Pricing / Waitlist tiers** — clean rows, big gradient price/label, row slides right on hover:
- `Founding 50` — "Early access · shaped with you · founder pricing locked" — **Apply**
- `Early access` — "Join the waitlist · first to onboard" — **Free to join**
- `Launch` — "Full AI CMO · advise + watchdog + execute" — **Coming soon**

**Contact** — giant **JOIN THE WAITLIST**; three cards: Email `hello@mrk18.com` · LinkedIn `mrk18` · X `@mrk18`; green pulsing badge "now onboarding founders".

**Footer** — minimal: `mrk18` (gradient) · "your AI CMO" · © 2026.

## Technical
- Mobile-first responsive (single column on mobile, cursor disabled on touch). Accessible (semantic landmarks, focus states, reduced-motion).
- SEO metadata in `layout.tsx`: title `mrk18 — your AI CMO`, description from the value prop, OG image, `lang="en"`.
- No console errors; lazy 3D, `next/image`, minimal listed dependencies.

---

*Notes: swap `mrk18.com` URLs and the placeholder metrics for real ones before launch. Replace the early-access quotes with real testimonials once you have them.*
