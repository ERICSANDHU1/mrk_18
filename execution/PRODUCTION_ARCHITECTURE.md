# MRK18 — PRODUCTION ARCHITECTURE

**Version:** 1.0 · 11 June 2026
**What this is:** the launch blueprint — how MRK18 runs in **production**, with your trained Brain (Qwen3-32B + LoRA adapters) deployed on RunPod, real founders paying, and **nothing breaking**.
**Relationship to [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md):** that doc is how we *build* the execution system (Phases 1–3). This doc is what everything looks like *deployed and live* — it is the target state of Phase 4 + launch.
**Every price and version in this document was verified online on 11 June 2026, with sources.** Prices move; re-verify the week of launch.

---

## 1. The production system at a glance

```
  Founder's phone/laptop
        │
        ▼
┌  app.mrk18.com  ┐        ┌  api.mrk18.com  ─────────────────────────┐
│ Next.js (Vercel │  CORS  │ FastAPI + LangGraph (Render, Singapore)   │
│ Pro) — UI, gate │ ─────► │  · pipeline runs + approval gates         │
│ screens, call UI│  SSE   │  · ARQ workers (cron + timed metric pulls)│
└─────────────────┘ direct └───┬──────────┬──────────┬────────────────┘
                               │          │          │
              ┌────────────────┘          │          └───────────────┐
              ▼                           ▼                          ▼
  ┌  THE BRAIN (RunPod)  ┐   ┌  Supabase (Pro)        ┐   ┌  External engines      ┐
  │ vLLM ≥0.22 · Qwen3-  │   │ Postgres (state, RLS,  │   │ fal.ai (images)        │
  │ 32B FP8 + all LoRA   │   │ pgvector Company Brain,│   │ LinkedIn API · X API   │
  │ adapters on ONE 48GB │   │ LangGraph checkpoints) │   │ IG ops queue           │
  │ GPU · hot-swap/roll- │   │ Auth · Storage (images)│   │ Resend (email)         │
  │ back via aliases     │   └────────────────────────┘   └────────────────────────┘
  │ FALLBACK: Together/  │
  │ Groq rented APIs     │   ┌  THE CALL (voice)      ┐
  └──────────────────────┘   │ Pipecat worker + Live- │
                             │ Kit Cloud (Mumbai PoP) │
  Watchdogs over everything: │ STT Deepgram · TTS     │
  Sentry · Better Stack ·    │ Cartesia → Sarvam Hindi│
  Axiom logs · Langfuse      └────────────────────────┘
```

**The one rule survives in production:** the Brain (RunPod) only thinks and commands. Every external action goes through the execution engines with their approval gates, agent identities, and audit log — exactly as built in Phases 1–3.

---

## 2. The Brain in production — vLLM multi-LoRA on RunPod

### 2.1 Serving setup (verified against vLLM v0.22.1 docs)

- **One GPU serves everything**: Qwen3-32B quantized to **FP8** (~33–38 GB) + all 10–14 LoRA adapters (~2–5 GB total) + KV cache, on a single **48 GB Ada-generation card**.
- vLLM flags: `--enable-lora --max-loras 14 --max-lora-rank 64 --max-model-len 16384 --gpu-memory-utilization 0.9` + `VLLM_ALLOW_RUNTIME_LORA_UPDATING=True`.
- **Per-request adapter selection is just the `model` field** of the OpenAI-compatible API (`"model": "adcopy-v8"`). This is exactly the socket the execution system's `llm/` layer already expects — **Phase 4 merge = repoint the role registry, zero code changes.**
- LoRA rides on the quantized base without merging (AWQ/GPTQ/FP8 all supported). **Rule: eval every adapter against the exact serving quantization before promoting** — QLoRA-trained adapters can drift on a differently-quantized base.

### 2.2 GPU + hosting choice

