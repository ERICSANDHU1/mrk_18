# MRK18 — Repository Map

> **The whole app is two folders:** **`web/`** = frontend, **`execution/`** = backend.
> Everything else at the root is docs, data, and content — *not* the deployed app.

---

## 🚀 The app (what actually gets deployed)

| Folder | What it is | Stack | Deploys to |
|---|---|---|---|
| **`web/`** | **Frontend** — landing page + the app UI | Next.js 16 + Clerk auth | **Vercel** → `mrk18.com` |
| **`execution/`** | **Backend** — the API + the AI pipeline | Python · FastAPI · LangGraph | **Render** → `api.mrk18.com` |

### Inside `web/` (frontend)
- `app/` — pages & routes (Next.js App Router) + `app/api/` (server routes that proxy to the backend)
- `components/` — UI components (landing sections + the app shell, console, cowork)
- `lib/` — helpers (`lib/server/backend.ts` calls the backend; `lib/mock/` = placeholder data)
- `design-system/` — design tokens · `public/` — logos & static assets

### Inside `execution/` (backend)
- `mrk18_execution/` — the Python package: `api/` (endpoints), `graph/` (LangGraph pipeline),
  `agents/`, `db/` (models), `security/` (auth, token vault, tenant RLS), `publishers/`, `worker/`, `llm/`
- `supabase/migrations/` — the database schema (SQL)
- `tests/` — test suite · `scripts/` — utilities
- `Dockerfile`, `render.yaml` — deploy config (Render) · `pyproject.toml` — Python deps
- `run_dev.py` — run the backend locally · `.env` — secrets (**never committed**)

## ☁️ External services (not in this repo)
- **Database** → Supabase (cloud Postgres)
- **AI brain** → RunPod Serverless (the fine-tuned LoRA adapters)

## 📚 Everything else at the root (NOT the app)
- **Planning & research docs** (`*.md`, `*.pdf`) — strategy/build plans. *(Can be tidied into a `docs/` folder.)*
- **Data & content** — `data/`, `generate/`, `prompts/`, `content_day1-3/`, `social-output/`,
  `infographics/`, `mockups/`, `specs/` — datasets, prompt-generation, content drafts, mockups.

## ▶️ Run locally
```
# Frontend
cd web && npm run dev            # → http://localhost:3000

# Backend
cd execution && .venv\Scripts\python.exe run_dev.py   # → http://127.0.0.1:8000
```
