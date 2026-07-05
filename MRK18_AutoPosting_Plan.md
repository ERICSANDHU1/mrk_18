# MRK18 — Auto-Posting & Connected-Account Plan

> Live research (Jun 2026) on LinkedIn / X / Reddit posting + ad-data fetch + a plan-ahead
> scheduler, scoped to the **10-user, investor-ready** MVP. Vision researched: *founder connects
> account → system fetches ad/performance data → analyzes → weekly refresh → founder plans a
> 10/20/30-day calendar once → the `ad_copy` AI adapter drafts → system auto-publishes.*

---

## The one mental-model fix

**Posting ≠ Reading their ad data.** They are two different products, with two different approvals,
at very different difficulty:

- **Posting on their behalf** → *easy / instant* (LinkedIn personal feed needs only a self-serve
  scope, no review).
- **Reading their past ad campaigns** → *hard / slow* → a **separate** API (LinkedIn
  Marketing/Advertising API) behind a **formal approval that takes weeks-to-months**, and only
  works if the founder actually has an ad account and grants a role.

So the hardest assumption — *"connect → instantly auto-fetch all past ad history and analyze"* — is
the one part that **isn't instantly possible.** The posting and the AI drafting (the `ad_copy`
adapter) are the easy parts.

---

## What you need FROM the user, per platform

| Platform | To POST for them | To READ their data | Prerequisite they must have | Instant? |
|---|---|---|---|---|
| **LinkedIn** | OAuth: `w_member_social` + `openid`/`profile` (self-serve, **no review**) | Ad data needs `r_ads` + `r_ads_reporting` + **Marketing API approval (weeks–months)**. Personal post-analytics API is **closed**. | An **ad account** (for ad data); a **Company Page + admin role** (for org posting) | Posting ✅ · Ad data ❌ |
| **X (Twitter)** | Paid API — **pay-per-use: $0.015/post, $0.20 if it has a link** | Reads $0.005 each (Free tier = no reads) | A billing relationship (yours or theirs) | ✅ but **paid** |
| **Reddit** | OAuth: `identity` + `submit` + `read`; **mandatory app pre-approval since Nov 2025** | Reddit Ads API = separate allow-list | Account with sufficient **age + karma** or posts auto-removed | ⚠️ ban-risky |

---

## Your vision, point by point — what's real

1. **"Auto-fetch all past ad history on connect"** → ⚠️ **Not on day one.** Needs the separate
   ad-API approval (LinkedIn: weeks–months) + the founder must have an ad account. **For the demo:**
   pull *organic* post performance (available) + offer a **one-time manual CSV import** of past ad
   data. Make live ad-ingestion a *roadmap* item, not an MVP blocker.
2. **"Weekly real-time fetch"** → ✅ **Doable** (a recurring background job). Caveats: tokens need
   refresh, and ~once a year the user must **re-connect** (refresh tokens expire); X reads cost
   money; LinkedIn personal analytics has no API.
3. **"Plan 10/20/30 days once, then auto-post"** → ✅ **Yes — as "approve-then-auto," not
   unattended.** The founder approves the whole calendar **once**; the system auto-publishes on
   schedule with an edit/pause window. Fully unattended posting violates ToS and gets accounts
   banned. It's also the better investor story.
4. **"Reddit auto-post"** → ❌ **Don't.** Reddit's anti-spam rules name automation as a violation,
   ~96% of manipulation is auto-detected, and the banned account is **your customer's**. Do
   **draft-and-assist** (AI writes Reddit-native posts + suggests subreddits; the human posts).

---

## What you're missing (the addons the research surfaced)

- **X costs real money now** — the **$0.20-per-link-post** detail is brutal for a marketing tool
  (a post linking to their site is 13× a plain post). Put it in your unit economics.
- **Reddit needs app pre-approval** (since Nov 2025) *and* the founder's account needs karma/age —
  screen it at connect time.
- **LinkedIn personal post analytics API is closed** — you cannot read "how my posts performed" via
  API. Org Pages can, with approval.
- **Yearly re-consent** — refresh tokens die at ~365 days; build a "reconnect LinkedIn" nudge.
- **DPDP (India):** storing their OAuth tokens + audience data makes you a Data Fiduciary → need
  consent + encryption (you have the vault) + a **data-processing agreement** with any vendor.
- **AI-content disclosure** — EU labeling rules land Aug 2026; add a disclosure toggle now.

---

## The architecture — you already have ~80%

Your backend already has the hard parts: the **arq cron worker**, the **encrypted token vault**,
**idempotent publishing** (`request_id` + a unique constraint), and the **Gate-2 signed-approval**
machinery (re-verified at publish time). To build the full vision you only need:

