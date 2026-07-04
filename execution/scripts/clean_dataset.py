"""Clean generation-meta artifacts out of a ChatML {"text": ...} training file.

Surgically removes ONLY parentheticals whose content is a generation artifact
(e.g. "(The file already has …)", "(different from existing)", "(Already
covered)") — never legitimate ones like "(peri-peri / cream-and-onion)". Then
re-validates and writes <name>_clean.jsonl with a before/after report.

    python scripts/clean_dataset.py "D:/usp_v2_chatml.jsonl"
"""

import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

path = sys.argv[1] if len(sys.argv) > 1 else r"D:/usp_v2_chatml.jsonl"
out = sys.argv[2] if len(sys.argv) > 2 else path.replace(".jsonl", "_clean.jsonl")

# Generation-artifact keywords. A parenthetical is removed ONLY if its inner
# text contains one of these — so real parentheticals survive untouched.
KW = "|".join([
    r"the file", r"different from existing", r"already covered",
    r"already in the file", r"earlier in the file", r"non-generation",
    r"non-repeat", r"as requested", r"per the brief", r"already generated",
    r"existing record", r"existing case", r"existing file", r"the brief above",
])
META = re.compile(r"[ \t]*\([^()]*(?:" + KW + r")[^()]*\)", re.I)


def cleanup(s: str) -> str:
    s = META.sub("", s)
    # non-parenthetical generation clauses: "Already covered X — but we/our …"
    s = re.sub(r"\bAlready covered\b[^—\n.]*—\s*but\s+we\b", "We", s, flags=re.I)
    s = re.sub(r"\bAlready covered\b[^—\n.]*—\s*but\s+our\b", "Our", s, flags=re.I)
    s = re.sub(r"\bAlready covered\b[^—\n.]*—\s*but\s+", "", s, flags=re.I)
    s = re.sub(r" {2,}", " ", s)             # collapse double spaces
    s = re.sub(r"[ \t]+([.,;:!?])", r"\1", s)  # space before punctuation
    s = re.sub(r"[ \t]+\n", "\n", s)          # trailing spaces on a line
    s = re.sub(r"\(\s*\)", "", s)             # any empty parens left behind
    s = re.sub(r" {2,}", " ", s)
    return s


def parse(t: str) -> dict:
    d = {}
    for p in t.split("<|im_start|>")[1:]:
        m = re.match(r"(\w+)\s*\n(.*?)(?:<\|im_end\|>|$)", p, re.S)
        if m:
            d.setdefault(m.group(1).strip(), m.group(2).strip())
    return d


recs = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]
changed = removed = 0
examples = []
cleaned = []
for d in recs:
    before = d["text"]
    n = len(META.findall(before))
    after = cleanup(before)
    if after != before:
        changed += 1
        removed += n
        if len(examples) < 3 and n:
            m = META.search(before)
            examples.append(m.group(0).strip())
    cleaned.append({"text": after})

# drop exact duplicates created when a distinguishing parenthetical was removed
seen_t, deduped = set(), []
for r in cleaned:
    if r["text"] in seen_t:
        continue
    seen_t.add(r["text"])
    deduped.append(r)
dropped = len(cleaned) - len(deduped)
cleaned = deduped

with open(out, "w", encoding="utf-8") as f:
    for r in cleaned:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")

# ---- re-validate the cleaned file (unambiguous artifacts only — "selling the
# file" in a design answer is legitimate and must NOT be flagged) ----
rx_scan = re.compile(r"(?:the file already|the file has|\(the file|"
                     r"different from existing|already covered|earlier in the file|"
                     r"already in the file|non-generation|as requested|per the brief)", re.I)
valid = sys_set = dup = 0
seen = set()
sysh = set()
q_left = a_left = bad_struct = 0
for r in cleaned:
    t = r["text"]
    try:
        json.loads(json.dumps({"text": t}))
        valid += 1
    except Exception:  # noqa: BLE001
        pass
    h = hash(t)
    if h in seen:
        dup += 1
    seen.add(h)
    p = parse(t)
    sysh.add(p.get("system", ""))
    if not all(k in p for k in ("system", "user", "assistant")):
        bad_struct += 1
    if rx_scan.search(p.get("user", "")):
        q_left += 1
    if rx_scan.search(p.get("assistant", "")):
        a_left += 1

print(f"INPUT : {path}  ({len(recs)} records)")
print(f"OUTPUT: {out}")
print("--- changes ---")
print(f"records cleaned: {changed}/{len(recs)}   parentheticals removed: {removed}")
print(f"exact-duplicate records dropped after cleaning: {dropped}")
for e in examples:
    print(f"   removed e.g.: {e}")
print("--- re-validation of cleaned file ---")
print(f"final records: {len(cleaned)}   valid JSON: {valid}/{len(cleaned)}   unique system prompts: {len(sysh)} (want 1)")
print(f"broken ChatML structure: {bad_struct}   exact duplicates: {dup}")
print(f"residual leakage  — question: {q_left}   answer: {a_left}  (want 0)")
ok = a_left == 0 and q_left == 0 and bad_struct == 0 and dup == 0 and len(sysh) == 1
print("\n✅ CLEAN — ready to train." if ok else "\n⚠️  Review residuals above.")
