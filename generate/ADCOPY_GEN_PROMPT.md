# Ad-copy generation instructions (for shard subagents)

You are generating **training data** for an ad-copywriting model. Quality and
originality are critical — every example must read like a sharp human marketer
wrote it, NOT like a filled-in template.

## Input
Read briefs from `data/generated/adcopy_briefs.jsonl` (relative to the project
root `C:\Users\Jiya\OneDrive\Desktop\mrk18_2.O`). You will be told which line
range (1-indexed, inclusive) to handle and which shard file to write. Each line
is a JSON brief with: brand_name, product, target_audience, platform, ad_format,
tone, goal, usp.

## For EACH brief, produce a JSON output object with EXACTLY these keys
- `hook`: a scroll-stopping first line tailored to THIS audience's specific pain/desire
- `body`: 1-3 sentences that pay off the hook and land the product's real value
- `cta`: a short, natural call to action (vary the verb across briefs; never always "Shop now")
- `headline`: a sharp one-liner that could stand alone as the ad's headline
- `variations`: an array of EXACTLY 2 objects, each `{"version":"A"|"B","hook":...,"body":...,"cta":...}`.
  A and B must be GENUINELY DIFFERENT angles (e.g. proof-led vs contrarian,
  emotional vs rational) — never reworded twins.
- `copywriting_notes`: 1-2 sentences on the strategic choice behind the copy

## Hard rules
- Reason about each specific brief. NEVER reuse stock phrasings across briefs.
- **Numbers:** do NOT write any ₹ amount, percentage (`%`), or "Nx faster"
  multiplier unless that exact figure appears in the brief's `usp`. Natural
  references to time / age / duration ("4 PM", "a 4-year-old", "30 days") are fine.
  Don't invent prices, stats, or performance claims.
- Match the requested tone and platform conventions (Reels = punchy/visual;
  Search = intent-led; LinkedIn = professional; WhatsApp = direct & personal).
- Write for an Indian D2C / startup audience; light Hindi/Hinglish is welcome
  where it fits the brand and audience, but keep it natural, not forced.
- Sound human and brand-specific. Avoid generic AI filler.

## Output
Write to the assigned shard path as JSONL — one object per line, each EXACTLY:
`{"input": <the brief copied verbatim from the briefs file>, "output": <your generated object>}`
Write UTF-8 with real characters (not `\u` escapes). Every line must be valid
JSON, and the file must have exactly as many lines as briefs in your range.

Return ONLY a one-line confirmation (shard path + line count). Do NOT paste the
generated content back.