| Stage | Setup | Monthly |
|---|---|---|
| **Design partners (pre-voice)** | RunPod **serverless L40S flex, scale-to-zero** + network volume | **₹6–12K** — accepts minutes-long cold start for first request |
| **LAUNCH (always-on, voice live)** | RunPod **dedicated pod 24/7: RTX 6000 Ada $0.77/hr or L40S $0.86/hr** | **₹53–60K** (A6000 + AWQ-4bit variant: ₹34K) |
| 100+ users | 2× L40S serverless active workers w/ load balancing, or 1× H100 pod | ₹1.25–2L |

> ### ⚠ THE BITTER TRUTH (our own brand, applied to us)
> The board's "inference ₹2–10K/mo" figure is **only true for scale-to-zero serverless** — which means cold starts of **minutes** and **no real-time voice call**. The moment "YOUR CMO IS CALLING" must answer in under 2 seconds, you need an always-warm GPU, and the honest floor is **₹34K/mo (A6000/4-bit) — realistically ₹53–60K/mo (Ada/FP8)**. Plan the launch budget on ₹35–65K/mo for the Brain, or launch voice as "scheduled call-backs" instead of instant calls and stay serverless. This is a decision, not a footnote — see §11.

- **Why not India GPUs at launch:** RunPod has **no India region**, but Indian clouds cost 40–130% more for the same silicon (E2E Networks L40S ₹83K/mo, Yotta ₹100K, AWS Mumbai ~₹145K vs RunPod ₹60K). Latency India→US (~150–250 ms RTT) is absorbed inside the 2s voice budget. **Start on RunPod; migrate to E2E Networks when a customer contract demands data residency** — and pursue IndiaAI Mission subsidized compute (up to ~70% off) for that migration. This also keeps the sovereign-AI narrative honest: the *models* are sovereign today; the *hosting* becomes sovereign when revenue or contracts justify it.

### 2.3 Adapter deployment — retrain every 2–4 weeks with zero downtime

Your Data Factory cadence (train → eval → deploy → monitor) maps to this exact mechanical loop:

