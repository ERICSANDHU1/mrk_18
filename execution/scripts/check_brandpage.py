"""Quick check: does a website's brand page actually fetch?

This is THE input that grounds great content — when the brand page fetches, the
ad_copy adapter describes the REAL product; when it doesn't, the copy goes generic.
Fast + free (just the Tavily fetch, no LLM, no brain).

    cd execution
    .venv\\Scripts\\python.exe scripts\\check_brandpage.py limitless.ai
    .venv\\Scripts\\python.exe scripts\\check_brandpage.py <your-gridsense-website>
"""

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.stdout.reconfigure(encoding="utf-8")

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.research.web import TavilyResearcher, fetch_brand_page  # noqa: E402


async def main() -> None:
    website = sys.argv[1] if len(sys.argv) > 1 else "limitless.ai"
    s = get_settings()
    if not s.tavily_api_key:
        print("\n⚠  NO TAVILY_API_KEY in your .env — web grounding is OFF.")
        print("   Every run's content will be generic regardless of the website.\n")
        return
    researcher = TavilyResearcher(s.tavily_api_key)
    profile = {"company_name": website, "website": website}
    page = await fetch_brand_page(researcher, profile)
    print(f"\n{'=' * 60}\n  website: {website}\n{'=' * 60}")
    if page:
        print(f"\n✅ brand page FETCHED — {len(page)} chars")
        print("   → content is GROUNDED in the real product. Good input.\n")
        print("   preview:\n   " + page[:400].strip().replace("\n", "\n   ") + " …\n")
    else:
        print("\n❌ NO brand page (unreachable / not a real, fetchable site)")
        print("   → content falls back to GENERIC. This is the likely reason")
        print("     the app's copy looked weaker than the limitless.ai run.\n")


asyncio.run(main())
