"""Merge a hand-written {id:{user,assistant}} map with analytics seeds -> output rows.
Copies id+seed verbatim; the founder's metrics live inside the `user` turn.
Usage: python generate/_fill_analytics.py <map_json>
"""
import json, sys, os
seeds = {json.loads(l)["id"]: json.loads(l) for l in open("data/seeds/analytics_seeds.jsonl", encoding="utf-8") if l.strip()}
m = json.load(open(sys.argv[1], encoding="utf-8"))
os.makedirs("data/Analytics", exist_ok=True)
out = "data/Analytics/analytics_1000_raw.jsonl"
miss = []
with open(out, "a", encoding="utf-8") as f:
    for k in sorted(m):
        if k not in seeds:
            miss.append(k); continue
        s = seeds[k]
        f.write(json.dumps({"id": k, "seed": s["seed"], "user": m[k]["user"], "assistant": m[k]["assistant"]}, ensure_ascii=False) + "\n")
total = sum(1 for l in open(out, encoding="utf-8") if l.strip())
print(f"appended {len(m)-len(miss)} | TOTAL: {total} / 1000")
if miss: print("MISSING ids:", miss)
