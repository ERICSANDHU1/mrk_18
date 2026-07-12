# Free Taster — RunPod Serverless Setup

> The landing-hero "drop your URL" analysis: Tavily reads the site, then 4 LoRA
> adapters (**usp · differentiation · brand_analysis · personality**) on a
> **dedicated** Mistral-7B vLLM endpoint return four short verdicts. Dedicated =
> free-tier load can never starve the paying founders' Brain, and it scales to
> zero when idle. Backend route: `POST /taster` ([api/taster.py](mrk18_execution/api/taster.py)).

---

## 0. Verify the adapters FIRST (30 min, do not skip)

The 4 adapters are **not in this repo** — they live in your training environment.
Once they're saved locally, one command runs this whole section's checklist and
prints the RunPod env values:

```
python scripts/verify_taster_adapters.py C:\path\to\adapters
```

What it checks (the manual version):

1. **Format.** Each adapter needs `adapter_config.json` + `adapter_model.safetensors`
   (PEFT format). If you only have **GGUF** files, they will NOT work with vLLM —
   re-export from the training checkpoint (Unsloth:
   `model.save_pretrained("usp")` — a re-save, not a retrain). If you only have
   **merged full weights**, the adapter is lost; you need the pre-merge checkpoint.
2. **Base-model match.** Open each `adapter_config.json` → `base_model_name_or_path`
   must be the SAME base you'll serve (e.g. `mistralai/Mistral-7B-Instruct-v0.3`).
   `unsloth/mistral-7b-instruct-v0.3` trains fine but SERVE the official repo —
   they're weight-identical; keep one canonical string everywhere. If the 4
   adapters disagree with each other, they cannot share one endpoint.
3. **Max LoRA rank.** Note the largest `r` across the 4 configs → that's
   `MAX_LORA_RANK` below (usually 16, 32, or 64).

## 1. Upload adapters to a private Hugging Face repo

One private repo per adapter (cleanest with vLLM's loader):

```
huggingface-cli login
huggingface-cli upload mrk18/taster-usp             ./usp             --private
huggingface-cli upload mrk18/taster-differentiation ./differentiation --private
huggingface-cli upload mrk18/taster-brand-analysis  ./brand_analysis  --private
huggingface-cli upload mrk18/taster-personality     ./personality     --private
```

(Alternative: bake the adapter files into a custom Docker image. More build
friction on every adapter update — HF repos are the default choice.)

## 2. Create the RunPod Serverless endpoint

New endpoint → template **`runpod/worker-v1-vllm`** (latest tag).

| Setting | Value | Why |
|---|---|---|
| GPU | 24 GB class — enable **L4, RTX 4090, A5000** in priority order | 7B fp16 ≈ 15 GB + KV cache fits in 24 GB; multiple types = fallback instead of queuing |
| Min workers | **0** | idle site costs $0 |
| Max workers | **1–2** | free tier never needs more |
| Idle timeout | **15 s** | drains fast after a burst |
| FlashBoot | **ON** | cold start ~10–40 s instead of minutes |
| Scaling | Queue Delay, **4 s** | |
| Execution timeout | **120 s** | 4 parallel adapter calls fit easily |
| Container disk | **40 GB** | base weights + 4 adapters + cache |

**Environment variables on the endpoint:**

```
MODEL_NAME=mistralai/Mistral-7B-Instruct-v0.3
ENABLE_LORA=true
LORA_MODULES=[{"name":"usp","path":"mrk18/taster-usp"},{"name":"differentiation","path":"mrk18/taster-differentiation"},{"name":"brand_analysis","path":"mrk18/taster-brand-analysis"},{"name":"personality","path":"mrk18/taster-personality"}]
MAX_LORA_RANK=<largest r from step 0>
MAX_LORAS=4
MAX_CPU_LORAS=4
GPU_MEMORY_UTILIZATION=0.90
MAX_MODEL_LEN=8192
HF_TOKEN=<read token — the adapter repos are private>
```

`MAX_LORAS=4` keeps all four resident on the GPU — zero adapter swap latency.
The adapter `name` values must match `TASTER_ADAPTERS` in
[api/taster.py](mrk18_execution/api/taster.py) exactly.

## 3. Smoke-test the endpoint

The worker exposes an OpenAI-compatible route. Once per adapter:

```bash
curl -s https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1/chat/completions \
  -H "Authorization: Bearer $RUNPOD_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"usp","messages":[{"role":"user","content":"A site that sells oak desks to remote workers. What is the USP?"}],"max_tokens":150}'
```

Repeat with `"model":"differentiation"`, `"brand_analysis"`, `"personality"`.
Each must answer in its trained voice (adapter-flavored, not base-vanilla).
First call pays the cold start; the other three should return in ~1–3 s.

## 4. Point the backend at it

In `execution/.env` (Render → Environment in prod):

```
TASTER_BASE_URL=https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1
TASTER_API_KEY=<your RunPod API key>
TAVILY_API_KEY=<already used by the analysis pipeline>
```

And in `web/.env.local` (Netlify/Vercel env in prod):

```
NEXT_PUBLIC_BACKEND_URL=https://<your-backend>.onrender.com
```

The backend's `CORS_ALLOW_ORIGINS` must include the landing origin — the hero
calls `POST /taster` directly from the browser (a RunPod cold start outlives
serverless-proxy timeouts; the RunPod/Tavily keys never leave the backend).

Unset → the feature is dormant: `/taster` answers 503 in prod, a labeled
sample in dev. Apply the migration `20260710120000_taster_cache.sql` (cache table).

## 5. Guardrails already enforced in the route

- **Rate class** `taster` — 5 req/min per IP (perimeter middleware).
- **Daily cap** — `TASTER_DAILY_PER_IP` (default 3/IP/UTC-day); cache hits don't consume it.
- **Domain cache** — `TASTER_CACHE_TTL_HOURS` (default 24 h): one GPU+Tavily burn per domain per day, refreshes are free.
- **Output cap** — `TASTER_MAX_TOKENS` (default 380/adapter).
- **Grounding** — prompts forbid invented numbers/customers/metrics; site text is handled as untrusted data (prompt-injection posture).
- **Cold start** — honest 503 "warming up"; the hero auto-retries twice at 25 s.

## 6. Cost & latency notes

**Latency** (24 GB card, all 4 adapters resident):
- Warm: Tavily extract ~1–3 s + 4 parallel generations ~2–5 s → **~4–8 s wall clock**.
- Cold (FlashBoot): +10–40 s once, then warm for the 15 s idle window. The hero's
  staged loader + warming message are designed around exactly this.

**GPU cost** (pay only while a worker runs):
- L4/A5000-class serverless ≈ $0.00024–0.0004/s. One analysis ≈ 5–10 GPU-seconds
  → **$0.002–0.004 (~₹0.2–0.4) per analysis**. The domain cache caps this at one
  burn per domain per day.
- Idle cost: **$0** (min workers 0).
- 1,000 fresh analyses/month ≈ **$2–4 GPU total**. This endpoint cannot
  meaningfully hurt unit economics with the caps on.

**Tavily**: one extract per fresh analysis. Free tier 1,000 credits/mo covers
launch volume; the per-IP daily cap + domain cache are what stop scraper abuse
from burning credits.

**The real bill risk** is never the happy path — it's an unlimited public GPU
endpoint. That's why the four walls in §5 are non-negotiable and all default ON.
