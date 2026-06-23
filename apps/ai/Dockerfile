FROM python:3.12-slim

WORKDIR /srv

# Deps first (better layer caching). README is referenced by pyproject.
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install --no-cache-dir .

COPY scripts ./scripts

EXPOSE 3004
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3004"]
