"""Dump the system prompt + N random (seeded) records of a ChatML dataset,
human-readable, for quality review. Read-only.

    python scripts/dataset_sample.py "D:/usp_v2_chatml.jsonl" 12 out.txt
"""

import json
import random
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

path = sys.argv[1] if len(sys.argv) > 1 else r"D:/usp_v2_chatml.jsonl"
n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
out = sys.argv[3] if len(sys.argv) > 3 else None

recs = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def parse(text: str) -> dict:
    turns: dict[str, str] = {}
    for p in text.split("<|im_start|>")[1:]:
        m = re.match(r"(\w+)\s*\n(.*?)(?:<\|im_end\|>|$)", p, re.S)
        if m:
            turns.setdefault(m.group(1).strip(), m.group(2).strip())
    return turns


random.seed(7)
sample = random.sample(recs, min(n, len(recs)))
lines = ["===== SYSTEM PROMPT (identical in all records) =====", parse(sample[0]["text"]).get("system", ""), ""]
for i, d in enumerate(sample, 1):
    t = parse(d["text"])
    lines += [f"\n========== RECORD {i} ==========", "FOUNDER Q: " + t.get("user", ""), "CMO ANSWER:", t.get("assistant", "")]
blob = "\n".join(lines)
print(blob)
if out:
    open(out, "w", encoding="utf-8").write(blob)
    print(f"\n[written to {out}]")
