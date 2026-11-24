# OOP, Protocols & Functional Programming — Python Developer Reference

Sources: [docs.python.org/3/reference/datamodel.html](https://docs.python.org/3/reference/datamodel.html), [docs.python.org/3/library/dataclasses.html](https://docs.python.org/3/library/dataclasses.html), [docs.python.org/3/library/functools.html](https://docs.python.org/3/library/functools.html), roadmap.sh/python

---

## Dataclasses & Value Objects

```python
from dataclasses import dataclass, field

# Immutable value object with slots (lower memory footprint, faster attribute access)
@dataclass(frozen=True, slots=True, kw_only=True)
class Money:
    amount: int
    currency: str = "USD"
    tags: list[str] = field(default_factory=list, compare=False)

    def __post_init__(self) -> None:
        if self.amount < 0:
            raise ValueError("amount cannot be negative")
```

- Default to `@dataclass(slots=True)` in Python 3.10+ unless dynamic attributes or complex multiple inheritance are required.
- Always use `field(default_factory=...)` for mutable default values.
- Use `typing.NamedTuple` for lightweight, tuple-compatible immutable records.

---

## Python Data Model (Dunder Methods)

Implement dunder methods only when they match domain semantics:

| Category | Dunder Methods | Purpose |
|----------|----------------|---------|
| Representation | `__repr__`, `__str__`, `__format__` | Unambiguous debugging (`!r`) vs. user display (`!s`) |
| Comparison | `__eq__`, `__lt__` (+ `@functools.total_ordering`) | Equality & ordering |
| Hashing | `__hash__` | Required for `dict` keys / `set` members (only on immutable objects) |
| Containers | `__len__`, `__getitem__`, `__iter__`, `__contains__` | Sequence / mapping protocol |
| Context | `__enter__`, `__exit__`, `__aenter__`, `__aexit__` | `with` / `async with` resource lifecycle |
| Callable | `__call__` | Stateful function objects |

```python
import functools

@functools.total_ordering
class Version:
    def __init__(self, major: int, minor: int) -> None:
        self.major = major
        self.minor = minor

    def __repr__(self) -> str:
        return f"Version({self.major}, {self.minor})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Version):
            return NotImplemented
        return (self.major, self.minor) == (other.major, other.minor)

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, Version):
            return NotImplemented
        return (self.major, self.minor) < (other.major, other.minor)
```

---

## Structural Subtyping (Protocols) vs. ABC

- **Prefer Composition and `typing.Protocol`** over deep inheritance trees.
- Use **`abc.ABC` + `@abstractmethod`** only when sharing concrete base functionality or enforcing instantiation-time checks.
- Apply **`@runtime_checkable`** to a `Protocol` only when runtime `isinstance()` checks are required.

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class Closer(Protocol):
    def close(self) -> None: ...

def cleanup(resource: Closer) -> None:
    resource.close()
```

---

## Properties, Descriptors & Class Methods

```python
class Account:
    def __init__(self, balance: int) -> None:
        self._balance = balance

    @property
    def balance(self) -> int:
        return self._balance

    @classmethod
    def empty(cls) -> "Account":
        return cls(0)

    @staticmethod
    def is_valid_amount(val: int) -> bool:
        return val >= 0
```

- Use `@functools.cached_property` for expensive derived attributes on immutable/read-heavy instances.

---

## Functional Tools (`functools`, `itertools`, `operator`)

```python
import functools
import itertools

# Single-dispatch generic function (clean alternative to visitor boilerplate)
@functools.singledispatch
def serialize(val: object) -> str:
    raise TypeError(f"Unsupported type: {type(val)}")

@serialize.register
def _(val: int) -> str:
    return str(val)

@serialize.register
def _(val: list) -> str:
    return ",".join(map(serialize, val))

# Memoization
@functools.cache
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)

# Itertools recipes
batches = itertools.batched(range(10), 3)  # Python 3.12+: (0,1,2), (3,4,5)...
```
