"""Run the MRK18 execution API locally.

    .venv\\Scripts\\python.exe scripts\\serve.py

Then open the review screen for any run:
    http://127.0.0.1:8000/review/<run_id>

Windows note: we drive uvicorn inside our own SelectorEventLoop — psycopg's
async pool cannot run on the Proactor loop uvicorn would otherwise create.
(Production runs on Linux; this only matters on dev machines.)
"""

import asyncio
import sys

import uvicorn

from mrk18_execution.api.app import create_app

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


async def main() -> None:
    config = uvicorn.Config(create_app(), host="127.0.0.1", port=8000, log_level="info")
    await uvicorn.Server(config).serve()


if __name__ == "__main__":
    asyncio.run(main())
