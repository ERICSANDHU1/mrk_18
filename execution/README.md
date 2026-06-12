# MRK18 Execution System

> **The Brain thinks and commands. Engines execute.**

This is the execution engine of MRK18 — the AI CMO for Indian startup founders. It takes a founder's intake, runs the analysis agents, generates platform-native content, enforces **mandatory human approval gates** (silence = rejection, no approve-all), publishes, and learns from outcomes.

**Read first:** [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) — the approved blueprint. No code merges that contradict it.

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Architecture lock + scaffold | ✅ this commit |
| 1 | Execution workflow (intake → analysis → gates → generation → stub-publish + real export) | ⛔ awaiting blueprint approval |
| 2 | Security pipeline (S1–S5 + DPDP) | ✅ complete — vault · RLS enforcing · JWT auth · agent sandbox · perimeter + hash-chained audit · DPDP rights (access/correct/erase/withdraw) · [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) · sweep clean |
| 3 | Closed loop | ✅ complete — Eagle-View signals (3.1) · self-learning memo (3.2) · Company Brain RAG, free-tier (3.3) · Comment Agent (3.4). Run→measure→learn, all sandboxed |
| 3 | Closed loop (Eagle-View, Comment Agent, Company Brain RAG) | pending |
| 4 | Merge the trained Brain (vLLM multi-LoRA) | pending |

## Setup (dev)

```bash
cd execution
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -e ".[dev]"
copy .env.example .env                             # then fill in keys
pytest
```

## Iron rules encoded in this codebase

1. Nothing publishes without a verified `ApprovalEvent`. Enforced in the orchestrator AND re-checked in every publisher adapter — cryptographically: events are HMAC-signed over the exact approved content, adapters demand a fresh per-step token, and agents act only inside their permission manifests (deny by default).
2. Silence = rejection. No "Approve All". No auto-approve on timeout.
3. `schemas/` imports nothing from this package — everything depends on contracts, contracts depend on nothing.
4. Supabase connections use the session pooler (port 5432). Never 6543.
5. Tokens are never logged, never sent to the frontend, never plaintext.
6. The dashboard is a window, not a wall. Every founder-scoped request must carry a verified Supabase JWT, and ownership is enforced server-side: someone else's data → 403 + a `security_alert` audit row. Auth unconfigured → 503 (fail closed, never open).
