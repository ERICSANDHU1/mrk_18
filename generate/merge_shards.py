"""Merge per-subagent shard files into the canonical dataset.

Reads every data/generated/_shards/<skill>_shard_*.jsonl, validates each line is
{input, output}, runs quality gates (key-check, cross-shard sentence dedup,
number flags), and writes:
  data/generated/<skill>_<n>_raw.jsonl   ({input, output})
  data/generated/<skill>_<n>_chatml.jsonl (Qwen3 ChatML, training-ready)

Usage: python -m generate.merge_shards --skill adcopy
"""

import argparse
import glob
import json
import os

from .schemas import SKILLS
from .quality_gates import run_gates
from .format_chatml import write_chatml

GEN_DIR = os.path.join("data", "generated")
SHARD_DIR = os.path.join(GEN_DIR, "_shards")


def load_shards(skill: str) -> list[dict]:
    rows, bad = [], 0
    for path in sorted(glob.glob(os.path.join(SHARD_DIR, f"{skill}_shard_*.jsonl"))):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    if isinstance(obj, dict) and "input" in obj and "output" in obj:
                        rows.append(obj)
                    else:
                        bad += 1
                except json.JSONDecodeError:
                    bad += 1
    if bad:
        print(f"  WARNING: skipped {bad} malformed shard lines")
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--skill", default="adcopy", choices=sorted(SKILLS))
    args = ap.parse_args(argv)

    rows = load_shards(args.skill)
    print(f"loaded {len(rows)} rows from shards")
    if not rows:
        print("no rows found — nothing to merge.")
        return

    # dedup identical inputs (a brief should only be generated once)
    seen, deduped = set(), []
    for r in rows:
        k = json.dumps(r["input"], sort_keys=True, ensure_ascii=False)
        if k in seen:
            continue
        seen.add(k)
        deduped.append(r)
    if len(deduped) != len(rows):
        print(f"  removed {len(rows) - len(deduped)} duplicate-input rows")

    required = list(SKILLS[args.skill]["schema"]["required"])
    passed, report = run_gates(deduped, required)
    print("gates:", json.dumps(report, ensure_ascii=False))

    raw_path = os.path.join(GEN_DIR, f"{args.skill}_{len(passed)}_raw.jsonl")
    fmt_path = os.path.join(GEN_DIR, f"{args.skill}_{len(passed)}_chatml.jsonl")
    with open(raw_path, "w", encoding="utf-8") as f:
        for r in passed:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    write_chatml(passed, SKILLS[args.skill]["system"], fmt_path)
    print(f"wrote {len(passed)} rows:\n  {raw_path}\n  {fmt_path}")


if __name__ == "__main__":
    main()
