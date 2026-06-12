# MRK18 Incident Response Runbook

> Print this. When it's needed, the dashboard may be the thing on fire.

**Owners:** both co-founders are incident commanders. Whoever sees it first runs it;
the other is notified immediately — no incident has one pair of eyes.

**India's legal clocks start at confirmation, not at convenience:**

| Obligation | Deadline | Who |
|---|---|---|
| **CERT-In** incident report (cyber incident categories incl. data breach, unauthorized access) | **6 hours** from noticing | incident-report@cert-in.org.in |
| **Data Protection Board of India** + each affected founder (DPDP Act 2023 — breach of personal data) | without delay, as prescribed | via DPB portal + direct email to founders |
| Affected platform (LinkedIn/X/Meta) if their tokens were exposed | per platform ToS, immediately after revocation | developer support channels |

---

## Severity levels

- **SEV-1** — confirmed cross-tenant data exposure, leaked credentials/tokens, audit
  chain broken, or anything published without approval. *All hands, clocks running.*
- **SEV-2** — strong signal, unconfirmed: siren fired (`SECURITY ALERT` CRITICAL log /
  webhook), repeated `authz_denied` from one account, anomalous rate-limit alarms.
- **SEV-3** — hardening gap found before exploitation (failed sweep, dependency CVE).

## 1 · Detect

Signals, in order of trust:
- the **siren**: CRITICAL `SECURITY ALERT` log lines / `ALERT_WEBHOOK_URL` posts —
  every one is one of: `publish_refused_no_valid_approval`, `publish_refused_permission`,
  `publish_refused_step_token`, `authz_denied`, `rate_limit_exceeded`, `founder_erased`.
- **chain verification**: `POST /maintenance/verify-audit-chain` (X-Maintenance-Key) —
  `ok: false` with a break list = history was rewritten = SEV-1, no further triage.
- founder reports ("I never approved this post").

First five minutes: screenshot/copy the alert, note UTC time, open an incident doc
with a running timeline. Every action below gets a timestamped line.

## 2 · Contain (stop the bleeding before studying it)

In order, skip nothing that applies:

1. **Platform tokens at risk** → revoke per founder:
   `DELETE /founders/{id}/connections/{platform}` — destroys ciphertext AND cancels
   pending publishes in <60 s. For all founders: loop it; there is no bulk approve,
   but there IS bulk revoke via script.
2. **Auth compromise suspected** (leaked JWT signing keys / Supabase breach) →
   Supabase dashboard → Auth → rotate signing keys; sessions die, founders re-login.
3. **APPROVAL_SIGNING_KEY leaked** → rotate the env var and restart. Effect: old
   review links die instantly; previously signed ApprovalEvents stop verifying — items
   already approved must be re-approved (acceptable: an attacker with this key could
   forge approvals, so old signatures are worthless anyway).
4. **TOKEN_VAULT_KEY leaked** → rotate = re-wrap DEKs (the envelope design makes this
   cheap — DEKs are re-wrapped, tokens are NOT re-encrypted). Until re-wrap completes,
   set the old key offline; publishing pauses (export mode still works).
5. **Database credentials leaked** → Supabase dashboard → reset database password;
   update `DATABASE_URL`/`CHECKPOINTER_DSN`; restart. RLS limits blast radius only if
   the leaked credential was NOT the postgres superuser — assume worst.
6. **Kill switch** (active exploitation, unknown vector) → stop the API service.
   Founders lose the dashboard; they do not lose data. Down beats leaking.

## 3 · Assess scope (the audit log is built for this hour)

- `POST /maintenance/verify-audit-chain` → which scope broke, at which row id.
- Query `audit_log` for the window: every `security_alert`, every `authz_denied`
  (it records the authenticated attacker's founder_id + path), every publish event.
- Per affected founder: `GET /founders/{id}/data-export` = exactly what they're owed
  under right-to-access = exactly what may have leaked. Two birds.
- Check `publish_results` for anything with a `public_url` you can't explain.

## 4 · Notify (see clock table above)

CERT-In within 6 hours of *noticing* — a two-line email beats a late perfect one.
Then DPB + affected founders: what leaked, when, what we did, what they should do
(revoke platform sessions, watch for impersonation). Honesty is the brand; the
bitter-truth company does not soften its own breach notice.

## 5 · Eradicate & recover

- Patch the vector; add the regression test that would have caught it (the attack
  suites in `tests/test_auth.py`, `test_agent_sandbox.py`, `test_perimeter.py` are
  where it goes — every past attack is a permanent test).
- Re-run the full suite + `verify-audit-chain` clean before re-enabling publishing.
- Reconnect founders' platforms (they re-OAuth — we never had their passwords).

## 6 · Post-mortem (within 72 h, blameless, written)

Timeline · root cause · what the system caught vs. missed · which alarm fired first ·
what gets built next. Append the doc to this file's directory; update this runbook
if any step was wrong or missing.

---

### Quick reference

| Thing | Where |
|---|---|
| Chain verify | `POST /maintenance/verify-audit-chain` + `X-Maintenance-Key` |
| Expire stale approvals | `POST /maintenance/expire-stale-approvals` + key |
| Revoke a connection | `DELETE /founders/{id}/connections/{platform}` |
| Per-founder data inventory | `GET /founders/{id}/data-export` |
| Erasure (right or remedy) | `DELETE /founders/{id}` — 7-day DPDP SLA, instant in practice |
| Siren config | `ALERT_WEBHOOK_URL` in `.env` |
| CERT-In | incident-report@cert-in.org.in · https://www.cert-in.org.in |
