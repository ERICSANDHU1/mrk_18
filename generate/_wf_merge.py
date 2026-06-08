"""Rebuild the full analytics_1000_raw.jsonl from ALL map files (hand batches +
worker-lane chunks) in id order, then audit: missing ids, dups, math-in-text for
data-rich rows, and over-used phrase tics.

Map files live in generate/_maps/:
  batch_anXXXX.json  (hand-written an0001..an0108)
  wf_NN.json         (worker lanes an0109..an1000)
Each maps  id -> {"user":..., "assistant":...}.

Usage: python generate/_wf_merge.py
"""
import json, os, glob, re

SEEDS = "data/seeds/analytics_seeds.jsonl"
MAPS  = "generate/_maps"
OUT   = "data/Analytics/analytics_1000_raw.jsonl"

seeds = {}
order = []
for line in open(SEEDS, encoding="utf-8"):
    line = line.strip()
    if not line:
        continue
    o = json.loads(line)
    seeds[o["id"]] = o
    order.append(o["id"])

# load every map file; later files do NOT override earlier (first wins) but we warn on dups
pairs = {}
dups = []
for fp in sorted(glob.glob(os.path.join(MAPS, "*.json"))):
    try:
        m = json.load(open(fp, encoding="utf-8"))
    except Exception as e:
        print(f"!! BAD JSON in {fp}: {e}")
        continue
    for k, v in m.items():
        if k in pairs:
            dups.append(k)
            continue
        if not isinstance(v, dict) or "user" not in v or "assistant" not in v:
            print(f"!! malformed row {k} in {os.path.basename(fp)}")
            continue
        pairs[k] = v

# apply diversification rewrites as overrides (rev_*.json in generate/_revmaps)
REV = "generate/_revmaps"
rev_applied = 0
if os.path.isdir(REV):
    for fp in sorted(glob.glob(os.path.join(REV, "*.json"))):
        try:
            m = json.load(open(fp, encoding="utf-8"))
        except Exception as e:
            print(f"!! BAD JSON in {fp}: {e}")
            continue
        for k, v in m.items():
            if isinstance(v, dict) and "user" in v and "assistant" in v and k in pairs:
                pairs[k] = v
                rev_applied += 1
print(f"REV overrides applied: {rev_applied}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
written = 0
with open(OUT, "w", encoding="utf-8") as f:
    for _id in order:
        if _id in pairs:
            f.write(json.dumps({"id": _id, "seed": seeds[_id]["seed"],
                                "user": pairs[_id]["user"], "assistant": pairs[_id]["assistant"]},
                               ensure_ascii=False) + "\n")
            written += 1

missing = [i for i in order if i not in pairs]
print(f"WRITTEN: {written} / {len(order)}")
if dups:    print(f"DUPLICATE ids across map files ({len(dups)}): {dups[:20]}")
if missing: print(f"MISSING ids ({len(missing)}): {missing[:30]}{' ...' if len(missing)>30 else ''}")

# ---- math-in-text gate: data-rich rows should state their contribution figure ----
def scalar_cac(c):
    if isinstance(c, dict):
        return c.get("now")
    return c

math_flags = []
checked = 0
for _id in order:
    if _id not in pairs:
        continue
    mt = seeds[_id].get("metrics", {})
    aov, gm, cac = mt.get("aov"), mt.get("gross_margin_pct"), scalar_cac(mt.get("cac"))
    if isinstance(aov, (int, float)) and isinstance(gm, (int, float)) and isinstance(cac, (int, float)):
        contrib = round(aov * gm / 100 - cac)
        checked += 1
        txt = pairs[_id]["assistant"].replace(",", "")
        # look for the integer magnitude of the contribution in the text
        if str(abs(contrib)) not in txt:
            math_flags.append((_id, contrib))

print(f"MATH gate: checked {checked} data-rich rows; {len(math_flags)} missing their contribution figure")
if math_flags:
    print("  review:", math_flags[:25])

# ---- phrase-tic audit ----
allrows = [pairs[i]["assistant"] for i in order if i in pairs]
n = len(allrows) or 1
for w in ["isn't", "Do this first", "honest", "bucket with no bottom", "whipsaw"]:
    c = sum(1 for a in allrows if w.lower() in a.lower())
    print(f"  tic '{w}': {c}/{n} = {round(100*c/n)}%")

# length distribution
ws = [len(a.split()) for a in allrows]
if ws:
    ws.sort()
    print(f"  length words: min {ws[0]} | median {ws[len(ws)//2]} | max {ws[-1]} | short(<120) {sum(1 for x in ws if x<120)}")
