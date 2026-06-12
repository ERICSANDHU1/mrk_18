# MRK18 Execution System — System Architecture

**Version:** 1.0 (Phase 0 deliverable — awaiting founder approval)
**Date:** 11 June 2026
**Source of truth:** Execution Workflow PRD v2.0 (14-sheet bulletin board, June 2026) — supersedes PRD v1
**Status:** ⛔ BLUEPRINT — no pipeline code exists until this document is approved

---

## 0. The one rule

> **The Brain thinks and commands. Engines execute.**

This repository builds the **Engine side**: the execution machinery that takes a founder's intake, produces analysis and content, enforces human approval gates, publishes, observes, and learns. The Brain (Qwen/Sarvam base + LoRA adapters, trained separately) plugs into the model-abstraction layer (§6) in Phase 4. Nothing in this system may publish, spend, or act externally without a recorded human approval event.

---

## 1. System overview

```
                       ┌─────────────────────────────────────────────────┐
                       │                  FastAPI service                 │
                       │                                                  │
 Founder ──intake──►   │  L1 Intake ──► L2/L3 LangGraph Analysis Graph    │
                       │                  Router → 3 agents (parallel)    │
                       │                  → Synthesizer → ⛔ GATE 1       │
 Founder ◄─review───   │                                                  │
                       │  L4 Generation: Content Agent + Photo Funnel     │
                       │                  → ⛔ GATE 2 (per-platform)      │
 Founder ◄─approve──   │                                                  │
                       │  L6 Publishers: LinkedIn │ X │ IG-ops │ Export   │
                       │  L9 Audit log + post log (always on)            │
                       └──────────────┬──────────────────────────────────┘
                                      │
                       Supabase Postgres (state, checkpoints, RLS, pgvector)
                       Supabase Storage (generated images, public bucket)
                       Together AI / Groq (rented LLMs — Brain's seat until Phase 4)
                       fal.ai (image generation)
```

Phases: **1** = layers L1–L6 + L9 (publishing stubbed, export real) · **2** = security S1–S5 + DPDP · **3** = closed loop (Eagle-View, Comment Agent, Company Brain RAG, self-learning) · **4** = swap rented LLM for the trained Brain (vLLM multi-LoRA).

---

## 2. Repo layout

```
execution/
  SYSTEM_ARCHITECTURE.md      ← this file
  README.md
  pyproject.toml              ← pinned dependencies
  .env.example                ← every secret the system needs, blank
  mrk18_execution/            ← the Python package
    config.py                 ← settings (env-driven, pydantic-settings)
    api/                      ← FastAPI routers (intake, runs, gates, publish status)
    schemas/                  ← ALL Pydantic data contracts (Slice 1.1 — the spine)
    llm/                      ← model-abstraction layer (§6)
    graph/                    ← LangGraph StateGraph wiring + checkpointer
    agents/                   ← agent node functions + prompts (market intel, audience, strategy, content, photo funnel, comment triage)
    gates/                    ← approval gate logic + ApprovalEvent minting/verification
    publishers/               ← Publisher interface + LinkedIn / X / InstagramOps / Export adapters
    audit/                    ← append-only audit + post log writers
    db/                       ← SQLAlchemy async engine, session, repositories
    rag/                      ← Company Brain (Phase 3)
    monitor/                  ← Eagle-View Monitor (Phase 3)
    security/                 ← token vault, agent identities, signatures (Phase 2)
  tests/
  supabase/migrations/        ← plain SQL migrations in git (Supabase CLI)
```

Rule: **schemas/ has no imports from anywhere else in the package.** Everything depends on schemas; schemas depend on nothing.

---

## 3. The 9 layers → concrete modules

| # | PRD v2.0 layer | Module | Phase |
|---|---|---|---|
| 1 | Onboarding input | `api/intake.py` + `schemas/founder.py` | 1 |
| 2 | Agent orchestration | `graph/pipeline.py` (Router + fan-out) | 1 |
| 3 | Analysis | `agents/market_intel.py`, `agents/audience.py`, `agents/strategy.py`, synthesizer + **Gate 1** | 1 |
| 4 | Content generation | `agents/content.py`, `agents/photo_funnel.py` | 1 |
| 5 | ★ Approval gate | `gates/approval.py` — LangGraph `interrupt()` + ApprovalEvent | 1 |
| 6 | Publishing | `publishers/` — 3 adapters + export fallback | 1 (stubs) |
| 7 | ★ Closed loop | `monitor/`, `agents/comment_triage.py`, `rag/` | 3 |
| 8 | ★ Security | `security/` + hardening of all of the above | 2 |
| 9 | Log & audit | `audit/` — written **from Phase 1**, hardened in Phase 2 | 1 |

