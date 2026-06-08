# Dataset generation pipeline

Regenerates the MRK18 training data with **real Claude reasoning** per brief
(the reference data was template slot-filled — 99% repeated sentences) and emits
**Qwen3 ChatML** (the reference used the wrong Mistral `[INST]` format).

Currently implemented for the **adcopy** skill; the other four (analytics, brand,
content, gtm) plug into the same pipeline by adding an entry to `SKILLS` in
`schemas.py` + a brief generator in `inputs.py`.

## Files
| File | Role |
|---|---|
| `schemas.py` | JSON output schema + system instruction per skill (the cached, shared prompt) |
| `inputs.py` | wide-entropy, India-centric brief generator (1000 unique briefs, ~800 brand names) |
| `generate.py` | orchestrator: inputs → Claude (structured JSON) → gates → write |
| `quality_gates.py` | key check, sentence dedup (>40%), no-invented-numbers flag |
| `format_chatml.py` | Qwen3 `<|im_start|>` ChatML formatter |

## Run
```powershell
pip install -r ..\requirements.txt
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# 1. Small synchronous run to eyeball quality (do this FIRST)
python -m generate.generate --skill adcopy --mode sync --count 20

# 2. Full run via the Batches API (50% cheaper, ~<1h)
python -m generate.generate --skill adcopy --mode batch --count 1000
```

Outputs land in `data/generated/`:
- `adcopy_<n>_raw.jsonl` — `{input, output}` for inspection
- `adcopy_<n>_chatml.jsonl` — Qwen3 ChatML, ready for LoRA training

Model defaults to `claude-opus-4-8`. Pass `--model claude-sonnet-4-6` to cut cost ~40%.
```

## Notes
- The system instruction is identical across all rows, so it's **prompt-cached** —
  only the first request pays the write, the rest read at ~0.1×.
- `output_config.format` (structured outputs) guarantees valid JSON — no parsing roulette.
- `variations` must contain exactly 2 items; enforced in `quality_gates.py` (JSON
  schema can't express the count constraint).
