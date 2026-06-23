# MRK18 — Backend Production Plan

> Living checklist to take the `execution/` backend to **production-secure + cleanly integrated**.
> Derived from the 15 Jun 2026 Production-Readiness Audit, updated for work already shipped.
> Scope: **backend only** (FastAPI + LangGraph in `execution/`). Frontend dashboard rebuild and the
> trained-model merge are tracked separately. Tick boxes as we go.

**Status:** **Tracks A + B + C COMPLETE** ✅ — the full production plan (security A1–A5 · integration B1–B4 · deploy/operate C1–C6). Backend live on Supabase · **263 tests green, 81% coverage** · containerized + worker + observability + backups + CI. Deploy steps await your Render/Redis/Sentry accounts.

---

## ✅ Already done (since the audit)

- [x] **CORS middleware** — browser SPA can call the API (was a HIGH risk).
- [x] **Provider-agnostic auth** — configurable JWKS / audience / issuer; **Clerk** wired (`AuthSubject` text column + migration, full suite green).
- [x] **Backend live on Supabase** — all 13 migrations applied; `founders.auth_user_id` is text; 200 tests pass.
- [x] **Intake integration** — Clerk-authed onboarding form → `/api/onboarding` → create founder → save intake → 100%-complete gate → rows in `founders` + `founder_profiles`.
- [x] **`GET /me`** — resolves the verified caller to their founder id.
- [x] **Clerk signup webhook** — `POST /webhooks/clerk` (Svix-signature verified, fail-closed) provisions a founder row the moment Clerk fires `user.created`; idempotent; 4 tests. *Needs the signing secret + a public URL (or dev tunnel) to fire.*

---

## 🔒 Track A — Security hardening (close the landmines) · ~1 week

*The audit's CRITICAL/HIGH security items. This is "full secure."*

- [x] **A1 · Fail-closed startup guard.** ✅ `APP_ENV=prod` refuses to boot without `AUTH_JWKS_URL`/`TOKEN_VAULT_KEY`/`APPROVAL_SIGNING_KEY` (`security/startup.py` + guard call in `create_app`, before any DB work). The publish path goes **strict** in prod: `publish_run(..., strict=True)` refuses the batch when the signing key is missing, instead of fail-open. Real `.env` verified prod-ready. 8 new tests; full suite **212 pass / 3 skip**.
  - Files: `security/startup.py` (new), `config.py` (`app_env`/`is_prod`), `api/app.py`, `publishers/service.py`, `api/runs.py`, `tests/test_startup_guard.py`, `tests/test_publishing.py`
- [x] **A2 · Complete DPDP erasure.** ✅ Added `SignalRow`, `PostCommentRow`, `KnowledgeChunkRow` to `_ERASE_ORDER` (Signal/PostComment before `ContentItemRow` — they FK to it; Knowledge before `FounderRow`). Proved the delete order + `ON DELETE CASCADE` under real FK enforcement via a `PRAGMA foreign_keys=ON` engine scoped to the retention suite (global enforcement surfaced 37 pre-existing fixture-ordering issues → flagged as a separate cleanup task). Added a DB-level cascade test + extended the erase test. Full suite **240 pass / 3 skip**.
  - Files: `security/retention.py`, `tests/test_retention.py`
- [x] **A3 · Fix audit-purge vs hash-chain.** ✅ `purge_audit_older_than` now REDACTS in place (blank content + `redacted=True`, keep `prev_hash`/`row_hash`) instead of hard-deleting — the only chain-safe option (gap-tolerant verification would defeat tamper-evidence). Lawful retention no longer looks like rewritten history; `verify_audit_chain` still passes (redacted rows skip the content recompute). New purge+verify test. Full suite **241 pass / 3 skip**.
  - Files: `security/retention.py`, `tests/test_perimeter.py`
- [x] **A4 · Content guardrails (PRD R-2/R-3).** ✅ Deterministic, LLM-free `guardrails/` module: `scan_input` (pre-LLM injection filter on founder free-text) + `check_content` (brand-safety/profanity, founder `do_not_claim` + `words_to_avoid`, and fabricated specifics — a price/coupon/% the founder never gave). Wired into `generate_item`'s retry loop: a violation feeds back and regenerates once; twice = hard fail, so nothing bad reaches Gate 2 (or, later, auto-publish). `do_not_claim`/`words_to_avoid` added to `FounderProfile` (optional; JSONB → no migration). 19 new tests; the real shipped Arc posts pass clean. Full suite **231 pass / 3 skip**.
  - Files: `guardrails/` (new), `schemas/founder.py`, `agents/content.py`, `tests/test_guardrails.py`
- [x] **A5 · Cost ceiling.** ✅ Centralized pricing in `llm/socket.cost_inr_for` with a non-zero `DEFAULT_PRICE_USD_PER_M` so an unknown/non-Groq model never silently meters ₹0 (added Together + Brain rate slots). Config `run_cost_cap_inr` (₹50) + `daily_cost_cap_inr` (₹500). `start_run` refuses with **429** once a founder's metered daily spend hits the cap; `_drive` is a per-run **circuit-breaker** that lands a run `failed` over the ₹ ceiling (bounds runaway regeneration). 8 new tests; full suite **239 pass / 3 skip**.
  - Files: `llm/socket.py`, `config.py`, `graph/lifecycle.py`, `api/runs.py`, `.env.example`, `tests/test_cost_cap.py`
