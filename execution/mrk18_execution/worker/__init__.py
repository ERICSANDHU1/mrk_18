"""C3 — ARQ background worker (run auto-resume + scheduled maintenance).

Optional: the API never imports this package, and `arq` is an optional extra, so
nothing here can affect the web process. Run with `python -m mrk18_execution.worker`
(or `arq mrk18_execution.worker.main.WorkerSettings`). Needs REDIS_URL.
"""
