"""Generate the adcopy dataset in ONE concurrent pass via Gemini, then gate once.

Free model (Gemini Flash), structured JSON output, all briefs fired in parallel,
quality gates run once over the whole batch, Qwen3 ChatML written out.

  GEMINI_API_KEY=... python -m generate.gen_adcopy_gemini --limit 3        # smoke test
  GEMINI_API_KEY=... python -m generate.gen_adcopy_gemini                   # full 1000
"""
import os, json, time, argparse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

from .schemas import SKILLS
from .quality_gates import run_gates
from .format_chatml import write_chatml

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

# Gemini responseSchema (JSON-schema subset; no additionalProperties).
GEMINI_SCHEMA = {
    "type": "object",
    "properties": {
        "hook": {"type": "string"},
        "body": {"type": "string"},
        "cta": {"type": "string"},
        "headline": {"type": "string"},
        "variations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "version": {"type": "string"},
                    "hook": {"type": "string"},
                    "body": {"type": "string"},
                    "cta": {"type": "string"},
                },
                "required": ["version", "hook", "body", "cta"],
            },
        },
        "copywriting_notes": {"type": "string"},
    },
    "required": ["hook", "body", "cta", "headline", "variations", "copywriting_notes"],
}


def gen_one(brief, system, model, key, retries=6):
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user",
                      "parts": [{"text": "Brand brief:\n" + json.dumps(brief, ensure_ascii=False)
                                 + "\n\nReturn EXACTLY 2 variations (version A and B), genuinely different angles."}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": GEMINI_SCHEMA,
            "temperature": 0.95,
            "maxOutputTokens": 2048,
            "thinkingConfig": {"thinkingBudget": 0},  # disable 2.5 thinking: faster, no truncation
        },
    }
    data = json.dumps(body).encode("utf-8")
    url = API.format(model=model, key=key)
    last = ""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                resp = json.load(r)
            txt = resp["candidates"][0]["content"]["parts"][0]["text"]
            return {"input": brief, "output": json.loads(txt)}
        except urllib.error.HTTPError as e:
            last = f"HTTP{e.code}"
            if e.code in (429, 500, 502, 503):
                time.sleep(min(2 ** attempt, 30)); continue
            return {"_error": last + ":" + e.read().decode()[:200]}
        except Exception as e:
            last = type(e).__name__
            time.sleep(min(2 ** attempt, 20)); continue
    return {"_error": last}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--briefs", default=os.path.join("data", "generated", "adcopy_briefs.jsonl"))
    ap.add_argument("--model", default="gemini-2.5-flash")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--out", default=os.path.join("data", "Ad_copy"))
    a = ap.parse_args(argv)

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise SystemExit("set GEMINI_API_KEY")
    system = SKILLS["adcopy"]["system"]
    briefs = [json.loads(l) for l in open(a.briefs, encoding="utf-8") if l.strip()]

    os.makedirs(a.out, exist_ok=True)
    out_path = os.path.join(a.out, "adcopy_1000_raw.jsonl")

    def bkey(b):
        return json.dumps(b, sort_keys=True, ensure_ascii=False)

    done = set()
    if os.path.exists(out_path):
        for l in open(out_path, encoding="utf-8"):
            if l.strip():
                try:
                    done.add(bkey(json.loads(l)["input"]))
                except Exception:
                    pass
    todo = [b for b in briefs if bkey(b) not in done]
    if a.limit:
        todo = todo[:a.limit]
    print(f"existing rows: {len(done)} | to generate: {len(todo)} via {a.model} ({a.workers} workers)", flush=True)

    rows, errors, cnt = [], [], 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(gen_one, b, system, a.model, key) for b in todo]
        for fu in as_completed(futs):
            r = fu.result(); cnt += 1
            if r and "_error" not in r:
                rows.append(r)
                # stream-append immediately so progress survives interruption
                with open(out_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            else:
                errors.append(r.get("_error") if r else "none")
            if cnt % 25 == 0 or cnt == len(todo):
                total_now = len(done) + len(rows)
                print(f"  {cnt}/{len(todo)} ok={len(rows)} err={len(errors)} total~{total_now} {time.time()-t0:.0f}s", flush=True)
    from collections import Counter
    print(f"DONE: {len(rows)} new ok, {len(errors)} failed in {time.time()-t0:.0f}s")
    if errors:
        print("  error types:", dict(Counter(errors)))

    total = sum(1 for l in open(out_path, encoding="utf-8") if l.strip())
    print(f"TOTAL in {out_path}: {total}")


if __name__ == "__main__":
    main()
