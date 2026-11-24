# Language Fundamentals — Python Developer Reference

Sources: [docs.python.org/3/tutorial](https://docs.python.org/3/tutorial/), [docs.python.org/3/reference](https://docs.python.org/3/reference/), roadmap.sh/python

---

## Variables & Built-in Types

| Type | Literal | Notes |
|------|---------|-------|
| `int` | `42`, `0xFF`, `0b1010` | Arbitrary precision |
| `float` | `3.14`, `1e-10` | IEEE 754 double |
| `complex` | `3+4j` | Real + imaginary |
| `bool` | `True`, `False` | Subclass of `int` |
| `str` | `"hello"`, `f"{x!r}"` | Immutable, Unicode |
| `bytes` | `b"data"` | Immutable byte sequence |
| `bytearray` | `bytearray(b"data")` | Mutable bytes |
| `None` | `None` | Singleton null |

**Walrus operator** (`:=`, PEP 572) — assign inside an expression:
```python
while chunk := f.read(8192):
    process(chunk)

if m := re.match(r"\d+", text):
    print(m.group())
```

---

## Strings

```python
# f-string formatting (3.12: f"{val=}" debug shorthand)
name = "Alice"
pi = 3.14159
f"{name!r}"          # 'Alice'
f"{pi:.2f}"          # '3.14'
f"{name=}"           # "name='Alice'"  ← debug

# Multiline
sql = (
    "SELECT *"
    " FROM users"
    " WHERE active = 1"
)

# str methods
"hello world".title()         # 'Hello World'
"  spaces  ".strip()          # 'spaces'
"a,b,c".split(",")            # ['a', 'b', 'c']
",".join(["a", "b", "c"])     # 'a,b,c'
"hello".removeprefix("hel")   # 'lo' (3.9+)
```

---

## Control Flow

```python
# Ternary
result = "yes" if condition else "no"

# match/case — structural pattern matching (3.10+)
match command.split():
    case ["quit"]:
        quit()
    case ["go", direction]:
        go(direction)
    case ["get", obj] if obj in room.items:
        pick_up(obj)
    case _:
        print("unknown command")

# for/else — else runs if loop didn't break
for item in items:
    if pred(item):
        break
else:
    print("not found")
```

---

## Comprehensions

```python
# list
squares = [x**2 for x in range(10) if x % 2 == 0]

# dict
word_len = {w: len(w) for w in words}

# set
unique_lens = {len(w) for w in words}

# generator (lazy — preferred for large data)
total = sum(x**2 for x in range(1_000_000))

# nested (matrix transpose)
transposed = [[row[i] for row in matrix] for i in range(4)]
```

---

## Functions

```python
# Positional-only (/) and keyword-only (*) params
def foo(pos_only, /, normal, *, kw_only):
    ...

# Default mutable argument — classic gotcha: use None sentinel
def append_to(item, lst=None):
    if lst is None:
        lst = []
    lst.append(item)
    return lst

# Unpacking
def point(x, y, z=0): ...
coords = {"x": 1, "y": 2}
point(**coords)

first, *rest = [1, 2, 3, 4]  # first=1, rest=[2,3,4]
a, b, *_ = range(10)          # a=0, b=1
```

---

## Generators & Iterators

```python
# Generator function — yield suspends execution
def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

# Generator as pipeline (memory-efficient)
lines = (line.strip() for line in open("data.txt"))
non_empty = (l for l in lines if l)
words = (w for line in non_empty for w in line.split())

# send() / throw() / close() on generators
def accumulator():
    total = 0
    while True:
        value = yield total
        if value is None:
            break
        total += value

# yield from — delegate to sub-generator
def chain(*iterables):
    for it in iterables:
        yield from it
```

---

## Context Managers

```python
# Custom context manager via class
class Timer:
    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.elapsed = time.perf_counter() - self.start
        return False  # don't suppress exceptions

# Custom via contextlib.contextmanager
from contextlib import contextmanager

@contextmanager
def managed_resource():
    resource = acquire()
    try:
        yield resource
    finally:
        release(resource)

# contextlib.suppress
from contextlib import suppress
with suppress(FileNotFoundError):
    os.remove("temp.txt")
```

---

## Modules & Packages

```
mypackage/
├── __init__.py      # minimal — expose public API only
├── __main__.py      # python -m mypackage entry point
├── core.py
├── utils.py
└── _internal.py     # underscore = private convention
```

```python
# __init__.py — selective re-export
from .core import MainClass
from .utils import helper_fn
__all__ = ["MainClass", "helper_fn"]

# Lazy import (avoid circular, speed up startup)
def get_heavy_module():
    import heavy_module
    return heavy_module
```

---

## Built-in Functions Worth Knowing

```python
# Iteration helpers
sorted(items, key=lambda x: x.priority, reverse=True)
min(items, key=attrgetter("score"))
all(x > 0 for x in nums)   # short-circuits
any(x > 0 for x in nums)   # short-circuits
zip(a, b, strict=True)      # 3.10+ strict=True raises if lengths differ
enumerate(items, start=1)

# Introspection
vars(obj)        # obj.__dict__
dir(obj)         # all attributes
isinstance(x, (int, float))
issubclass(Child, Parent)
```
