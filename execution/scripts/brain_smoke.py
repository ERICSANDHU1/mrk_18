"""Smoke-test the served Brain endpoint BEFORE wiring it into the backend.

Confirms the base model + all 5 LoRA adapters are loaded and answering on your
RunPod serverless vLLM endpoint. The first call may take a few minutes (cold
start loads the ~65 GB base) — the long timeout below accounts for that.

PowerShell (from D:\\mrk18\\execution):
    $env:BRAIN_BASE_URL = "https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1"
    $env:BRAIN_API_KEY  = "<your-runpod-api-key>"
    .venv\\Scripts\\python.exe scripts\\brain_smoke.py
"""

import os
import sys

from openai import OpenAI

BASE = os.environ.get("BRAIN_BASE_URL")
KEY = os.environ.get("BRAIN_API_KEY")

# These names MUST match the served --lora-modules / LORA_MODULES names AND the
# backend's BRAIN_ADAPTERS map (llm/socket.py).
ADAPTERS = ["personality", "brand_analysis", "funnel", "ad_copy", "analytics"]

if not BASE or not KEY:
    sys.exit("Set BRAIN_BASE_URL and BRAIN_API_KEY in the environment first.")

# Long timeout: a cold start on a 32B can take minutes on the first request.
client = OpenAI(base_url=BASE, api_key=KEY, timeout=600.0, max_retries=1)

print(f"endpoint: {BASE}\n")
print("== /models (should list Qwen/Qwen3-32B + the 5 adapters) ==")
try:
    served = [m.id for m in client.models.list().data]
    for s in served:
        print("   -", s)
except Exception as exc:  # noqa: BLE001
    sys.exit(f"could not list models (endpoint not ready or wrong URL/key): {exc}")

missing = [a for a in ADAPTERS if a not in served]
if missing:
    print(f"\n!! adapters NOT in /models: {missing} — check LORA_MODULES + worker logs")

print("\n== per-adapter test completion ==")
ok = 0
for a in ADAPTERS:
    try:
        r = client.chat.completions.create(
            model=a,
            messages=[
                {"role": "user", "content": "In one short sentence, give a marketing tip for an Indian startup."}
            ],
            max_tokens=50,
            temperature=0.3,
        )
        txt = (r.choices[0].message.content or "").strip().replace("\n", " ")
        print(f"   [OK]   {a}: {txt[:100]}")
        ok += 1
    except Exception as exc:  # noqa: BLE001
        print(f"   [FAIL] {a}: {exc}")

print(f"\n{ok}/{len(ADAPTERS)} adapters answered.")
if ok == len(ADAPTERS):
    print("Brain is live and all adapters respond — safe to wire BRAIN_* into .env.")
