"""Training-data QA for ChatML {"text": ...} datasets. Read-only.

    python scripts/dataset_qa.py "D:/usp_v2_chatml.jsonl"
"""

import hashlib
import json
import re
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

path = sys.argv[1] if len(sys.argv) > 1 else r"D:/usp_v2_chatml.jsonl"
raw = open(path, encoding="utf-8", errors="replace").read().splitlines()

recs, bad_json, keys = [], [], Counter()
for i, ln in enumerate(raw, 1):
    s = ln.strip()
    if not s:
        continue
    try:
        d = json.loads(s)
    except Exception as e:  # noqa: BLE001
        bad_json.append((i, str(e)[:70]))
        continue
    for k in d:
        keys[k] += 1
    recs.append(d)


def parse(text: str):
    roles, turns = [], {}
    for p in text.split("<|im_start|>")[1:]:
        m = re.match(r"(\w+)\s*\n(.*?)(?:<\|im_end\|>|$)", p, re.S)
        if m:
            role, content = m.group(1).strip(), m.group(2).strip()
            roles.append(role)
            turns.setdefault(role, content)
    return tuple(roles), turns


exact, sys_h, user_h, role_pat = Counter(), Counter(), Counter(), Counter()
tlen, alen, ulen, short_a, missing = [], [], [], 0, 0
for d in recs:
    t = d.get("text")
    if not isinstance(t, str):
        missing += 1
        continue
    tlen.append(len(t))
    exact[hashlib.md5(t.encode()).hexdigest()] += 1
    roles, turns = parse(t)
    role_pat[roles] += 1
    s, u, a = turns.get("system", ""), turns.get("user", ""), turns.get("assistant", "")
    sys_h[hashlib.md5(s.encode()).hexdigest()] += 1
    user_h[hashlib.md5(u.lower().strip().encode()).hexdigest()] += 1
    ulen.append(len(u))
    alen.append(len(a))
    if len(a) < 60:
        short_a += 1


def stats(xs):
    if not xs:
        return "n/a"
    xs = sorted(xs)
    p = lambda q: xs[min(len(xs) - 1, int(len(xs) * q))]  # noqa: E731
    return f"min={xs[0]} median={p(0.5)} p95={p(0.95)} max={xs[-1]}"


dups = sum(c - 1 for c in exact.values() if c > 1)
TOK = 3.7  # ~chars per token (English+markup heuristic)
over = sum(1 for x in tlen if x / TOK > 4096)
print(f"FILE: {path}")
print(f"lines={len(raw)}  valid_json={len(recs)}  broken_json={len(bad_json)}  keys={dict(keys)}")
print(f"records_with_text={len(tlen)}  missing_text={missing}")
print("--- structure ---")
print(f"role patterns: {dict(role_pat)}")
print(f"system prompts: {len(sys_h)} unique (want 1)")
print("--- duplicates ---")
print(f"exact-duplicate records: {dups}")
print(f"unique founder questions: {len(user_h)} of {len(tlen)}  (repeat scenarios: {len(tlen)-len(user_h)})")
print("--- lengths (chars) ---")
print(f"full text:        {stats(tlen)}")
print(f"founder question: {stats(ulen)}")
print(f"assistant answer: {stats(alen)}")
print(f"~tokens (text/{TOK}): max≈{int(max(tlen)/TOK) if tlen else 0}  records over 4096 tok: {over}")
print(f"very short answers (<60 chars): {short_a}")
if bad_json[:5]:
    print("--- first broken lines ---")
    for i, e in bad_json[:5]:
        print(f"  line {i}: {e}")
