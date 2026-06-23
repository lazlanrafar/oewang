from app.core.database import fetch
from app.core.embeddings import embed_one


async def search(
    question: str, k: int = 4, min_similarity: float = 0.3
) -> list[dict]:
    """Cosine search over ai_knowledge_chunks. Returns chunks above the threshold."""
    vec = embed_one(question)
    rows = await fetch(
        """
        SELECT source, content, 1 - (embedding <=> $1) AS similarity
        FROM ai_knowledge_chunks
        ORDER BY embedding <=> $1
        LIMIT $2
        """,
        vec,
        k,
    )
    return [
        {
            "source": r["source"],
            "content": r["content"],
            "similarity": float(r["similarity"]),
        }
        for r in rows
        if float(r["similarity"]) >= min_similarity
    ]