1. A **`content_calendar` + `scheduled_posts`** table (the calendar).
2. A **"publish due posts" cron** — runs every minute, claims due rows
   (`status='scheduled' AND scheduled_at <= now()`, `FOR UPDATE SKIP LOCKED`), publishes,
   idempotent via `request_id`.
3. A **weekly per-account fetch cron** — feeds the existing `signals` / `analytics_diagnoses` tables.
4. A **`refresh_access_token()`** function — the one genuine gap (the vault stores refresh tokens
   but there's no refresh-exchange yet).
5. **One publisher adapter** (you have stubs).

> Net: two cron jobs, one table, one function, one adapter — and every brand-safety guarantee
> (signed approvals, publish-time re-verification, fast revocation) is preserved unchanged.

**Suggested data model:**
- `content_calendar(calendar_id, founder_id, run_id, name, horizon_days, timezone, approval_state, approved_at, …)`
- `scheduled_posts(scheduled_post_id, founder_id, calendar_id, item_id, platform, scheduled_at[UTC], status, approval_state, approval_event_id, request_id[unique], attempts, next_attempt_at, last_error, publish_result_id, locked_at, …)`
- Add `connected_accounts.last_metrics_fetch_at` (the weekly-fetch cursor). `signals` + `analytics_diagnoses` need no changes.

---

## Build vs buy

| Provider | LinkedIn + X + Reddit posting | Analytics | Skips per-platform approval? | Self-host | Pricing |
|---|---|---|---|---|---|
| **Ayrshare** | Yes | Yes (organic; verify ad reporting) | **Yes — posts under their approvals** | No (SaaS) | Premium $149/mo · Business ~$499–599/mo (~30 profiles) |
| **Postiz** (OSS) | Yes (28+) | Limited | **No — you bring your own apps** | Yes | Free self-host |
| **Mixpost** (OSS) | Yes | Basic | **No** | Yes | One-time license |
| **Phyllo** | **Read-only analytics — no publishing** | Yes | n/a | No | SaaS |

**Why buy for the pilot:** LinkedIn posting-to-Pages and ad data sit behind partner approvals
(weeks-to-months, sometimes $10k–50k/yr for partnerships); X is now pay-per-use/Enterprise; only
Reddit is genuinely easy to build direct. A unified provider gets you LinkedIn + X posting **under
their approvals** in days. **Caveat:** verify Ayrshare's *paid-ad* reporting coverage before
promising ad-data features — deep ad reporting is sometimes still gated by the ad platform even via
a vendor.

---

## Recommendation — the 10-user, investor-ready MVP

1. **Build vs buy → BUY Ayrshare** for the pilot (~$149–599/mo). Your adapters are already a
   pluggable `Protocol`, so an `AyrshareAdapter` drops in; go direct later at scale. Sign a DPA.
2. **Platforms first → LinkedIn personal posting** (instant, best for B2B founders) **+ X
   pay-per-use** (no monthly minimum). **Skip Reddit auto-post at launch** (draft-and-assist only).
3. **Model → approve-the-calendar-once → auto-publish with an edit/pause window** (reuses Gate-2).
4. **Analytics → organic now; ad-data = roadmap + one-time manual CSV import** for the demo.

This ships in days, won't get your design partners banned, is DPDP-defensible (encrypt tokens +
consent + DPA), and tells a clean "autonomous CMO" story to investors.

---

## Sources

- LinkedIn — Share on LinkedIn (self-serve `w_member_social`); Sign In with OpenID Connect; Posts API; Community Management app review; Marketing/Advertising API tiers; programmatic refresh tokens; API rate limits; API Terms of Use (Microsoft Learn / LinkedIn Legal).
- X / Twitter — API pricing 2026 (pay-per-use $0.015/post, $0.20/link-post; legacy Basic/Pro closed to new signups); X automation development rules.
- Reddit — Responsible Builder Policy (mandatory pre-approval, Nov 2025); Spam / self-promotion policy; OAuth2 scopes + submit endpoint + User-Agent rules; Reddit Ads API allow-list.
- Architecture — arq docs; Postiz / Mixpost scheduler patterns; distributed-job-scheduler best practices (two-tier cold/hot, idempotency keys, FOR UPDATE SKIP LOCKED).
- Build vs buy — Ayrshare pricing & docs; unified social-API comparisons (Buffer, Outstand); Phyllo (analytics-only); Unipile (LinkedIn-centric).
- Compliance — India DPDP Act 2023 + Rules 2025 (notified Nov 2025); EU AI Act Article 50 / AI-content labeling Code of Practice (Aug 2026).
