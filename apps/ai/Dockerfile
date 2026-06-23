FROM python:3.12-slim

WORKDIR /srv

# Deps first (better layer caching). README is referenced by pyproject.
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install --no-cache-dir .

COPY scripts ./scripts

# Railway (and most PaaS) inject $PORT — bind to it, falling back to 3004 locally.
# Shell form so ${PORT} is expanded at runtime.
EXPOSE 3004
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3004}"]
