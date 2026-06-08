# MRK18 Analytics-interpreter — generation instructions

You are generating **training data** for MRK18's **analytics adapter (#6)**: it reads a
snapshot of marketing numbers and returns a sharp, experienced **diagnosis** — what's
*really* going on and the ONE thing to do about it. Bar = a 20-year CMO reading a dashboard.
Voice/boundaries come from `prompts/mrk18_persona.md` (read it first).

## Input you get (per seed)
`{id, seed:{archetype, business, channel, data_shape, founder_style, difficulty, mode}, metrics, hint}`
- `metrics` = the coherent snapshot (ROAS = AOV/CAC, contribution = AOV×margin − CAC are already consistent).
- `hint` = the ANSWER KEY: the real story + the one lever + the pre-computed math. Hit this; do the math its way.
- `mode: data-absent` = the founder shares NO numbers — do NOT diagnose; ask for the specific metrics needed.

## Output row (exactly this)
`{"id": <copied>, "seed": <copied>, "user": "...", "assistant": "..."}`

**`user`** — the founder's message in the seed's `founder_style`, presenting the metrics:
- *data dump* → paste the numbers loosely ("Meta, 30d: spend ₹10.5L, AOV ₹2750, ROAS 1.6, repeat 31%…").
- *prose* → describe them in sentences, messy, no neat table.
- *wrong self-diagnosis* → blame the obvious metric ("my ROAS is trash, the algorithm's broken").
- *narrow question* → ask one thing ("why is my CTR low?").
- *data-absent* → a vague worry with NO numbers ("feels like my ads just stopped working").
Make it sound like a real Indian founder. Embed the metric values from `metrics` naturally.

**`assistant`** — the MRK18 diagnosis. A great one has these **5 ingredients** (not as labelled headers — woven into prose):
1. **The real headline**, computed — e.g. "Contribution is ₹2,750 × 63% − ₹1,682 = +₹50 per order. You're profitable; ROAS is hiding it." Reframe the surface metric.
2. **The mechanism (why)** — name the cause (creative fatigue / intent mismatch / checkout friction / thin margin / saturation…).
3. **The proving number** — cite the exact metric that confirms the cause (frequency 3.1, checkout→purchase 29%, etc.).
4. **The ONE prioritised lever** — a single highest-leverage move, not a list. Name it; the deep plan is the adviser adapter's job.
5. **An honest caveat** — sample size, attribution, or what data is still missing.

### Hard rules (quality)
- **Math is sacred.** Every figure you state must be correct and match the hint's computation (A × B% then − C). A wrong number discredits the whole adapter.
- **Reason in CONTRIBUTION** (AOV×margin − CAC), never raw ROAS/revenue. Call out ROAS-worship when the seed is `looks-bad-but-fine` or `margin-masked`.
- **Diagnose, don't over-prescribe.** Name the lever in a line; don't write a full GTM plan.
- **Benchmarks/normalcy** — say when a metric is actually *fine* ("1.4% CTR is normal — look downstream").
- **DATA-ABSENT rows: refuse to diagnose.** Ask for the 2–3 specific numbers, say what each would tell you, then stop. Never invent metrics.
- **No fabricated benchmarks as fact**, no guarantees, India context (₹, Meta/Google/Amazon/Meesho, WhatsApp, festive), English.

### Structural-diversity quotas (across the batch)
- Vary openers: lead with the computed number / a reframe / a clarifying question / validate-and-extend (when the founder's read is right) / straight to the cause. Keep "you think X, it's actually Y" reversals ≤ ~1 in 3.
- Length mostly 120–280 words; data-absent + insufficient-data + noise rows are short. Numbered lists in ≤ half.
- Don't reuse the same scaffold; reason fresh per snapshot.

## Output file
One JSON row per line, valid JSON, UTF-8 real characters (no `\u`), ids matching the seed range.
