# Modern Ecosystem — Python Developer Reference

Sources: [docs.python.org/3/library/](https://docs.python.org/3/library/), [packaging.python.org](https://packaging.python.org/), roadmap.sh/python

---

## Library Selection Standards

Prefer the Python standard library first. When a third-party package is justified, use modern ecosystem defaults:

| Need | Stdlib (Prefer First) | Modern Ecosystem Default | Avoid / Legacy |
|------|-----------------------|--------------------------|----------------|
| **Package & Env** | `venv` | **`uv`** (`uv add`, `uv run`, PEP 723/735, `uv_build`) | `pipenv`, `poetry`, `setup.py`, manual `venv` activation |
| **Linter & Formatter** | — | **`ruff`** + **`prek`** (Rust-native pre-commit) | `flake8`, separate `black` + `isort`, `yapf` |
| **Type Checker** | — | **`ty`** (Astral) / **`mypy --strict`** / **`pyright`** | Untyped code |
| **Testing** | `unittest` | **`pytest`** + `hypothesis` | `nose` |
| **Paths & Files** | **`pathlib`**, `shutil`, `tempfile` | — | `os.path` string concatenation |
| **TOML Config** | **`tomllib`** (3.11+ read-only) | `tomli-w` (write) | Legacy `toml` |
| **Data Validation** | `dataclasses` | **`pydantic` v2**, `msgspec` | `marshmallow` (for new projects) |
| **HTTP Client** | `urllib.request` | **`httpx`** (sync + async) | `urllib2`, blocking `requests` inside async |
| **Web API / Server** | `wsgiref` | **`FastAPI`** / **`Litestar`** (API), **`Django`** (Full-stack) | `Flask` for pure async APIs |
| **Database / ORM** | **`sqlite3`** | **`SQLAlchemy 2.0`** (async), `psycopg` v3, `alembic` | Legacy SQLAlchemy 1.x `session.query()` |
| **CLI** | **`argparse`** | **`typer`** / `click` / `rich` | `optparse` |
| **Data & Analytics** | `statistics`, `decimal` | **`polars`**, `numpy`, `duckdb` | Pure Python loops over millions of rows |

---

## Project Layout (`src/` layout & `pyproject.toml`)

Use the `src/` layout so tests always run against the installed package rather than accidentally importing local working directory files:

```
myproject/
├── pyproject.toml
├── README.md
├── src/
│   └── myproject/
│       ├── __init__.py
│       ├── py.typed        # PEP 561 marker so type checkers read package annotations
│       └── main.py
└── tests/
    ├── conftest.py
    └── test_main.py
```

Production `pyproject.toml` template:

```toml
[project]
name = "myproject"
version = "0.1.0"
description = "Production Python service"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.6.0",
    "httpx>=0.28.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=6.0.0",
    "mypy>=1.13.0",
    "ruff>=0.8.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "UP", "I", "B", "SIM", "PTH", "RUF"]

[tool.mypy]
python_version = "3.12"
strict = true
```

---

## Observability & Structured Logging

- Never use `print()` in production services. Use the standard `logging` module or `structlog`.
- Use `%s` lazy formatting in `logging` calls (`logger.info("user %s logged in", user_id)`) or structured `extra` dicts to avoid unnecessary string interpolation when a log level is disabled.

```python
import logging

logger = logging.getLogger(__name__)

def process_order(order_id: str) -> None:
    logger.info("processing order", extra={"order_id": order_id})
```

---

## Security & Cryptography (`secrets`, SQL Injection, Subprocess)

1. **Tokens & Randomness**: Never use the `random` module for security tokens, OTPs, or passwords. Always use **`secrets`**:
   ```python
   import secrets
   token = secrets.token_urlsafe(32)
   is_valid = secrets.compare_digest(a, b)  # constant-time comparison
   ```
2. **Subprocesses**: Always invoke `subprocess.run(["cmd", arg1], check=True)` with an explicit argument list; **never use `shell=True`** with user-controlled input.
3. **Deserialization**: Never call `pickle.loads()` or unsafe `yaml.load()` (use `yaml.safe_load()`) on untrusted data.
4. **SQL Queries**: Always use parameterized queries (`cursor.execute("SELECT * FROM t WHERE id = ?", (uid,))`); never interpolate SQL via f-strings.