- **Exit:** prod refuses to boot without crypto keys; erasure covers all personal tables with passing FK-cascade tests; audit chain verifies after a purge; generated copy passes guardrails; a run aborts over budget. New `test_guardrails`, `test_cost_cap`, expanded `test_retention` — full suite green.

---

## 🔌 Track B — Integration completeness (clean frontend seam) · ~3–4 days

- [x] **B1 · HTTPBearer security scheme** ✅ Added an `HTTPBearer` (`BearerJWT`) scheme through `get_verified_claims` (auto_error=False — the 401/503 semantics stay authoritative; robust to both DI and direct-call sites). `/docs` now shows Authorize and every founder/run-scoped op carries the security requirement in OpenAPI. 3 OpenAPI tests. Full suite **244 pass / 3 skip**.
  - Files: `api/deps.py`, `tests/test_openapi.py`
- [x] **B2 · `GET /founders/{id}/runs`** ✅ Owner-scoped (founder_scope = ownership + RLS), newest-first, paginated (`limit`/`offset`). Lightweight `RunSummary` (no report blob). 5 tests incl. cross-tenant 403.
  - Files: `api/runs.py`, `tests/test_runs_list.py`
- [x] **B3 · Machine-readable status enums** ✅ Public `GET /meta/statuses` surfaces run/content/publish/approval enum values, terminal sets, and the content state machine (serialized from `ALLOWED_TRANSITIONS`, so it never drifts). One UI source of truth. 2 tests.
  - Files: `api/meta.py` (new), `api/app.py`, `tests/test_meta.py`
- [x] **B4 · Run progress** ✅ `GET /runs/{id}/progress` — a cheap polling target: status + human phase label + `terminal` flag + `awaiting` (`"gate1"`/`"gate2"`/null), no report blob. 3 tests. (Frontend can move its 4s `/runs/{id}` poll onto this.)
  - Files: `api/runs.py`, `tests/test_runs_list.py`
- **Exit:** a cross-origin authenticated request from the SPA succeeds; `/docs` shows Authorize; list-runs returns history; run progress is observable. Integration tests for new endpoints.

---

## 🚀 Track C — Deploy & operate (runnable, observable, recoverable) · ~1 week

*Code can be written now; a few steps need accounts at deploy time (flagged).*

- [x] **C1 · Containerize** ✅ Multi-stage `Dockerfile` (non-root, healthcheck, uvicorn `--factory`) + `.dockerignore`; `worker`/`observability` extras in pyproject. The same image runs the worker.
- [x] **C2 · Deploy manifest** ✅ `render.yaml` — web + ARQ worker + Redis, shared env group, secrets as dashboard-set `sync:false`. *(deploy needs a Render account)*
- [x] **C3 · Background worker** ✅ ARQ worker (`worker/`) with cron jobs: **run auto-resume** (re-drives runs orphaned by a restart from their LangGraph checkpoint — resume logic tested), stale-approval expiry, signal pulls, daily audit-chain verify. 4 resume tests. *(running needs Redis, e.g. Upstash)*
  - Files: `worker/` (new), `graph/lifecycle.py`, `tests/test_worker.py`
- [x] **C4 · Observability** ✅ Optional Sentry (no-op without DSN), Prometheus `/metrics` (behind the maintenance key), `/readyz`, version in `/health`. 4 tests. *(Sentry needs a DSN)*
- [x] **C5 · Backups** ✅ `scripts/backup.sh` + `restore.sh` + a restore runbook; a startup schema-health check logs CRITICAL if the DB is behind its migrations. 1 test.
- [x] **C6 · CI hardening** ✅ GitHub Actions: ruff + pytest with a **≥75% coverage gate** (now at 81%) + a Postgres service ready for PG-backed RLS tests.
  - Files: `.github/workflows/execution-ci.yml`, `pyproject.toml`
- **Exit:** `docker build` + run locally; one-command deploy with rollback; timed jobs run; incidents observable; backup→restore proven; CI green on Postgres.

---

## Sequence & decisions

- **Order:** **A → B → C** (secure the core → finish the integration seam → make it deployable).
- **A and B** run entirely now against the live Supabase. **C's code** is writable now; its deploy steps need accounts (Render / Redis / Sentry) — flagged inline.
- **Open decisions (Track C, not blocking A/B):**
  - [ ] Deploy host — assume **Render**?
  - [ ] Worker/queue — assume **ARQ + Redis (Upstash)**?
- **Method:** one item at a time — build → run tests → show green → next.

---

## Out of scope here (tracked elsewhere)

- Frontend dashboard rebuild on the real product (intake → runs → Gate-1/2 → publish UI).
- Phase 4 model merge (trained Brain + RAG behind the existing seam).
- Phase 5 scale/channels (Redis-backed limiter, live publishing transports, Indic generation, Meta Ads/Reels, k6 load test, full compliance posture).

_Last updated: June 2026. Update the boxes as each item lands._
