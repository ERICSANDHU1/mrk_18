"""Convert analytics_1000_raw.jsonl ({id, seed, user, assistant}) into Qwen3 ChatML.

system turn = MRK18 system prompt (canonical), with the one closer-format clause
generalised so it matches the analytics data's deliberately-varied closers.
user turn   = the founder's message (plain text)
assistant   = the MRK18 diagnosis (plain text)

Output: data/Analytics/analytics_1000_chatml.jsonl  (one {"text": ...} per line)
"""
import json, os, sys

RAW = "data/Analytics/analytics_1000_raw.jsonl"
OUT = "data/Analytics/analytics_1000_chatml.jsonl"
SYS_FILE = "prompts/mrk18_system_prompt.md"

system = open(SYS_FILE, encoding="utf-8").read().strip()

# generalise the forced "Do this first:" closer to match the varied-closer dataset
OLD = 'Close with the single highest-leverage next step, written as "Do this first: …".'
NEW = "Close on the single highest-leverage next step; vary how you phrase that closer."
if OLD in system:
    system = system.replace(OLD, NEW)
else:
    print("WARN: closer clause not found verbatim — system prompt used as-is", file=sys.stderr)


def to_chatml(user: str, assistant: str) -> str:
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n{assistant}<|im_end|>"
    )


n = 0
with open(OUT, "w", encoding="utf-8") as out:
    for line in open(RAW, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        text = to_chatml(r["user"].strip(), r["assistant"].strip())
        out.write(json.dumps({"text": text}, ensure_ascii=False) + "\n")
        n += 1

print(f"wrote {n} ChatML rows -> {OUT}")
# sanity: confirm no Mistral [INST] markers, real rupee, all three turns present
bad = 0
for line in open(OUT, encoding="utf-8"):
    t = json.loads(line)["text"]
    if "[INST]" in t or "\\u20b9" in line or t.count("<|im_start|>") != 3:
        bad += 1
print(f"format check: {bad} malformed rows (expect 0)")
