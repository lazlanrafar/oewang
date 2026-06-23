import asyncpg
from pgvector.asyncpg import register_vector

from app.config import get_settings

# ponytail: raw asyncpg over an ORM — every query here is a simple read-only SELECT
# (the one exception is scripts/seed_knowledge.py which writes the knowledge table).
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


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
