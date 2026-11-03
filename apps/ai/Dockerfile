# Production image for the AI service.
#
# Two stages so `uv` and the build tooling stay out of the image that runs.
# What ships is a Python runtime, a virtual environment and the application.
#
# This process holds no database credentials and no user token (D3, D4). It
# also refuses to start if DATABASE_URL, JWT_SECRET, S3_SECRET_ACCESS_KEY or
# RESEND_API_KEY reach it, which is a check worth knowing about when
# configuring a deployment: a project-wide shared environment in Coolify
# would stop this container booting, by design (docs/deployment.md).

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS build

WORKDIR /app

ENV UV_LINK_MODE=copy
ENV UV_PROJECT_ENVIRONMENT=/venv
ENV UV_COMPILE_BYTECODE=1

# Dependencies first and from the lockfile only, so a push that changes
# application code does not resolve or reinstall anything.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.13-slim-bookworm AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --uid 10002 oewang

COPY --from=build /venv /venv
ENV PATH="/venv/bin:$PATH"
# Unbuffered, so a crash does not take the last log lines with it.
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY --chown=oewang:oewang app app

USER oewang

EXPOSE 3004

# /health is the one route with no service key, so the probe needs no
# credential (docs/ai/service.md#endpoints).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3004/health || exit 1

# No --reload, and one worker: crypto sessions live in process memory and a
# second worker would hold a different set, so a request landing on the
# wrong one would answer CRYPTO_SESSION_UNKNOWN
# (docs/api/encryption.md, docs/deployment.md). Scale with more containers
# only once sessions live somewhere shared.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3004", "--workers", "1"]