1. Push retrained adapter to the network volume / S3 as a **new versioned name** (`adcopy-v8` — never overwrite).
2. `POST /v1/load_lora_adapter {"lora_name": "adcopy-v8", ...}` — loaded live, no restart.
3. Run the smoke-eval set against `model="adcopy-v8"` (blind side-by-side per the board's step 5).
4. Flip the alias in the orchestrator's routing table: `adcopy → adcopy-v8`. **Done — production traffic moves.**
5. Keep `v7` loaded through a soak period. **Rollback = flip the alias back. Instant, zero GPU work.**
6. Unload `v7` later. Tag every version with dataset snapshot + eval scores (the board's rule).

### 2.4 The router — kill the 4B GPU router

Verified industry pattern (NVIDIA router blueprint, production routing surveys): adapter selection across 10–14 *known* tasks is closed-set classification — a **0.5–1.5B classifier or embeddings+rules on CPU** matches a 4B model at near-zero cost. Replace the 4B GPU router with a CPU classifier inside the LangGraph orchestrator. Saves ~5 GB VRAM, one whole serving engine, and real money. (Keep the 4B only if it also does generative work like query rewriting.) This **supersedes the board's "trained classifier router" sizing** — same idea, smaller and cheaper than planned.

### 2.5 Brain reliability

- vLLM `/health` endpoint + Prometheus `/metrics`; **startup probe grace ≥120 s** (a 32B model takes 1–5 min to load).
- vLLM *will* occasionally die (KV OOM). Docker `--restart always` + gateway health-checking. No Kubernetes at this scale — adopt `vllm-project/production-stack` only at multi-replica (100+ users).
- **Fallback chain (the no-single-point-of-failure rule):** RunPod Brain → circuit breaker opens → **Together AI Qwen3-235B / Groq** rented endpoints (the same providers the execution system launched on — they never leave the config). Degraded generations get flagged in logs/response metadata. The product stays up even if the Brain box dies.

---

## 3. Web tier — Render + Vercel

*(Research date 11 Jun 2026: AWS App Runner closed to new customers Apr 2026; Railway had an 8-hour platform-wide outage 19 May 2026 with 5 postmortems in 6 months; Fly.io shows 57 incidents in 90 days. Render has the cleanest 2025–26 record of the managed platforms.)*

- **Backend: Render, Singapore region** — FastAPI web service (Standard 2 GB, $25/mo) + ARQ worker + Render Key Value (Redis). Singapore→India is ~35–70 ms — irrelevant when every meaningful wait is an LLM call. Zero-downtime deploys with health-check gating, one-click rollback, native cron. Graduate to AWS Mumbai/Fargate only if Render stumbles or ops time appears.
- **Background jobs: ARQ + Redis** — async-native, cron + `defer_by` (the +1h/+6h/+24h/+72h/+7d Eagle-View pulls land naturally), retries with backoff. Temporal/Hatchet rejected: LangGraph's Postgres checkpointer already provides the durability they sell. **Every queued task is thin and idempotent** ("resume graph X", "pull metrics for post Y") with schedule intent recorded in Postgres — so Redis loss is harmless and the queue is swappable in a day.
- **Frontend: Vercel Pro ($20/mo, 1 seat)** — Hobby is non-commercial; a paid SaaS must be on Pro.
- **SSE rules (the classic invisible launch-killer):**
  - Browser streams **directly from `api.mrk18.com`** — never through Vercel functions or Next.js rewrites (300–800 s caps + double billing).
  - **Heartbeat every ~20 s**; client auto-reconnects with `Last-Event-ID`; **Postgres is run-state truth, never the socket** — a dropped stream is normal, not a failure.
  - Multi-day approval pauses hold **no connection at all** — the gate UI reads state via REST; resume via `Command(resume=...)`.
- **Cloudflare free for DNS — but `app.` and `api.` stay grey-cloud (DNS-only)**: orange-clouding the API puts SSE behind Cloudflare's ~100 s idle timeout. Orange-cloud only the marketing site.
- **Secrets: Doppler free tier** (3 users) as single source of truth, synced to Render + Vercel + GitHub Actions. Secret drift between four places is a classic launch-week outage.

---

## 4. Data tier — Supabase Pro, hardened

**Mandatory before launch** (from Supabase's own production checklist + research):

- [ ] **Pro plan ($25/mo)** — the free tier auto-pauses after 1 week idle: disqualifying for production.
- [ ] Spend cap **ON** (degradation, never surprise bills).
- [ ] RLS on **every** table (already our Phase 2 design) + SSL enforcement + network restrictions.
- [ ] MFA on the Supabase account; **both founders as organization owners**.
- [ ] **Custom SMTP for auth email** — the default is 30 signups/hour, a launch-day killer.
- [ ] CAPTCHA on auth endpoints; OTP expiry ≤ 1 h.
- [ ] Connection discipline: FastAPI + LangGraph checkpointer on **session pooler (5432)**, small fixed pools, statement timeouts (load-tested with k6).
- [ ] Daily backups (Pro, 7-day retention) verified restorable. **PITR (+$100/mo) deferred** until DB >4 GB or revenue justifies it — documented accepted risk: up to 24 h data loss.
- [ ] **Honest DR position:** Supabase is single-region, no auto-failover. Mitigation = backups + status-page honesty during a region incident. Revisit at revenue.

---

## 5. Voice tier — "YOUR CMO IS CALLING"

*(This is P1's flagship moment; the research compared Vapi, Retell, and Pipecat+LiveKit.)*

- **Launch architecture: Pipecat (v1.3+) + LiveKit Cloud, Mumbai region, self-hosted Pipecat worker.** It is the only option that natively delivers **word-level timestamps** — the "₹450 CAC flashes on screen as it's spoken, within ~300 ms" effect; the others give ~1–2 s utterance-level approximations. LiveKit has real India PoPs (Mumbai + Hyderabad); free tier (5,000 WebRTC min/mo) covers transport to ~100 users.
- **De-risk first: a 2-day Vapi spike** (free tier) — plug the RunPod endpoint into Vapi Custom-LLM + Web SDK to validate script, persona, interruption UX, and real India latency with founders **before** committing the 2–4 week Pipecat build. Vapi's OpenAI-compatible BYO-LLM is exactly what Pipecat consumes later, so nothing is thrown away. (Retell dropped: its BYO-LLM needs a bespoke websocket server and has the coarsest sync events.)
- **Voices:** English launch = **Cartesia Sonic** professional Indian-English voice (cheap, low-latency, word timestamps) + Deepgram Nova-3 STT ($0.0058/min, handles Indian-accented English). **Hindi fast-follow = Sarvam Saarika STT (₹0.50/min) + Bulbul v3 TTS** — India-hosted, ~₹3/min all-in.
- **Cost reality:** ~₹12–19 per 5-min call self-orchestrated; at 100 founders × 4 calls/mo ≈ **₹6–9K/mo including the worker VM**. Cost does not decide this choice — sync fidelity and India latency do.
- **Engineered for drops, not against them:** mobile networks WILL drop calls. Call state (analysis position, transcript) persists server-side, so the **re-call button resumes**: "where were we — ah yes, your CAC…". Calls hard-capped at 5 min in the pipeline. iOS Safari quirk handled by design: the "Answer" button *is* the user-gesture that unlocks audio autoplay.
- **Fail-fast policy:** voice can't queue. Provider trouble → instant honest fallback: "lines busy — we'll call you back" + queued callback job.

---

## 6. Reliability engineering — the watchdog stack

| Concern | Tool (verified tier) | Cost |
|---|---|---|
| Error tracking | **Sentry** Developer (5k errors/mo) on FastAPI + Next.js | ₹0 → $26/mo |
| Uptime + dead-man switches | **Better Stack** free: monitors on app/api/Supabase/Brain `/health` + **a heartbeat on every scheduled job** (silent job = alert) + free status page | ₹0 |
| Wake-up alerts (SEV1) | **Zenduty** (Indian company, phone+SMS to Indian numbers, $5/user/mo) or Better Stack Responder; + free Telegram channel on both phones | ~₹900/mo |
| Logs | **Axiom** free — 500 GB/mo, **30-day retention** (also covers DPDP breach-investigation needs) | ₹0 |
| LLM traces | **Langfuse** Hobby (50k units, **2 seats** — beats LangSmith's 1 seat for a 2-founder team) | ₹0 |
| GPU/queue metrics | vLLM Prometheus `/metrics` → Grafana Cloud free (optional) | ₹0 |

### 6.1 Cost guardrails — a bug can never burn the company

- **Groq:** hard monthly cap in console (keys return 400 when hit) — SET IT.
- **Together + fal.ai:** no native hard caps → **route through Cloudflare AI Gateway spend limits** (free, hard caps per provider + fallback routing).
- **RunPod:** prepaid balance IS the cap — **auto-recharge OFF**; pods auto-stop, volumes preserved.
- **Vercel:** Spend Management ON — SMS at 100% + auto-pause deployments.
- **Supabase:** spend cap ON.
- **App level:** LangGraph `recursion_limit` on every graph · per-request token ceilings · per-founder daily generation quota · per-run cost counter logged and alerted (already in `RunMeta`).

### 6.2 Resilience patterns (coded into the backend)

- **Circuit breakers** (`purgatory`, asyncio-native, Redis-shared state) around every external client: Brain endpoint, fal.ai, voice providers, each social API. Tenacity retries *inside* the breaker for transients.
- **Fallback chains:** Brain → Together/Groq (§2.5) · fal.ai klein → FLUX schnell (same API) · Cartesia → ElevenLabs.
- **Per-flow policy:** content generation = queue-and-retry with visible status · publishing = idempotent queue, retry w/ backoff, **alert founder on final failure, never silently drop** · comment polling = fail-fast per cycle, overlap windows, catch up next cycle · voice = fail-fast + queued callback.
- **Webhook handling:** return 200 immediately, enqueue, process async, idempotency key on every webhook (prevents retry storms).

### 6.3 The 5 launch-day killers and our answer

| Failure mode | Mitigation (built, not hoped) |
|---|---|
| Third-party rate limits under burst | Client-side token buckets per provider + backoff w/ jitter + caching |
| DB connection-pool exhaustion | Session pooler, small fixed pools, statement timeouts, k6-tested |
| SSE/proxy timeouts | 20 s heartbeats, direct-to-API streaming, grey-cloud DNS, reconnect+resume |
| Webhook storms | 200-immediately + queue + idempotency |
| Runaway LLM loops/cost | recursion limits, token ceilings, quotas, hard provider caps |

### 6.4 Incident severity (taped above both desks)

- **SEV1** — app down / data breach / payments broken → phone alert, both founders, status page <15 min, postmortem mandatory. Breach → **DPDP 72-hour clock starts immediately**.
- **SEV2** — core flow degraded / provider down with fallback active → Telegram alert, respond <30 min waking hours.
- **SEV3** — minor bug / single user / one failed job → ticket, next business day.

---

## 7. Security & DPDP in production

Everything from Phase 2 (S1–S5: token vault, RLS tenant isolation, agent identities, signed ApprovalEvents, immutable audit log) ships as built. Production adds:

- **Dependency scanning:** Dependabot ON (free). **Secret scanning:** gitleaks pre-commit + CI step (free; skips GitHub's $19/committer/mo product).
- **WAF/rate limiting:** Cloudflare free WAF on marketing; the one free rate-limit rule on the most expensive endpoint (generation); `slowapi` per-user limits in FastAPI.
- **DPDP operational readiness (Rule 7, penalties up to ₹200 crore):** breach = notify affected founders without delay in plain language + intimate the Data Protection Board without delay + **detailed Board report within 72 h**. Pre-launch artifacts: pre-drafted founder notice + Board intimation templates, ≥30-day log retention (Axiom covers it), the incident runbook from Phase 2, and a breach-detection path (Sentry security alerts + audit-log anomaly alerts → SEV1).

---

## 8. Deployment pipeline & environments

- **Branch model:** `develop` → staging, `main` → production. Two Supabase projects; staging Render services on Starter instances (+$14/mo); Vercel previews per PR are the frontend staging.
- **CI (GitHub Actions):** tests + lint on PR → on merge: **migrations first (`supabase db push`), then app deploy** (Render auto-deploy gated by health checks).
- **Migrations are expand/contract only:** additive first; drop columns only after no deployed code reads them. This discipline IS the database rollback story (app rollback = one-click on Render/Vercel; DB = forward-only corrective migrations, never reset).
- **Brain deploys:** RunPod GitHub integration → auto-release with instant rollback for the vLLM image; **adapters deploy via the alias flip (§2.3), never via image rebuilds.**
- **Rollback drill before launch:** actually roll back each tier once (Render, Vercel, adapter alias) so the first rollback isn't performed during a fire.

---

## 9. Launch-readiness checklist (the gate to launch day)

**T-minus 2 weeks:**
- [ ] All §4 Supabase hardening items checked
- [ ] All §6.1 cost caps set and screenshot-documented
- [ ] Sentry, Better Stack (+ heartbeats on every job), Axiom, Langfuse, Zenduty wired; test-fire one alert of each kind to both phones
- [ ] gitleaks + Dependabot green; DPDP templates + runbook in repo
- [ ] **Load test week:** k6 soak at 2× expected traffic · spike test (0→200 VUs/30 s) on signup + generation · N concurrent SSE streams held open
- [ ] **Game day:** kill the RunPod endpoint on purpose → watch the breaker open and Together/Groq fallback serve → confirm degraded-mode flags in logs
- [ ] Rollback drill on all three tiers (§8)

**T-minus 1 week:**
- [ ] Re-verify every price/limit in this doc (they move)
- [ ] Adapter smoke-eval suite green against serving quantization
- [ ] Voice latency measured from a real Indian mobile connection
- [ ] Status page live · 5-min-cap on calls verified · re-call resume verified
- [ ] Both founders can: read Axiom logs, flip an adapter alias, roll back a deploy, run the breach runbook

**Launch criteria (from the board, now measurable):** first live post <15 min · publish success ≥95% · security incidents: 0 · founder time <15 min/day.

---

## 10. Cost model — total monthly burn (verified prices, ₹86–95/USD)

| Tier | 5 founders (DP) | 50 founders | 100 founders |
|---|---|---|---|
| **Brain GPU (RunPod)** | ₹6–12K (serverless) **or ₹34–60K (always-on for voice)** | ₹59–67K (dedicated Ada) | ₹1.25–2L (2× workers / H100) |
| Web tier (Render+Vercel+extras) | ₹4.5K | ₹10K | ₹15–18K |
| Supabase Pro | ₹2.2K | ₹2.2K+ | ₹4–8K (compute upgrade) |
| Voice (all-in incl. worker) | ₹0.5–1K | ₹3–5K | ₹6–9K |
| Images (fal.ai) | <₹100 | ₹500 | ₹1K |
| Rented LLM fallback + misc APIs | ₹300 | ₹2K | ₹4K |
| Alerting (Zenduty) | ₹900 | ₹900 | ₹900 |
| **TOTAL** | **₹15–25K** (pre-voice) / **₹45–75K** (voice live) | **₹78–90K** | **₹1.6–2.4L** |

Revenue check vs the board's pricing: 50 founders × ₹4,999 (DP price) = ₹2.5L/mo against ~₹85K costs — **healthy**. 100 × ₹9,999 = ₹10L/mo against ~₹2L — **strong**. The model works *if* the always-on GPU decision (§11) is made consciously.

---

## 11. ⚠ Decisions the founders must make (production-blocking)

1. **The GPU budget truth (§2.2):** instant voice calls require an always-warm GPU ≈ **₹34–60K/mo** — the board's ₹2–10K only buys cold-start serverless. Choose: (a) fund the pod from launch, (b) launch voice as *scheduled call-backs* (cold start hidden behind "your CMO will call in 3 minutes") and stay serverless until revenue, or (c) launch P1 voice on **rented APIs** (Together/Groq serve the persona adapter's job via prompting) and switch to the Brain pod at the 30–50-user economics crossover. **✅ DECIDED (11 Jun 2026): option (c) — see §14 Pilot Configuration**, which is the active deployment plan for the first 4–5 users.
2. **India data residency timing:** launch on RunPod (cheapest), migrate Brain to E2E Networks when a contract/DPDP posture demands it (+40%, INR billing, IndiaAI subsidy possible). Sign off on this sequencing.
3. **X route** (carried from SYSTEM_ARCHITECTURE §11): official API at ~$0.015/post vs the PDF's browser automation. Decide before Phase 2 ends.
4. **PITR deferral:** accept "up to 24 h data loss" risk at launch, or pay +$100/mo now.

---

## 12. Scale-up triggers (change nothing until a trigger fires)

| Trigger | Action |
|---|---|
| >1–2 GPU-busy-hours/day on rented APIs (~30–50 active users) | Move Brain from rented APIs → dedicated RunPod pod |
| Voice goes instant-on | Always-warm worker/pod (§11.1) |
| DB >4 GB or paying customers demand it | PITR add-on; Supabase compute upgrade |
| 100+ users / multi-replica Brain | vllm-production-stack on k8s; 2× L40S load-balanced |
| Customer contract requires residency | Brain → E2E Networks Mumbai (IndiaAI subsidy application first) |
| Sentry >5k errors or seat pain | Sentry Team $26/mo |
| Render stumbles twice | Re-evaluate AWS Fargate Mumbai |
| SGLang LoRA serving matures | Re-benchmark vs vLLM at the 100-user milestone |

---

## 14. ✅ PILOT CONFIGURATION — the ACTIVE plan (first 4–5 users, weeks 1–2)

**Founder decision, 11 June 2026:** launch as a production-*quality* app for 4–5 design partners first. Same codebase, same iron rules — cheapest deployment config. Nothing in Phases 1–3 changes; this section only changes *which infrastructure tier each component runs on*.

### What stays at FULL production quality (non-negotiable, costs nothing)

- Approval gates, ApprovalEvent verification, silence = rejection — all of it.
- Security: RLS tenant isolation, token vault, encrypted secrets, audit log, gitleaks/Dependabot.
- Reliability patterns in code: circuit breakers, fallback chains, idempotent publishing, heartbeats on every job.
- Monitoring: Sentry / Better Stack / Axiom / Langfuse — all on free tiers anyway.
- Cost caps: set from day one (Groq cap, RunPod auto-recharge OFF, Vercel spend management).

### What runs on the cheap tier during the pilot

| Component | Pilot config | Pilot cost/mo | Upgrade trigger |
|---|---|---|---|
| **Brain** | **Rented APIs only** — Together Qwen3-235B + Groq fallback. No RunPod GPU yet. Adapters tested on RunPod **serverless scale-to-zero** only when a trained adapter is ready to A/B (₹6–12K in that month only) | **~₹300–500** | 30–50 active users, or >1–2 GPU-busy-h/day |
| Backend (Render) | Starter instances (web $7 + worker $7); upgrade to Standard 2 GB ($25) if SSE feels tight | ~₹1.2K | Real launch |
| Frontend (Vercel) | Hobby (free) while partners test unpaid; **flip to Pro ($20) the day you charge** — Hobby is non-commercial and DPs pay ₹4,999 | ₹0 → ₹1.7K | First paid invoice |
| Supabase | Free tier (500 MB is plenty for 5 founders; daily activity prevents auto-pause). **No backups on free — export a manual `pg_dump` every 2–3 days** | ₹0 | First paying user → Pro $25 |
| Voice ("the call") | **Vapi free credits → small prepaid** with our RunPod-less custom LLM (rented API behind it). Pipecat+LiveKit build starts only after the call concept is validated with real partners | ~₹500–1K | Concept validated + >20 calls/wk |
| Images (fal.ai) | klein 4B, pay-per-image | <₹100 | — |
| Alerting | Telegram channel (free); Zenduty deferred | ₹0 | First paying user |
| **TOTAL PILOT** | | **≈ ₹2–4K/month** + one-time $5 Together minimum | |

### Pilot exit = the board's own kill-switch metrics (Sheet 14)

Run the 4–5 partners for 1–2+ weeks against: ≥80% complete the call · ≥60% return in week 2 · ≥3 of 5 would pay · repeatable demo <15 min. **Pass → flip the §10/§12 upgrade triggers one by one (Supabase Pro → Vercel Pro → Render Standard → Zenduty → eventually the GPU pod). Fail → stop, interview, re-scope — having spent ₹2–4K/month, not ₹75K.**

---

## 15. Source index (all accessed 11 June 2026)

vLLM LoRA/quantization/k8s docs · vLLM v0.22.1 releases · RunPod pricing + serverless docs + worker-vllm · E2E Networks / Yotta Shakti / AWS Mumbai pricing · Render pricing/regions/changelog · Railway incident postmortem (19 May 2026) · Vercel pricing + spend management · Supabase pricing + going-into-prod checklist + pooler troubleshooting · ARQ v0.28 · Hatchet/Temporal pricing · Cloudflare SSE timeout threads + AI Gateway spend limits · Sentry/Better Stack/Axiom/Langfuse/Zenduty pricing · Vapi/Retell/LiveKit/Pipecat docs + pricing · Sarvam API pricing · Deepgram/Cartesia/ElevenLabs pricing · DPDP Rules 2025 Rule 7 · NVIDIA LLM Router blueprint. (Full URLs preserved in the research reports; available on request.)

---

*End of production architecture. The execution-system build (Phases 1–3, SYSTEM_ARCHITECTURE.md) proceeds unchanged — this document is where it all lands.*
