# Type System & Testing — Python Developer Reference

Sources: [docs.python.org/3/library/typing.html](https://docs.python.org/3/library/typing.html), [typing.readthedocs.io](https://typing.readthedocs.io/), roadmap.sh/python

---

## Modern Type Syntax (Python 3.12+ / PEP 695)

Python 3.12 introduces native generic type parameters and `type` aliases without manual `TypeVar` boilerplate:

```python
from collections.abc import Iterable, Sequence

# Native type alias (PEP 695)
type Point = tuple[float, float]
type JsonDict = dict[str, object]

# Generic function
def first[T](items: Sequence[T]) -> T:
    return items[0]

# Generic class with upper bound
class Box[T: (int, float)]:
    def __init__(self, value: T) -> None:
        self.value = value
```

- Accept abstract collections from `collections.abc` (`Sequence`, `Mapping`, `Iterable`) in function parameters.
- Return concrete types (`list[str]`, `dict[str, int]`) from functions.

---

## Advanced Typing (`TypedDict`, `Literal`, `NotRequired`, `Self`, `TypeIs`)

```python
from typing import Literal, NotRequired, Self, TypedDict, TypeIs

# TypedDict for structured dictionary payloads
class UserPayload(TypedDict):
    id: int
    role: Literal["admin", "member"]
    bio: NotRequired[str]  # Python 3.11+

# Type narrowing with TypeIs (Python 3.13+ / typing_extensions)
def is_str_list(val: list[object]) -> TypeIs[list[str]]:
    return all(isinstance(x, str) for x in val)

# Fluent / builder methods with Self (Python 3.11+)
class QueryBuilder:
    def where(self, cond: str) -> Self:
        return self
```

---

## Runtime Validation with Pydantic v2

Standard Python type hints are erased at runtime. Enforce runtime schema validation at trust boundaries (API inputs, config files, env vars, webhooks) with **Pydantic v2**:

```python
from pydantic import BaseModel, ConfigDict, Field

class CreateUserRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-z0-9_]+$")
    age: int = Field(ge=18, le=120)
```

---

## Pytest Architecture & Best Practices

### 1. Fixtures & Dependency Injection
Place shared fixtures in `tests/conftest.py`. Use `yield` for deterministic setup and teardown.

```python
from collections.abc import Iterator
import pytest

@pytest.fixture
def db_session() -> Iterator[Session]:
    session = create_test_session()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
```

### 2. Parametrization & Exception Assertions

```python
import pytest

@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  hello ", "hello"),
        ("", ""),
    ],
)
def test_normalize(raw: str, expected: str) -> None:
    assert normalize(raw) == expected

def test_invalid_input_raises() -> None:
    with pytest.raises(ValueError, match=r"must be positive"):
        parse_amount(-5)
```

### 3. Mocking Only at Trust Boundaries (`monkeypatch` & `unittest.mock`)
- Mock external I/O (clock, environment variables, HTTP calls, third-party APIs).
- Do not mock internal domain functions; test their real behavior directly.

```python
def test_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    assert get_env() == "production"
```
