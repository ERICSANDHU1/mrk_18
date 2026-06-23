# MRK18 Experience Brain — case study corpus

This folder holds the **shared "experience" knowledge** every founder's analysis
draws from (RAG roadmap, Tier 1/2). Put one JSON case per file in `cases/`, then
seed them:

```bash
cd execution
python scripts/seed_experience.py     # idempotent — replaces by `ref`
```

## The quality bar (this is the moat)
Every case must have **situation → action → OUTCOME → lesson**, with numbers.
A tactic without an outcome is trivia, not experience.

- ❌ *"Brand X ran Meta ads."*
- ✅ *"Brand X scaled Meta to ₹5L/mo, CAC held until frequency hit 3.2, then
  doubled; fixed with 8 creatives/week + a WhatsApp reorder flow — repeat rate
  was the real lever."*

**50 excellent Indian cases beat 2,000 thin ones.** India-first: INR, the real
channels (Meta, Google, WhatsApp, Amazon.in, Meesho, Blinkit), tier-1/2/3 reality.

## The schema (one file per case in `cases/`)
```json
{
  "ref": "case_0042",                         // unique, stable id — re-seeding replaces it
  "kind": "campaign_case",                     // campaign_case | benchmark | playbook | framework
  "category": "D2C skincare",                  // used to retrieve relevant cases
  "channels": ["Meta ads", "WhatsApp"],
  "stage": "scaling past ₹50L/month",
  "budget_band": "₹2-5L/month",
  "title": "Short, scannable headline of the case",
  "content": "The full narrative: who, the situation, what they did, what happened, the numbers. This is what gets embedded — write it as one readable paragraph or two.",
  "lesson": "The one transferable insight a CMO would carry forward.",
  "metrics": { "cac_before": 910, "cac_after": 520, "repeat_rate_after": 0.27 },
  "provenance": "reconstructed"                // internal | public | reconstructed
}
```

Only `ref`, `kind`, `title`, `content` are required. The rest sharpen retrieval.

## How it's used
At run time, the analysis agents retrieve the top ~5 most relevant cases (by
BGE-M3 cosine) and reason **from** them — precedent, not the founder's own data.
The cases' numbers never get copied into a founder's post as fact (guardrailed).
