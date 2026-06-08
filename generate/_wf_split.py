"""Split remaining analytics seeds (id number > START) into ~SIZE-seed chunk files
for the worker agents. Each chunk -> generate/_wf/chunk_NN.jsonl (raw seed lines).
Prints the chunk count so the workflow knows how many to spawn.
"""
import json, os, math

START = 108          # already done by hand: an0001..an0108
SIZE  = 14           # seeds per chunk
SEEDS = "data/seeds/analytics_seeds.jsonl"
OUT   = "generate/_wf"

os.makedirs(OUT, exist_ok=True)
# clean any prior chunk files
for f in os.listdir(OUT):
    if f.startswith("chunk_"):
        os.remove(os.path.join(OUT, f))

rows = []
for line in open(SEEDS, encoding="utf-8"):
    line = line.strip()
    if not line:
        continue
    o = json.loads(line)
    n = int(o["id"][2:])          # an0109 -> 109
    if n > START:
        rows.append(line)

chunks = [rows[i:i+SIZE] for i in range(0, len(rows), SIZE)]
for i, ch in enumerate(chunks):
    with open(os.path.join(OUT, f"chunk_{i:02d}.jsonl"), "w", encoding="utf-8") as f:
        f.write("\n".join(ch) + "\n")

print(f"remaining_seeds={len(rows)} chunks={len(chunks)} size={SIZE}")
