"""Windows-safe local dev runner for the MRK18 Execution API.

Why this exists: LangGraph's Postgres checkpointer talks to the DB through
psycopg3, and psycopg3's async mode REFUSES to run on Windows' default
ProactorEventLoop. We must run the whole server on a SelectorEventLoop.

The catch: `uvicorn.run(...)` (and the `uvicorn` CLI) call
`Config.setup_event_loop()`, which on Windows FORCES
WindowsProactorEventLoopPolicy back on — clobbering any policy we set first.
So we can't use uvicorn.run(). Instead we create the Selector loop ourselves
via asyncio.run() and drive `Server.serve()` directly, which never touches the
loop policy. That keeps psycopg happy.

Usage (from the execution/ folder):
    .venv\\Scripts\\python.exe run_dev.py
"""

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn  # noqa: E402 — imported after the policy is set, on purpose


async def _main() -> None:
    config = uvicorn.Config(
        "mrk18_execution.api.app:create_app",
        factory=True,
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )
    server = uvicorn.Server(config)
    # serve() runs inside the Selector loop asyncio.run() just created — it does
    # NOT call setup_event_loop(), so the Proactor policy is never reinstated.
    await server.serve()


if __name__ == "__main__":
    asyncio.run(_main())
