# syntax=docker/dockerfile:1
# MRK18 Execution API — multi-stage build (C1).
# Build:  docker build -t mrk18-execution .
# Run:    docker run --env-file .env -p 8000:8000 mrk18-execution
# The same image runs the worker: override CMD with `python -m mrk18_execution.worker`.

# ── builder ──────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder
ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:$PATH"
WORKDIR /app
RUN python -m venv /opt/venv && pip install --upgrade pip
# install deps first (cached layer), then the package
COPY pyproject.toml ./
COPY mrk18_execution ./mrk18_execution
RUN pip install ".[worker,observability]"

# ── runtime ──────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8000
WORKDIR /app
# run as a non-root user
RUN useradd --create-home --uid 10001 appuser
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app/mrk18_execution ./mrk18_execution
COPY supabase ./supabase
USER appuser
EXPOSE 8000

# Container healthcheck hits the public /health (no auth, no DB).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request,sys; \
sys.exit(0) if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health', timeout=4).status==200 else sys.exit(1)"

# uvicorn with the app factory; $PORT is injected by the platform (Render sets it).
CMD ["sh", "-c", "uvicorn mrk18_execution.api.app:create_app --factory --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
