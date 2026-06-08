"""Merge CMO conversation shards (+ the gold batch_01) into the final dataset.

Reads every data/generated/_convo_shards/cmo_shard_*.jsonl plus the existing
data/generated/batch_01.jsonl, dedups by id and by identical user text, runs the
conversational quality gates, and writes:
  data/generated/cmo_<n>_raw.jsonl     ({id, seed, user, assistant})
  data/generated/cmo_<n>_chatml.jsonl  (Qwen3 ChatML, training-ready)

The system turn for ChatML is the live MRK18 system prompt.

Usage: python -m generate.merge_convo [--limit 1000]
"""

import argparse
import glob
import json
import os

from .convo_gates import run_gates

GEN_DIR = os.path.join("data", "generated")
SHARD_DIR = os.path.join(GEN_DIR, "_convo_shards")
GOLD = os.path.join(GEN_DIR, "batch_01.jsonl")
SYSTEM_PROMPT_PATH = os.path.join("prompts", "mrk18_system_prompt.md")


def _load(path):
    rows, bad = [], 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict) and obj.get("user") and obj.get("assistant"):
                    rows.append(obj)
                else:
                    bad += 1
            except json.JSONDecodeError:
                bad += 1
    return rows, bad


def load_all():
    rows, bad = [], 0
    if os.path.exists(GOLD):
        r, b = _load(GOLD)
        rows += r
        bad += b
        print(f"  gold batch_01: {len(r)} rows")
    for path in sorted(glob.glob(os.path.join(SHARD_DIR, "cmo_shard_*.jsonl"))):
        r, b = _load(path)
        rows += r
        bad += b
        print(f"  {os.path.basename(path)}: {len(r)} rows")
    if bad:
        print(f"  WARNING: skipped {bad} malformed lines")
    return rows


def to_chatml(row, system):
    text = (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{row['user']}<|im_end|>\n"
        f"<|im_start|>assistant\n{row['assistant']}<|im_end|>"
    )
    return {"text": text}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=1000, help="cap final row count")
    args = ap.parse_args(argv)

    rows = load_all()
    print(f"loaded {len(rows)} rows total")
    if not rows:
        print("nothing to merge.")
        return

    # dedup by id, then by identical user text
    seen_id, seen_user, deduped = set(), set(), []
    for r in rows:
        rid = r.get("id")
        utext = (r.get("user") or "").strip().lower()
        if rid in seen_id or utext in seen_user:
            continue
        seen_id.add(rid)
        seen_user.add(utext)
        deduped.append(r)
    if len(deduped) != len(rows):
        print(f"  removed {len(rows) - len(deduped)} duplicate rows (id/user)")

    passed, report = run_gates(deduped)
    print("gates:", json.dumps(report, ensure_ascii=False))
    if report.get("quota_flags"):
        print(f"  ⚠ QUOTA FLAGS (structural over-repetition): {report['quota_flags']}")

    if len(passed) > args.limit:
        passed = passed[:args.limit]
        print(f"  capped to {args.limit}")

    system = open(SYSTEM_PROMPT_PATH, encoding="utf-8").read().strip()
    raw_path = os.path.join(GEN_DIR, f"cmo_{len(passed)}_raw.jsonl")
    fmt_path = os.path.join(GEN_DIR, f"cmo_{len(passed)}_chatml.jsonl")
    with open(raw_path, "w", encoding="utf-8") as f:
        for r in passed:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(fmt_path, "w", encoding="utf-8") as f:
        for r in passed:
            f.write(json.dumps(to_chatml(r, system), ensure_ascii=False) + "\n")
    print(f"wrote {len(passed)} rows:\n  {raw_path}\n  {fmt_path}")


if __name__ == "__main__":
    main()
