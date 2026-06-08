"""Generate a training dataset for one skill with the Claude API.

Pipeline: diverse inputs -> Claude (structured JSON output) -> quality gates ->
write raw {input,output} JSONL + Qwen ChatML JSONL.

Two modes:
  --mode sync   small synchronous run for eyeballing (default 20). Use this first.
  --mode batch  full run via the Batches API (50% cheaper, ~<1h). Use after review.

Usage:
  pip install -r requirements.txt
  set ANTHROPIC_API_KEY=...                       (PowerShell: $env:ANTHROPIC_API_KEY="...")
  python -m generate.generate --skill adcopy --mode sync  --count 20
  python -m generate.generate --skill adcopy --mode batch --count 1000

Model defaults to claude-opus-4-8. Pass --model claude-sonnet-4-6 to cut cost ~40%.
"""

import argparse
import json
import os
import sys
import time

import anthropic

from .schemas import SKILLS
from .inputs import generate_inputs
from .quality_gates import run_gates
from .format_chatml import write_chatml

OUT_DIR = os.path.join("data", "generated")


def _request_params(brief: dict, skill_cfg: dict, model: str) -> dict:
    """One Messages-API request: cached system + brief, structured JSON output."""
    return {
        "model": model,
        "max_tokens": skill_cfg["max_tokens"],
        "system": [
            {
                "type": "text",
                "text": skill_cfg["system"],
                "cache_control": {"type": "ephemeral"},  # shared across all rows
            }
        ],
        "messages": [
            {"role": "user", "content": "Brand brief:\n" + json.dumps(brief, ensure_ascii=False)}
        ],
        "output_config": {
            "format": {"type": "json_schema", "schema": skill_cfg["schema"]}
        },
    }


def _parse_output(message) -> dict | None:
    text = next((b.text for b in message.content if b.type == "text"), None)
    if text is None:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def run_sync(client, briefs, skill_cfg, model) -> list[dict]:
    rows = []
    for i, brief in enumerate(briefs, 1):
        msg = client.messages.create(**_request_params(brief, skill_cfg, model))
        out = _parse_output(msg)
        if out is not None:
            rows.append({"input": brief, "output": out})
        print(f"  [{i}/{len(briefs)}] {brief['brand_name']:<16} "
              f"{'ok' if out else 'PARSE-FAIL'}", flush=True)
    return rows


def run_batch(client, briefs, skill_cfg, model) -> list[dict]:
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request

    requests = [
        Request(
            custom_id=f"row-{i}",
            params=MessageCreateParamsNonStreaming(**_request_params(b, skill_cfg, model)),
        )
        for i, b in enumerate(briefs)
    ]
    batch = client.messages.batches.create(requests=requests)
    print(f"  batch created: {batch.id} ({len(requests)} requests)")

    while True:
        batch = client.messages.batches.retrieve(batch.id)
        if batch.processing_status == "ended":
            break
        c = batch.request_counts
        print(f"  status={batch.processing_status} "
              f"processing={c.processing} succeeded={c.succeeded} errored={c.errored}",
              flush=True)
        time.sleep(30)

    by_id = {b: brief for b, brief in ((f"row-{i}", br) for i, br in enumerate(briefs))}
    rows, errored = [], 0
    for result in client.messages.batches.results(batch.id):
        if result.result.type != "succeeded":
            errored += 1
            continue
        out = _parse_output(result.result.message)
        if out is not None:
            rows.append({"input": by_id[result.custom_id], "output": out})
    print(f"  batch done: {len(rows)} parsed, {errored} errored")
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--skill", default="adcopy", choices=sorted(SKILLS))
    ap.add_argument("--mode", default="sync", choices=["sync", "batch"])
    ap.add_argument("--count", type=int, default=20)
    ap.add_argument("--model", default="claude-opus-4-8")
    ap.add_argument("--seed", type=int, default=18)
    args = ap.parse_args(argv)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ERROR: set ANTHROPIC_API_KEY first.")

    skill_cfg = SKILLS[args.skill]
    os.makedirs(OUT_DIR, exist_ok=True)
    client = anthropic.Anthropic()

    print(f"[1/4] building {args.count} diverse '{args.skill}' briefs...")
    briefs = generate_inputs(args.count, seed=args.seed)

    print(f"[2/4] generating with {args.model} (mode={args.mode})...")
    runner = run_sync if args.mode == "sync" else run_batch
    rows = runner(client, briefs, skill_cfg, args.model)

    print(f"[3/4] running quality gates on {len(rows)} rows...")
    required = list(skill_cfg["schema"]["required"])
    passed, report = run_gates(rows, required)
    print("  " + json.dumps(report, ensure_ascii=False))

    print(f"[4/4] writing outputs ({len(passed)} passed)...")
    raw_path = os.path.join(OUT_DIR, f"{args.skill}_{len(passed)}_raw.jsonl")
    fmt_path = os.path.join(OUT_DIR, f"{args.skill}_{len(passed)}_chatml.jsonl")
    with open(raw_path, "w", encoding="utf-8") as f:
        for r in passed:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    write_chatml(passed, skill_cfg["system"], fmt_path)
    print(f"  raw   -> {raw_path}")
    print(f"  chatml-> {fmt_path}")
    print("done.")


if __name__ == "__main__":
    main()
