"""See the (previously idle) analytics adapter work.

Feeds a sample ad-performance JSON to the analytics adapter and prints the CMO
diagnosis — no connector, no real account needed. Uses the Brain if BRAIN_BASE_URL
is set in .env, else falls back to Groq.

    cd execution
    python scripts/analytics_demo.py
"""

import asyncio
import json
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from mrk18_execution.agents.analytics import diagnose_metrics  # noqa: E402
from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.llm.socket import LLMSocket, brain_registry, default_registry  # noqa: E402

SAMPLE = {
    "period": "last 30 days",
    "currency": "INR",
    "total_spend": 250000,
    "campaigns": [
        {"name": "Meta - Prospecting", "spend": 150000, "roas": 1.2, "cac": 1100, "ctr": 0.008, "conversions": 136},
        {"name": "Meta - Retargeting", "spend": 60000, "roas": 4.1, "cac": 380, "ctr": 0.022, "conversions": 158},
        {"name": "Google - Search (brand)", "spend": 25000, "roas": 6.2, "cac": 210, "ctr": 0.071, "conversions": 119},
        {"name": "Google - Search (generic)", "spend": 15000, "roas": 1.0, "cac": 1400, "ctr": 0.028, "conversions": 11},
    ],
    "site": {"sessions": 48000, "add_to_cart_rate": 0.06, "checkout_completion": 0.41, "aov_inr": 1850},
}


async def main() -> None:
    s = get_settings()
    if s.brain_base_url:
        reg = brain_registry(s.brain_base_url, s.brain_api_key, s.brain_base_model)
        print(">> using the BRAIN (analytics adapter on RunPod)\n")
    else:
        reg = default_registry(s.groq_api_key)
        print(">> BRAIN_BASE_URL not set — using Groq fallback\n")
    socket = LLMSocket(reg)
    diag, usage = await diagnose_metrics(socket, SAMPLE)
    print(json.dumps(diag.model_dump(), indent=2, ensure_ascii=False))
    if usage:
        print(f"\n(tokens in/out: {usage.tokens_in}/{usage.tokens_out})")


asyncio.run(main())
