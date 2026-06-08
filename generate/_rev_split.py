"""Build rewrite chunks for the flagged (crutch-phrase) rows.
Each chunk item carries everything an agent needs to rewrite the assistant turn
while preserving the user turn and all math: {id, founder_style, archetype, mode, hint, user, assistant}.
Writes generate/_rev/chunk_NN.json (a JSON list) and prints chunk count.
"""
import json, os

flagged = set(json.load(open("generate/_wf/_reflag.json", encoding="utf-8")))
seeds = {json.loads(l)["id"]: json.loads(l) for l in open("data/seeds/analytics_seeds.jsonl", encoding="utf-8") if l.strip()}
rows  = {json.loads(l)["id"]: json.loads(l) for l in open("data/Analytics/analytics_1000_raw.jsonl", encoding="utf-8") if l.strip()}

items = []
for _id in sorted(flagged):
    s = seeds[_id]["seed"]; r = rows[_id]
    items.append({
        "id": _id,
        "archetype": s["archetype"],
        "founder_style": s["founder_style"],
        "mode": s["mode"],
        "hint": seeds[_id]["hint"],
        "user": r["user"],
        "assistant": r["assistant"],
    })

OUT = "generate/_rev"
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.startswith("chunk_"):
        os.remove(os.path.join(OUT, f))

SIZE = 14
chunks = [items[i:i+SIZE] for i in range(0, len(items), SIZE)]
for i, ch in enumerate(chunks):
    json.dump(ch, open(os.path.join(OUT, f"chunk_{i:02d}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)

print(f"flagged={len(items)} chunks={len(chunks)} size={SIZE}")
