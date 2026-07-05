# MRK18 — Investor-Ready with 10 Users (scoped production plan)

> Goal (set 2026-06-23): make the webapp production-ready for ~**10 customers** to become
> **investor-ready**, raise a round, then build traction. NOT a public launch at scale.
> Already on **RunPod Serverless** (scale-to-zero); **Supabase Pro** covers the whole data layer.
>
> Reframe: at 10 hand-held users the risk is **embarrassing the demo** or a **diligence landmine** —
> not load. Build only what serves those two. The bar investors hold at this stage: *it works
> reliably, the insight is real (not mock), there's a retention signal, some users PAY, and
> diligence finds no landmine.* ~2–3 weeks of focused work + legal in parallel.

---

## Phase 1 — Trust & safety core *(don't lose a user or leak data)* — ~week 1
1. **Tenant isolation.** Verify EVERY Supabase query in the FastAPI backend is scoped to the user/tenant; enable **RLS** on every public-schema table as a safety net; add **one automated cross-tenant read test** in CI. *(Single highest must-do — one cross-tenant leak in a demo ends it.)*
2. **Idempotency on side effects.** A retry/refresh must not double-publish, double-charge cost, or double-write. Add an idempotency check (`run_id+node`) **before** every side-effectful node (publish, cost metering, Supabase writes, paid Tavily/LLM calls). No Celery needed at 10 users — just "did I already do this?".
3. **Gates hard + no invented numbers.** Keep Gate-1 (strategy) and Gate-2 (per-post) human approvals mandatory. Any metric shown must come from a **real API value**, never the LLM. One hallucinated "your CAC is ₹X" kills the "real CMO" pitch.
4. **Graceful failure UI.** Clean error states everywhere (the run "failed" path, network errors) — no white screens. Demos hit edge cases.
5. **Secret/endpoint hygiene.** Run **Gitleaks** once (rotate anything found); vLLM/RunPod endpoint **not** publicly exposed; `service_role`/RunPod keys server-side only.

## Phase 2 — Make it real & make it pay *(the moat + revenue signal)* — ~week 1–2
6. **One real connector live.** Replace `web/lib/mock/` with a real **Stripe read-only** (fastest) or **GA4** connector for at least 3–5 of the 10; clearly label live-vs-simulated. *Real insight on real data is worth more than everything else combined in a fundraising demo.*
7. **Monetization.** Wire **Razorpay** (India) or Stripe Billing so some of the 10 actually **pay** (even ₹999/mo). "Paying customers" is the #1 pre-seed traction signal.
8. **Light adapter sanity-check.** Before promoting the 4 in-training adapters into the demo path: a small golden set (~30 prompts/role), eyeball quality, keep the prior version for rollback. (Full eval/canary infra is post-funding — this is the cheap version.)
9. **Onboarding / activation.** Make sign-up → company-brain form → first successful campaign fast and smooth. No activation = no retention to show.

## Phase 3 — Reliability & the traction story *(the demo works + you can prove it)* — ~week 2
10. **1 warm RunPod worker** during demo/business hours so a cold start never makes it look broken.
11. **Uptime monitor + alert** (UptimeRobot / BetterStack free) on the app + API + GPU endpoint.
12. **Come-back loop.** Email (or WhatsApp) notification when a run needs approval or is done. Drives return visits = your retention metric.
13. **Product analytics** (**PostHog** free tier): activation, repeat usage, week-over-week retention — this generates your pitch-deck numbers.
14. **Seeded demo tenant.** A clean tenant with real-looking data so the investor walkthrough never depends on a live cold run.

## Phase 4 — Diligence pack *(no landmines)* — parallel / light
15. **Legal & IP** *(biggest non-technical landmine)*: company incorporated; the **9 adapter weights + the code IP assigned to the company**; founder/contributor IP-assignment agreements. If the weights aren't owned by the entity, it's a deal-killer.
16. **Privacy policy + terms** (a generated template is fine to start).
17. **Account deletion + data export** (cheap DPDP/diligence hygiene).
18. **Don't train adapters on customer data without explicit, revocable consent** — and audit the 5 trained adapters for any PII baked in.
19. **Backups verified** (Supabase Pro daily backups + one tested restore) + a one-page architecture/security note for the technical advisor.

---

## Explicitly OUT of scope until post-funding (do NOT build yet)
Kubernetes · multi-region · autoscaling beyond serverless · SOC 2 · full DPDP/CERT-In apparatus ·
adapter canary/shadow/registry machinery · per-user billing ceilings · heavy observability stacks ·
the pocket hardware device. All premature at 10 users — wasted motion and money.

## The fastest two to start
**(1) Phase 1 tenant-isolation pass** (RLS + scope audit + cross-tenant test) and
**(2) Phase 2 Stripe read-only connector** replacing the mock. The first is the cheapest insurance
against the worst demo outcome; the second is what turns the pitch from "wrapper" to "real product."
