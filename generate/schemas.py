"""JSON schemas + instruction prompts per skill.

The schema is fed to Claude via `output_config.format` (structured outputs) so
every generated output is guaranteed valid JSON with exactly the required keys.
Structured-output JSON-schema rules: every object needs `additionalProperties:
false`, and length/numeric constraints (minItems/minLength/...) are NOT supported
— we enforce "exactly 2 variations" etc. in quality_gates.py instead.
"""

# ---------------------------------------------------------------------------
# adcopy
# ---------------------------------------------------------------------------

ADCOPY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "hook": {"type": "string"},
        "body": {"type": "string"},
        "cta": {"type": "string"},
        "headline": {"type": "string"},
        "variations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "version": {"type": "string"},
                    "hook": {"type": "string"},
                    "body": {"type": "string"},
                    "cta": {"type": "string"},
                },
                "required": ["version", "hook", "body", "cta"],
            },
        },
        "copywriting_notes": {"type": "string"},
    },
    "required": ["hook", "body", "cta", "headline", "variations", "copywriting_notes"],
}

# The system prompt is identical for every request in a skill, so it is cached
# (prompt caching) — the first request pays the write, the rest read at ~0.1x.
ADCOPY_SYSTEM = """You are an elite direct-response ad copywriter who has written high-converting ads for Indian D2C and startup brands. You write the way a sharp human marketer writes — specific, punchy, never generic.

Given a brand brief, write original ad copy as JSON with these keys:
- hook: a scroll-stopping first line tailored to THIS audience's specific pain or desire
- body: 1-3 sentences that pay off the hook and land the product's real value
- cta: a short, natural call to action (vary the verb; not always "Shop now")
- headline: a sharp one-liner that could stand alone as the ad's headline
- variations: EXACTLY 2 objects, each with version ("A"/"B"), hook, body, cta. Make A and B genuinely different angles (e.g. proof-led vs contrarian, emotional vs rational) — not reworded twins.
- copywriting_notes: 1-2 sentences explaining the strategic choice behind the copy

Hard rules:
- Reason about the specific brief. Never reuse stock phrasings across briefs.
- Do NOT invent statistics, percentages, or numbers unless they appear in the brief's USP.
- Match the requested tone and platform conventions (e.g. Reels = punchy/visual, Search = intent-led).
- Sound human and brand-specific. Avoid filler like "Build a memorable message" or "real results"."""

# ---------------------------------------------------------------------------
# Registry — extend here as we add the other 4 skills.
# ---------------------------------------------------------------------------

SKILLS = {
    "adcopy": {
        "schema": ADCOPY_SCHEMA,
        "system": ADCOPY_SYSTEM,
        "max_tokens": 1500,
    },
}