---

## 4. Data contracts (the spine — Slice 1.1)

All contracts are Pydantic v2 models in `schemas/`. Field lists below are the contract; types/validators live in code.

**`FounderProfile`** — tenant + intake. `founder_id (uuid)`, `company_name`, `website`, `product_description`, `icp` (who they sell to, geography, stage), `top_competitors [3]`, `tone`, `primary_goal`, `monthly_spend_inr`, `target_platforms [linkedin|x|instagram]`, `consent` (DPDP: timestamp, text version, affirmative). Intake is incomplete until every required field validates → hard gate before orchestration.

**`MarketingIntelligenceReport`** — output of L3. `run_id`, `market_intel`, `audience_positioning`, `content_strategy` (each: findings + **per-claim `source` + `confidence: high|medium|low`** — the "zero hallucinated facts" rule is a schema field, not a hope), `synthesis`, `flags_from_founder []` (disagreements at Gate 1).

**`ContentItem`** — one post. `item_id`, `run_id`, `platform`, `format` (linkedin_post | x_single | x_thread | ig_caption), `body`, `thread [..]?`, `link_url?`, `first_comment?` (LinkedIn link-in-first-comment; IG hashtag comment), `image_prompt`, `image_asset_url?`, `status: draft → awaiting_approval → approved | rejected | expired → published | exported | failed`, `regeneration_note?`, `regeneration_count` (capped).

**`ApprovalEvent`** — the load-bearing object. `event_id`, `run_id`, `item_id`, `founder_id`, `decision: approved|rejected`, `note?`, `decided_at`, `signature` (Phase 1: placeholder field present; Phase 2: HMAC over item-hash+founder+timestamp). **The Publisher refuses any item without a matching ApprovalEvent.** Silence = a scheduled expiry job marks items `expired` (= rejected). No "approve all" exists anywhere in API or UI.

**`PublishRequest` / `PublishResult`** — adapter interface (research-verified shapes, §8). Request: `request_id` (idempotency key), `platform`, `account_ref`, `body`, `thread?`, `media [MediaSpec]`, `first_comment?`, `link_url?` (explicit — drives X cost flag / IG strip / LI comment routing), `scheduled_at`, `visibility`. Result: `status: published | queued_manual | exported | failed | retryable`, `platform_post_id?`, `public_url?`, `thread_ids?`, `published_at?`, `raw_response`, `error?` (incl. `is_token_expired`), `cost_estimate_usd?`. **`PublishResult` is updatable, not write-once** — the IG ops queue completes asynchronously (`queued_manual` → ops pastes the live URL).

**`AuditRecord`** — `event_type`, `agent_id`, `timestamp`, `approval_event_id?` (**required** for publish events), `platform?`, `outcome`, `detail`. Append-only from day one.

**`SignalRecord`** (Phase 3, schema defined now so no migration later) — `post_ref`, `pulled_at`, `window_point (1h|6h|24h|72h|7d)`, `reach`, `engagement_rate`, `follower_delta_48h`, `link_ctr`, `comment_sentiment`, `saves`, `half_life_estimate`.

