# ── Stage 1 : builder ────────────────────────────────────────────────────────
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Copy only dependency files first for caching
COPY apps/agent/uv.lock apps/agent/pyproject.toml ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# Copy agent source
COPY apps/agent/ .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ── Stage 2 : runtime ────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/app   /app/app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=0

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--log-level", "info"]
