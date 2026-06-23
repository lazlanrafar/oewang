from contextlib import asynccontextmanager

import asyncpg
from pgvector.asyncpg import register_vector

from app.config import get_settings

# ponytail: raw asyncpg over an ORM — the AI money path writes the same tables the
# Drizzle (TS) schema owns; the schema stays the source of truth, we just INSERT/UPDATE
# against it. Workspace-scoping + soft-delete discipline is enforced per-query.
_pool: asyncpg.Pool | None = None


async def _init_conn(conn: asyncpg.Connection) -> None:
    # Lets us pass/receive python lists for vector(1536) columns.
    await register_vector(conn)


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        url = get_settings().DATABASE_URL
        if not url:
            raise RuntimeError("DATABASE_URL is not set")
        _pool = await asyncpg.create_pool(
            url, min_size=1, max_size=5, init=_init_conn
        )
    return _pool


async def fetch(query: str, *args) -> list[asyncpg.Record]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args) -> asyncpg.Record | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(query, *args)


async def execute(query: str, *args) -> str:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


@asynccontextmanager
async def transaction():
    """Acquire a connection and open a DB transaction. Yields the connection so
    callers run several writes atomically (split_bill, multi-debt). On exception
    asyncpg rolls back."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
