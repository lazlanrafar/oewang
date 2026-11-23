---
name: python-developer
description: >-
  Python development skill based on roadmap.sh/python and official docs.python.org/3.
  Enforces idiomatic Python 3.12+: type hints, structural pattern matching, dataclasses,
  async/await, robust error handling, modern packaging (uv/pyproject.toml), and testing
  with pytest. Use whenever creating, reviewing, refactoring, or debugging Python code.
---

# Python Developer Skill

Engineering guidelines based on `roadmap.sh/python` and `docs.python.org/3` (Tutorial, Library Reference, Language Reference, Typing).

> **On-demand deep references in `references/`**:
> - [Language Fundamentals](./references/language-fundamentals.md)
> - [OOP, Protocols & Functional](./references/oop-and-functional.md)
> - [Concurrency & Async](./references/concurrency-and-async.md)
> - [Type System & Testing](./references/type-system-and-testing.md)
> - [Modern Ecosystem](./references/modern-ecosystem.md)
> - [Data Analysis, Visualization & Pipelines](./references/data-analysis-and-pipelines.md)
> - [LLM & Anthropic AI Engineering](./references/llm-and-anthropic-ai.md)

---

## 1. Environment & Packaging (`uv` + PEP 723 / PEP 735)

- Target **Python 3.12+**. Manage Python versions and virtualenvs exclusively via **`uv`**.
- **Never manually activate virtualenvs (`source .venv/bin/activate`) or run `uv pip install`** — use `uv add <pkg>`, `uv remove <pkg>`, and `uv run <cmd>`.
- Define project metadata in **`pyproject.toml`** (PEP 621) and dev/test dependencies in **`[dependency-groups]`** (PEP 735) rather than legacy `[project.optional-dependencies]`.
- For **standalone single-file scripts**, embed **PEP 723 inline script metadata** and execute with `uv run script.py`:

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx>=0.28", "pydantic>=2.10"]
# ///
```

```bash
uv init myproject && cd myproject
uv add fastapi uvicorn              # runtime dependencies
uv add --group dev ruff ty mypy pytest  # PEP 735 dev dependency group
uv run pytest                       # runs inside the managed environment
```

---

## 2. Idiomatic Python (Core Pillar)

- **Explicit over implicit** (PEP 20). Prefer flat, readable code over clever one-liners.
- Prefer **comprehensions** and **generator expressions** over `map`/`filter` with `lambda`.
- Use **f-strings** (`f"{val!r}"`, `f"{val:.2f}"`, `f"{val=}"`), not `%` or `.format()`.
- Use **`pathlib.Path`** instead of `os.path` string manipulation.
- Always use **context managers (`with` / `async with`)** for files, locks, DB sessions, and network sockets.
- Use **`@dataclass(slots=True)`** (or `frozen=True` for value objects) and `NamedTuple` for lightweight records.
- Use **Structural Pattern Matching (`match`/`case`)** when destructuring nested structures or variants.

```python
from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float

def describe(p: Point) -> str:
    match p:
        case Point(x=0, y=0): return "origin"
        case Point(x=0, y=y): return f"y-axis at {y}"
        case Point(x=x, y=0): return f"x-axis at {x}"
        case _: return f"({p.x}, {p.y})"
```

---

## 3. Type Safety (Mandatory)

- **Annotate all function signatures, return values, and class attributes** in production code.
- Use built-in generic and union syntax (`list[str]`, `dict[str, int]`, `X | None`), not legacy `typing.List` or `Optional`.
- Use Python 3.12+ type parameter syntax (`def first[T](items: Sequence[T]) -> T`, `type Alias = ...`).
- Prefer **structural subtyping (`typing.Protocol`)** over deep inheritance hierarchies (`abc.ABC`).
- Enforce **`mypy --strict`** (or `pyright`). Never use bare `# type: ignore` without an error code and reason.
- Validate external untrusted inputs (API bodies, env vars, webhooks) at the boundary with **Pydantic v2**.

```python
from typing import Protocol

class Drawable(Protocol):
    def draw(self) -> None: ...

def render(item: Drawable) -> None:
    item.draw()
```

---

## 4. Error Handling

- **Never swallow exceptions silently** (`except Exception: pass`). Always log, handle specifically, or re-raise.
- Catch the **most specific exception type** possible; only catch `Exception` at top-level boundaries.
- Preserve cause chains with **`raise CustomError("msg") from err`**.
- Use **`contextlib.suppress(SpecificError)`** when intentionally ignoring known benign errors.
- Define a domain base exception (`class AppError(Exception)`) and subclass specific failure modes.
- Use **`ExceptionGroup` and `except*`** (Python 3.11+) when handling concurrent task failures.

```python
class AppError(Exception): ...
class NotFoundError(AppError): ...

def get_user(uid: int) -> User:
    user = db.find(uid)
    if user is None:
        raise NotFoundError(f"user {uid} not found")
    return user
```

---

## 5. Functions & Decorators

- Never use mutable default arguments (`def fn(items: list[int] = [])`); use `None` as sentinel.
- Enforce keyword-only arguments (`*`) for boolean flags or functions with >3 parameters.
- Always preserve metadata with **`@functools.wraps(fn)`** inside decorators.
- Use **`@functools.cache`** / `@functools.lru_cache(maxsize=...)` for memoization.

---

## 6. Data Structures & Standard Library First

- Reach for stdlib before third-party libraries:
  - `collections`: `defaultdict`, `Counter`, `deque` (`O(1)` head/tail queue), `ChainMap`
  - `itertools`: `batched` (3.12+), `chain`, `islice`, `groupby`, `product`, `pairwise`
  - `heapq` for priority queues, `bisect` for binary search on sorted sequences
  - `tomllib` (3.11+) for reading TOML, `secrets` for cryptographic randomness

---

## 7. Async & Concurrency

- **I/O-bound high concurrency**: `asyncio` (`async`/`await`). Never call blocking I/O (`time.sleep`, `requests`, sync DB drivers) directly inside an `async def`.
- **Structured concurrency**: Prefer **`asyncio.TaskGroup`** and **`asyncio.timeout()`** (Python 3.11+) over bare `asyncio.gather()`.
- **Blocking sync calls inside async**: Offload via `await asyncio.to_thread(fn, *args)`.
- **CPU-bound workloads**: Bypass the GIL with `concurrent.futures.ProcessPoolExecutor`.

```python
import asyncio
import httpx

async def fetch_all(urls: list[str]) -> list[str]:
    async with httpx.AsyncClient() as client:
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(client.get(url)) for url in urls]
    return [t.result().text for t in tasks]
```

---

## 8. Testing

- Use **`pytest`** with fixtures (`conftest.py`), `@pytest.mark.parametrize`, and `tmp_path`.
- Name tests descriptively: `test_<unit>_<scenario>_<expected>()`.
- Mock **only at external boundaries** (HTTP, DB, clock, filesystem, third-party SDKs) — never mock internal domain logic.
- Use **`hypothesis`** for property-based testing on parsers, serializers, and mathematical invariants.

---

## 9. Modules, Packages & Layout

- Use the **`src/` layout** (`src/<package_name>/`) with a `py.typed` marker file.
- Keep `__init__.py` minimal; expose only the intended public API via `__all__`.
- Never mutate `sys.path` in production code; install the package in editable mode (`uv pip install -e .`).

---

## 10. Quality Gates

Run before every commit and in CI ([`scripts/verify-python.sh`](./scripts/verify-python.sh)):

```bash
ruff format --check .
ruff check .
mypy . --strict
pytest --cov=src --cov-report=term-missing
```
