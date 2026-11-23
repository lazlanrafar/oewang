# Concurrency & Async — Python Developer Reference

Sources: [docs.python.org/3/library/asyncio.html](https://docs.python.org/3/library/asyncio.html), [docs.python.org/3/library/concurrent.futures.html](https://docs.python.org/3/library/concurrent.futures.html), roadmap.sh/python

---

## Choosing a Concurrency Model (GIL vs. I/O vs. CPU)

| Workload | Primary Choice | Rationale |
|----------|----------------|-----------|
| **High-concurrency I/O** (thousands of HTTP/DB/WS connections) | `asyncio` | Single-threaded cooperative multitasking, minimal memory overhead, no OS thread races |
| **Moderate I/O / legacy blocking libraries** | `ThreadPoolExecutor` / `asyncio.to_thread` | Releases GIL during OS I/O syscalls; integrates cleanly with sync libraries |
| **CPU-bound** (number crunching, heavy parsing) | `ProcessPoolExecutor` / `multiprocessing` | Bypasses GIL via separate processes (or Python 3.13+ free-threading / subinterpreters) |

---

## Structured Concurrency (`asyncio.TaskGroup`)

In Python 3.11+, always prefer `asyncio.TaskGroup` over `asyncio.gather()`. If any child task fails, sibling tasks are automatically cancelled and exceptions are surfaced via `ExceptionGroup`.

```python
import asyncio

async def fetch_item(item_id: int) -> dict[str, int]:
    await asyncio.sleep(0.1)
    if item_id < 0:
        raise ValueError("negative id")
    return {"id": item_id}

async def process_batch(ids: list[int]) -> list[dict[str, int]]:
    tasks: list[asyncio.Task[dict[str, int]]] = []
    try:
        async with asyncio.TaskGroup() as tg:
            for i in ids:
                tasks.append(tg.create_task(fetch_item(i)))
    except* ValueError as eg:
        for err in eg.exceptions:
            print(f"Validation error: {err}")
        raise
    return [t.result() for t in tasks]
```

---

## Timeouts & Cancellation

Use `asyncio.timeout()` (Python 3.11+) as a context manager:

```python
import asyncio

async def fetch_with_deadline() -> str:
    try:
        async with asyncio.timeout(2.5):
            return await slow_network_call()
    except TimeoutError:
        return "fallback"
```

- **Never swallow `asyncio.CancelledError`!** If you catch `BaseException` or `CancelledError` for cleanup, always re-raise it immediately so task cancellation propagates.

---

## Synchronization & Backpressure (`Semaphore`, `Queue`, `ContextVar`)

```python
import asyncio
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="unknown")

async def bounded_worker(sem: asyncio.Semaphore, url: str) -> None:
    async with sem:  # Cap maximum concurrent requests
        await call_url(url)

async def producer_consumer() -> None:
    queue: asyncio.Queue[int | None] = asyncio.Queue(maxsize=100)

    async def producer() -> None:
        for i in range(10):
            await queue.put(i)
        await queue.put(None)  # poison pill

    async def consumer() -> None:
        while (item := await queue.get()) is not None:
            queue.task_done()
```

---

## Bridging Sync and Async Safely

- **Never call blocking functions (`time.sleep`, `requests.get`, heavy CPU loops) directly inside `async def`**, as they freeze the entire event loop.
- Offload blocking I/O with `await asyncio.to_thread(blocking_fn, arg1)`.
- Offload heavy CPU work with `await loop.run_in_executor(process_pool, cpu_fn, arg1)`.

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor

def heavy_cpu(n: int) -> int:
    return sum(i * i for i in range(n))

async def main() -> None:
    loop = asyncio.get_running_loop()
    with ProcessPoolExecutor() as pool:
        result = await loop.run_in_executor(pool, heavy_cpu, 10_000_000)
```
