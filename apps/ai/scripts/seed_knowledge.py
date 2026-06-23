"""Populate ai_knowledge_chunks from the advisor knowledge markdown.

Usage (from apps/ai): python scripts/seed_knowledge.py
Prereqs: DATABASE_URL + OPENAI_API_KEY set, db:push run, setup-vector run.
Idempotent — deletes existing rows per source before inserting.
"""

import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # apps/ai on path

from app.core.database import close_pool, get_pool  # noqa: E402
from app.core.embeddings import embed  # noqa: E402

KNOWLEDGE_DIR = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "modules"
    / "advisor"
    / "knowledge"
)


def chunk_text(text: str, size: int = 1000, overlap: int = 200) -> list[str]:
    """~1000-char chunks with 200 overlap, snapped to a sentence/line boundary."""
    text = text.strip()
    chunks: list[str] = []
    start, n = 0, len(text)
    while start < n:
        end = min(start + size, n)
        if end < n:
            boundary = max(text.rfind(". ", start, end), text.rfind("\n", start, end))
            if boundary > start + size // 2:
                end = boundary + 1
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks


async def main() -> None:
    files = sorted(KNOWLEDGE_DIR.glob("*.md"))
    if not files:
        print("No knowledge files found in", KNOWLEDGE_DIR)
        return

    pool = await get_pool()
    for f in files:
        source = f.name
        chunks = chunk_text(f.read_text(encoding="utf-8"))
        if not chunks:
            continue
        vectors = embed(chunks)
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM ai_knowledge_chunks WHERE source = $1", source
            )
            for i, (content, vec) in enumerate(zip(chunks, vectors)):
                await conn.execute(
                    """
                    INSERT INTO ai_knowledge_chunks
                        (id, source, content, embedding, chunk_index)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    # ponytail: uuid hex id — column is plain text, cuid2 not enforced
                    uuid.uuid4().hex,
                    source,
                    content,
                    vec,
                    i,
                )
        print(f"seeded {len(chunks)} chunks from {source}")

    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
