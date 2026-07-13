"""Local taster backend — no Supabase needed.

Boots the full MRK18 API on an in-memory SQLite database so the free-taster
flow (and anything else that doesn't need real founder data) runs locally with
just the keys in .env (GROQ_API_KEY + TAVILY_API_KEY). The database resets on
every restart — caches and applications are throwaway here.

    cd execution
    .venv\\Scripts\\python.exe run_taster_dev.py     →  http://127.0.0.1:8000

For the REAL backend against Supabase (founder data, runs, gates), use
run_dev.py instead — that one needs DATABASE_URL etc. in .env.
"""

import asyncio
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.chdir(HERE)  # so pydantic-settings finds execution/.env
sys.path.insert(0, str(HERE))

os.environ.setdefault("CORS_ALLOW_ORIGINS", "http://localhost:3000")

import uvicorn
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from mrk18_execution.api.app import create_app
from mrk18_execution.db.models import Base

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


async def main() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app = create_app(engine=engine)
    print("taster dev backend → http://127.0.0.1:8000  (in-memory DB, resets on restart)")
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8000, log_level="info"))
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