**`RunMeta`** — per `CampaignRun`: `thread_id` (LangGraph resume key), `status: generating | awaiting_gate1 | generating_content | awaiting_gate2 | publishing | done | failed`, token counts, image counts, `cost_inr` (fully-loaded, per the PRD's INR cost-tracking requirement).

---

## 5. The LangGraph pipeline (research-verified design)

- **Versions:** `langgraph ~=1.2` (1.2.4 current), `langgraph-checkpoint-postgres ~=3.1`, Python **≥3.11**.
- **Nodes are plain async functions** calling an OpenAI-compatible client directly — no LangChain chains, no `langgraph.prebuilt`. (`langchain-core` rides along as an inert transitive dep.)
- **Fan-out** of the 3 analysis agents = plain `add_edge` from Router to all three; fan-in via an `Annotated[list, operator.add]` reducer; synthesizer waits for all. `Send` reserved for variable-N content generation.
- **Gates = single sequential nodes after fan-in** calling `interrupt(payload)`. One interrupt per gate per thread — the simplest fully-supported case. Resume: `graph.invoke(Command(resume=decisions), config={"configurable": {"thread_id": ...}})` from a FastAPI endpoint. **Gate nodes are side-effect-free** (LangGraph replays an interrupted node from its start — all LLM work happens in nodes *before* the gate).
- **Durability:** `durability="sync"` — every superstep checkpointed before the next; gates survive crashes/restarts and can wait for days. `thread_id` ↔ `run_id` mapping stored in our own table.
- **Checkpointer:** `AsyncPostgresSaver` over a small dedicated `psycopg` `AsyncConnectionPool` (max ~5) with `autocommit=True, row_factory=dict_row`, pointed at Supabase's **session pooler / direct connection (port 5432) — NEVER the transaction pooler (6543)** (documented prepared-statement failure with this exact stack). `.setup()` run once at deploy.
- **Progress streaming:** one SSE endpoint wrapping `astream(stream_mode=["updates","custom"])`; node progress via `get_stream_writer()`; gate detection via `__interrupt__` / `stream_events(version="v3")`.
- **Observability:** LangSmith free tier (5k traces/mo) — env vars only (`LANGSMITH_TRACING`, `LANGSMITH_API_KEY`); OTel switch (`LANGSMITH_OTEL_ENABLED`) planned before production volume.

---

## 6. Model-abstraction layer (`llm/`) — the Brain's socket

One interface, role-based routing, provider-agnostic:

```
complete(role: AgentRole, messages, schema: type[BaseModel]) -> BaseModel
```

- Every call declares its **role** (market_intel, audience, strategy, content, triage, synthesis…). A registry in `config.py` maps role → (provider, model, params). Swapping the whole Brain or a single role = config change.
- **Structured output enforced at this layer**: JSON-schema response_format where the provider supports it, plus Pydantic validation + bounded retry on mismatch. Agents never parse free text.
- **Phase 4 merge:** the registry repoints roles to the vLLM multi-LoRA endpoint (OpenAI-compatible), per-role → per-adapter. Together/Groq stay as automatic fallback. Zero agent-code changes.

**Model selection (verified 11 Jun 2026, prices move — re-check at go-live):**

| Seat | Model | Price /1M in/out | Why |
|---|---|---|---|
| **PRIMARY** | `Qwen/Qwen3-235B-A22B-Instruct-2507-tput` on **Together AI** | $0.20 / $0.60 | Only serverless Qwen3-class with schema-enforced JSON + function calling; instruct (no thinking-token burn); **same family as your adapters** → prompt behavior transfers at merge |
| **FALLBACK** | `openai/gpt-oss-120b` on **Groq** | $0.15 / $0.60 | Production-tier; strict constrained-decoding json_schema (strongest schema guarantee found); ~500 TPS |
| **SMALL** (triage/guardrails) | `llama-3.1-8b-instant` on **Groq** | $0.05 / $0.08 | Cheapest fast classifier; `gpt-oss-20b` where triage must be strictly schema-valid |

Notes: Together has **no free credits** — $5 minimum prepaid (credits never expire). Groq's free tier (6K TPM) is fine for development only. Cost at 5 founders × 3 batches/week: **≈ $3.30/mo (~₹290)** all-in for text. Action item: apply to Together's startup accelerator ($15–50K credits).
Avoid: `qwen/qwen3-32b` on Groq (preview status, no json_schema) as primary.
Quirks encoded in the layer: Groq coerces temperature 0 → set explicitly >0; Groq can't combine structured output + tool use in one call; Together model IDs are namespaced.

---

## 7. Database (Supabase) design

- **Access pattern:** SQLAlchemy 2.x async (asyncpg) + our Pydantic models for app data; `supabase-py` (≥2.31) **only** for Storage uploads and Auth admin. LangGraph checkpointer uses psycopg3 on its own small pool — coexists fine.
- **One DSN policy:** session pooler (port 5432) for both app pool and checkpointer.
- **Tenant isolation (= founder isolation):** `tenant_id` column on every table + **RLS as defense-in-depth**: connect with a least-privilege role (not `service_role`), `SET LOCAL app.tenant_id = '<founder_uuid>'` per transaction, policies on `current_setting('app.tenant_id')::uuid`. No schema-per-tenant.
- **pgvector (Phase 3):** v0.8.x, `vector(1024)` (BGE-M3), **HNSW + cosine**, always filtered by tenant_id (0.8 iterative scans fix filtered recall).
- **Storage:** public bucket for generated post images (platforms re-fetch from stable URLs) with unguessable `{tenant_id}/{uuid}.jpg` paths; private bucket + signed URLs for anything sensitive.
- **Migrations:** plain SQL files in git via Supabase CLI (`migration new` → `db push`). Dashboard schema edits banned.
- **Auth:** Supabase Auth (email+password, Google OAuth). FastAPI validates JWTs via the **JWKS endpoint with PyJWT** (asymmetric keys — the legacy HS256 shared-secret pattern is explicitly discouraged now).
- **Free-tier reality:** 500 MB DB / 1 GB storage / auto-pause after 1 week idle (dev keepalive needed). Budget Pro ($25/mo) when embeddings land in Phase 3.

---

## 8. Publishing layer (`publishers/`)

One `Publisher` interface (PublishRequest → PublishResult, §4). Adapters, with research-verified live shapes baked into the **stubs**:

**LinkedIn (`LinkedInApiAdapter`)** — versioned **Posts API** `POST https://api.linkedin.com/rest/posts` (NOT legacy `/v2/ugcPosts`), headers `LinkedIn-Version: 202605` (config value, quarterly bump chore) + `X-Restli-Protocol-Version: 2.0.0`. `w_member_social` is **self-serve — a brand-new app can post to the member's own profile immediately, no review** (company-page posting is the thing that needs Community Management review). Images: initializeUpload → PUT bytes → attach `urn:li:image:…`. Response is `201` with empty body — **post URN arrives in the `x-restli-id` header**; store URN + derived URL (`linkedin.com/feed/update/{urn}/`) at publish time because member posts can't be read back later. **Token lifecycle is schema-level:** 60-day tokens, no refresh for non-partners → store `token_expires_at`, surface "reconnect LinkedIn" at day ~50. Link policy: link in `first_comment` (comment creation also under `w_member_social`).

**X (`XApiAdapter` primary / `XBrowserAdapter` fallback — ⚠ OPEN DECISION §11)** — X launched **pay-per-use API pricing (Feb 2026): $0.015/post, $0.20/post containing a URL**, no subscription, credits from console. At ≤2 posts/day ≈ **$1–12/founder/month with zero ban risk**. Browser automation is explicitly ToS-prohibited, 2026 enforcement is the harshest ever (AI-driven ban waves), and a suspension lands on the *founder's* account. Recommendation: **stub to the API shape** (`POST /2/tweets`, threads = chained `reply.in_reply_to_tweet_id`, returns `data.id` → `x.com/{handle}/status/{id}`); keep a browser-automation adapter (Playwright persistent context + Camoufox) behind the same interface as documented fallback. `link_url` flags the 13× URL price.

**Instagram (`InstagramManualOpsAdapter`)** — returns `queued_manual`; creates an ops task: pre-validated **JPEG** (only format), aspect 4:5–1.91:1, ≤8 MB, width ≤1440, caption ≤2,200 chars, optional first_comment, SLA window (2–4 h), status flow `queued → claimed → posted → verified` with ops pasting permalink + proof screenshot. **Ops access = Meta Business Suite delegated partner access — never password sharing** (ToS + checkpoint risk). Validation happens at *generation* time, not publish time, so ops never bounces posts. Future: official Content Publishing API (Business account + Advanced Access review — paperwork starts early, it's the slowest gate; 100 API posts/24h limit).

**Export (`ExportAdapter`)** — always available (E1 rung): writes a ready-to-post kit (copy file + image + per-platform instructions) to a dated folder. This is the real deliverable while stubs are on.

Cross-cutting: idempotency keys on every publish; retry/backoff; adapter **re-verifies the ApprovalEvent** before acting (defense-in-depth); per-platform constraint table (max lengths, image specs, link policy) enforced by the Content Agent at generation time.

---

## 9. Image generation (`agents/photo_funnel.py`)

Research finding — **the PDF's FLUX.1 [schnell] plan is superseded**:

| Seat | Model / host | Price/image | Why |
|---|---|---|---|
| **PRIMARY** | **FLUX.2 [klein] 4B on fal.ai** | $0.005 (~₹0.48) | Apache-2.0 (zero SaaS license risk — same legal posture as the schnell plan, one generation newer), sub-second latency, native 1080×1080, official Python client (`fal-client`), sync + webhook modes |
| **TEXT-HEAVY / HINDI** | Nano Banana Pro (Gemini 3 Pro Image), behind a `text_heavy` flag | $0.039–0.134 | Only credibly-verified Devanagari-capable model; current text-rendering leader; Batch API halves cost |
| Fallback | FLUX.1 schnell (same fal API) | $0.003 | One-line model-id swap |

Rules: **no AI-rendered Hindi text in V1** — overlay Devanagari via Pillow + Noto/Mukta fonts on generated backgrounds (pixel-perfect, free). Sizes: generate 1080×1080 native; 1216×640 → center-crop for the 1200×627 link card. Skip Stability/SD3.5 entirely (pricier, weaker, $1M-revenue license cliff).

---

## 10. Decision records (what changed vs the PDF, and why)

| # | Decision | PDF said | We do | Why (verified 11 Jun 2026) |
|---|---|---|---|---|
| D1 | Image model | FLUX.1 schnell | **FLUX.2 klein 4B (fal.ai)** | Newer Apache-2.0 model, ₹0.48/img, sub-second |
| D2 | X publishing | Chrome automation | **⚠ OPEN — recommend official API** | X pay-per-use launched Feb 2026 ($0.015/post); browser route = ToS-prohibited + 2026 ban waves hitting *founder* accounts; old "$200/mo" rationale obsolete |
| D3 | LinkedIn entry | (assumed review needed) | **Personal-profile posting is self-serve, immediate** | `w_member_social` = open permission; only company pages need review |
| D4 | Interim Brain | — | Together Qwen3-235B-A22B-Instruct + Groq fallbacks | §6 |
| D5 | DB access | — | Direct SQLAlchemy/asyncpg; supabase-py for Storage/Auth only | PostgREST awkward for vector SQL + GUC pattern |
| D6 | Pooler | — | Session pooler 5432 only | Transaction pooler breaks prepared statements with LangGraph checkpointer (documented bug) |
| D7 | Hindi in images | GPT Image 2 / Imagen | Pillow font overlay (V1); Nano Banana Pro escape hatch | Only NBP credibly renders Devanagari; overlay is free + pixel-perfect |

---

## 11. ⚠ Open decision for the founder (blocks nothing in Phase 1)

**X route at go-live:** (a) **Official API** — ~$1–12/founder/mo, zero ban risk, fully sanctioned *(recommended)*; or (b) **Browser automation per the PDF** — ₹0/post but ToS-prohibited, harshest-ever 2026 enforcement, suspension risk lands on the founder's personal account. Phase 1 stubs are built to the API shape either way; the browser adapter remains a documented fallback behind the same interface. Decide before Phase 2 ends.

---

## 12. Build sequence (Phase 1 slices — each: propose → ⛔ approve → build → demo)

1. **1.1 Schemas** — every contract in §4 + validation tests.
2. **1.2 Intake** — API + partial save + 100%-complete hard gate + Supabase tables/migrations.
3. **1.3 Analysis graph** — LangGraph skeleton + checkpointer + model layer + 3 agents + synthesizer + **Gate 1**.
4. **1.4 Generation** — Content Agent (platform formats + link policy) + Photo Funnel (fal.ai) + cost metering.
5. **1.5 Approval gate** — interrupt + per-platform approve/reject + silence-expiry + regenerate-with-note (capped) + ApprovalEvent.
6. **1.6 Publishers** — interface + 3 stub adapters with live shapes + real Export adapter + idempotency.
7. **1.7 Audit** — append-only audit + post log + founder-facing status.

Exit: one continuous run, intake → export, everything logged; adversarial multi-agent code review before sign-off.

---

## 13. Cost summary (current verified prices, INR @ ~₹88–95/USD)

| Line | Monthly (5 founders, 3 batches/wk) |
|---|---|
| Text LLMs (primary + small) | ~$3.30 (~₹300) |
| Images (~60/mo @ klein) | ~$0.30 (~₹30) |
| Supabase | ₹0 (free tier) → $25/mo at Phase 3 |
| LangSmith | ₹0 (5k traces free) |
| X API (if chosen, 5 founders) | ~$5–60 depending on URL posts |
| **Total Phase 1 dev** | **< ₹500/month** + one-time $5 Together minimum |

---

## 14. What the founder provides, and when

| When | What | Time |
|---|---|---|
| Before Slice 1.3 | Together AI account + API key ($5 min credit) · Groq account + key (free) | ~10 min |
| Before Slice 1.2 | Supabase account + project created | ~5 min |
| Before Slice 1.4 | fal.ai account + key | ~5 min |
| Phase 2+ | LinkedIn developer app · X console · Meta Business verification (start paperwork early) | guided |

---

*End of architecture. Approval of this document unlocks Slice 1.1.*
